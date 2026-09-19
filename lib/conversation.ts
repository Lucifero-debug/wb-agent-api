// lib/conversation.ts
//
// Conversation memory, in Neon Postgres.
//
// One table, `messages`, holding both sides of every thread. A thread is
// identified by (business_phone_id, customer_wa_id) — the business's own
// WhatsApp number plus the customer's. The business half of that key is
// what will make this multi-tenant later; today it's always the one number
// in WHATSAPP_PHONE_NUMBER_ID.
//
// Requires in .env.local and in Vercel:
//   DATABASE_URL   (Neon -> Connection Details -> pooled connection string)

import { neon } from "@neondatabase/serverless";

export type Turn = {
  role: "user" | "assistant";
  content: string;
};

// How much of the past to feed the model. Twenty messages is roughly ten
// exchanges — enough to finish a booking, small enough to stay cheap.
const HISTORY_LIMIT = 20;

// WhatsApp itself closes the free service window after 24h, so anything
// older is a new conversation as far as the customer is concerned.
const HISTORY_HOURS = 24;

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
// Record what we said back. No wa_message_id — these are ours, and Meta
// never replays them at us.
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
// The last HISTORY_LIMIT turns, oldest first.
//
// Newest-first in SQL so the index and the LIMIT do the work, then
// reversed in memory — the model needs them in chronological order.
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

  return rows.reverse() as Turn[];
}
