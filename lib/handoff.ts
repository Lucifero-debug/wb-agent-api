// lib/handoff.ts
//
// The "staff has taken over this chat" switch.
//
// While a conversation is paused, the webhook still records every
// customer message (so staff see it in the dashboard) but the bot does not
// reply. Staff pause a chat with the "Take over" button, and sending a
// reply from the dashboard pauses it automatically — two voices answering
// the same customer is the thing to avoid.
//
// A pause is a deadline, not a flag: it lapses after PAUSE_HOURS on its
// own. The receptionist who took over at 6pm and went home without
// clicking "Hand back" must not leave that customer talking to nobody.

import "server-only";

import { neon } from "@neondatabase/serverless";

export const PAUSE_HOURS = 12;

function db() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  return neon(url);
}

// ---------------------------------------------------------------
// When the current pause ends, or null if the bot is replying.
// ---------------------------------------------------------------
export async function pausedUntil(
  businessPhoneId: string,
  customerWaId: string
): Promise<Date | null> {
  const sql = db();

  const rows = await sql`
    select paused_until
    from conversations
    where business_phone_id = ${businessPhoneId}
      and customer_wa_id = ${customerWaId}
      and paused_until > now()
  `;

  const until = rows[0]?.paused_until;

  return until ? new Date(until) : null;
}

export async function isBotPaused(
  businessPhoneId: string,
  customerWaId: string
): Promise<boolean> {
  return (await pausedUntil(businessPhoneId, customerWaId)) !== null;
}

// ---------------------------------------------------------------
// Pause, or extend an existing pause, for PAUSE_HOURS from now.
// ---------------------------------------------------------------
export async function pauseBot(
  businessPhoneId: string,
  customerWaId: string
): Promise<void> {
  const sql = db();

  await sql`
    insert into conversations (business_phone_id, customer_wa_id, paused_until)
    values (${businessPhoneId}, ${customerWaId},
            now() + make_interval(hours => ${PAUSE_HOURS}))
    on conflict (business_phone_id, customer_wa_id) do update set
      paused_until = excluded.paused_until,
      updated_at   = now()
  `;
}

// ---------------------------------------------------------------
// Hand the chat back to the bot. The next customer message gets an AI
// reply, built on a history that includes whatever staff said.
// ---------------------------------------------------------------
export async function resumeBot(
  businessPhoneId: string,
  customerWaId: string
): Promise<void> {
  const sql = db();

  await sql`
    update conversations
    set paused_until = null, updated_at = now()
    where business_phone_id = ${businessPhoneId}
      and customer_wa_id = ${customerWaId}
  `;
}
