// lib/conversation.ts
//
// Conversation memory, in Neon Postgres.
//
// One table, `messages`, holding every side of every thread: the customer,
// the bot, and clinic staff replying from the dashboard. A thread is
// identified by (business_phone_id, customer_wa_id) — the business's own
// WhatsApp number plus the customer's. The business half of that key is
// what will make this multi-tenant later; today it's always the one number
// in WHATSAPP_PHONE_NUMBER_ID.
//
// Requires in .env.local and in Vercel:
//   DATABASE_URL   (Neon -> Connection Details -> pooled connection string)

import { neon } from "@neondatabase/serverless";

// What the model sees: it only knows "the customer" and "us".
export type Turn = {
  role: "user" | "assistant";
  content: string;
};

// What the database and dashboard see. `staff` is a person at the clinic
// replying from the dashboard.
export type Role = "user" | "assistant" | "staff";

export type ThreadMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: string; // ISO
};

// How much of the past to feed the model. Twenty messages is roughly ten
// exchanges — enough to finish a booking, small enough to stay cheap.
const HISTORY_LIMIT = 20;

// WhatsApp itself closes the free service window after 24h, so anything
// older is a new conversation as far as the customer is concerned.
const HISTORY_HOURS = 24;

// WhatsApp's customer-service window: free-form messages to a customer are
// allowed only within 24h of THEIR last message. Past that, Meta accepts
// approved templates only, and a plain text send fails.
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function withinServiceWindow(lastCustomerMessage: Date | null): boolean {
  return (
    lastCustomerMessage !== null &&
    Date.now() - lastCustomerMessage.getTime() < SERVICE_WINDOW_MS
  );
}

function db() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    // Same reasoning as the app secret: fail loudly, because the symptom
    // downstream is just an agent with amnesia.
    throw new Error("DATABASE_URL is not set");
  }

  return neon(url);
}

// ---------------------------------------------------------------
// Record an inbound message.
//
// Returns false if Meta has sent us this message id before, which means
// this is a retry and somebody else already answered it. The unique index
// on wa_message_id does the work; we just read the row count.
//
// The `where wa_message_id is not null` on the conflict clause is not
// decoration — the index is partial, and Postgres will not match it from
// the column name alone. Drop it and every insert raises "no unique or
// exclusion constraint matching the ON CONFLICT specification".
// ---------------------------------------------------------------
export async function recordInbound(
  businessPhoneId: string,
  customerWaId: string,
  content: string,
  waMessageId: string
): Promise<boolean> {
  const sql = db();

  const rows = await sql`
    insert into messages (business_phone_id, customer_wa_id, role, content, wa_message_id)
    values (${businessPhoneId}, ${customerWaId}, 'user', ${content}, ${waMessageId})
    on conflict (wa_message_id) where wa_message_id is not null do nothing
    returning id
  `;

  return rows.length > 0;
}

// ---------------------------------------------------------------
// Record what the bot said back. No wa_message_id — these are ours, and
// Meta never replays them at us.
// ---------------------------------------------------------------
export async function recordOutbound(
  businessPhoneId: string,
  customerWaId: string,
  content: string
): Promise<void> {
  const sql = db();

  await sql`
    insert into messages (business_phone_id, customer_wa_id, role, content)
    values (${businessPhoneId}, ${customerWaId}, 'assistant', ${content})
  `;
}

// ---------------------------------------------------------------
// Record a reply a person at the clinic sent from the dashboard.
// ---------------------------------------------------------------
export async function recordStaff(
  businessPhoneId: string,
  customerWaId: string,
  content: string
): Promise<void> {
  const sql = db();

  await sql`
    insert into messages (business_phone_id, customer_wa_id, role, content)
    values (${businessPhoneId}, ${customerWaId}, 'staff', ${content})
  `;
}

// ---------------------------------------------------------------
// The last HISTORY_LIMIT turns, oldest first — for the model.
//
// Newest-first in SQL so the index and the LIMIT do the work, then
// reversed in memory — the model needs them in chronological order.
//
// Staff replies are handed to the model as its own turns. From the
// customer's side the clinic said them, so when the bot resumes it has to
// know what was already promised, and must not ask for a name staff
// already took.
// ---------------------------------------------------------------
export async function loadHistory(
  businessPhoneId: string,
  customerWaId: string
): Promise<Turn[]> {
  const sql = db();

  const rows = await sql`
    select role, content
    from messages
    where business_phone_id = ${businessPhoneId}
      and customer_wa_id = ${customerWaId}
      and created_at > now() - make_interval(hours => ${HISTORY_HOURS})
    order by created_at desc, id desc
    limit ${HISTORY_LIMIT}
  `;

  return rows.reverse().map((r) => ({
    role: r.role === "user" ? "user" : "assistant",
    content: String(r.content),
  }));
}

// ---------------------------------------------------------------
// The whole thread, oldest first — for the dashboard. Unlike
// loadHistory this ignores the 24h cut-off: staff want to see what
// happened last week too.
// ---------------------------------------------------------------
export async function loadThread(
  businessPhoneId: string,
  customerWaId: string,
  limit = 100
): Promise<ThreadMessage[]> {
  const sql = db();

  const rows = await sql`
    select id, role, content, created_at
    from messages
    where business_phone_id = ${businessPhoneId}
      and customer_wa_id = ${customerWaId}
    order by created_at desc, id desc
    limit ${limit}
  `;

  return rows.reverse().map((r) => ({
    id: String(r.id),
    role: r.role as Role,
    content: String(r.content),
    // The driver may hand back a Date or a string; normalise either.
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

// ---------------------------------------------------------------
// When the customer last wrote. Decides whether staff can still send a
// free-form reply (see withinServiceWindow).
// ---------------------------------------------------------------
export async function lastCustomerMessageAt(
  businessPhoneId: string,
  customerWaId: string
): Promise<Date | null> {
  const sql = db();

  const rows = await sql`
    select max(created_at) as last
    from messages
    where business_phone_id = ${businessPhoneId}
      and customer_wa_id = ${customerWaId}
      and role = 'user'
  `;

  const last = rows[0]?.last;

  return last ? new Date(last) : null;
}
