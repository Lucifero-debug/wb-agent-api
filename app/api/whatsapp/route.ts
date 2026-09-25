// app/api/whatsapp/route.ts
//
// WhatsApp Cloud API webhook.
//   GET  -> Meta's one-time verification handshake
//   POST -> incoming messages and status updates
//
// Requires in .env.local AND in Vercel env vars:
//   WHATSAPP_VERIFY_TOKEN     (any random string you invent)
//   WHATSAPP_APP_SECRET       (App Settings -> Basic -> App Secret)
//   WHATSAPP_ACCESS_TOKEN     (temporary 24h token, or a permanent one)
//   WHATSAPP_PHONE_NUMBER_ID  (from the app dashboard)
//   GEMINI_API_KEY            (aistudio.google.com/apikey)
//   DATABASE_URL              (Neon pooled connection string)

import crypto from "crypto";
import { waitUntil } from "@vercel/functions";
import { sendText, markAsRead } from "@/lib/whatsapp";
import { generateReply, extractLead, FALLBACK_REPLY } from "@/lib/llm";
import {
  recordInbound,
  recordOutbound,
  loadHistory,
} from "@/lib/conversation";
import { upsertLead, worthFollowingUp } from "@/lib/leads";
import { isBotPaused } from "@/lib/handoff";
import { sendLeadAlert } from "@/lib/alerts";

// ---------------------------------------------------------------
// Signature check — confirms the request really came from Meta
// ---------------------------------------------------------------
function validSignature(raw: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;

  if (!secret) {
    // Loud, because otherwise every message silently 403s and the logs
    // tell you nothing.
    console.error("WHATSAPP_APP_SECRET is not set — rejecting all webhooks");
    return false;
  }

  if (!header) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(header);

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------
// Only the slice of Meta's payload we actually read. The real shape is
// much larger and shifts between Graph versions, so everything below the
// top level is optional and checked at runtime.
// ---------------------------------------------------------------
type WebhookBody = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: {
          id: string;
          from: string;
          type: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
};

// ---------------------------------------------------------------
// GET — webhook verification
// Meta sends hub.challenge and expects it echoed back as PLAIN TEXT.
// ---------------------------------------------------------------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

// ---------------------------------------------------------------
// POST — acknowledge instantly, think afterwards
//
// The model takes a few seconds. Meta wants a 200 in about two, and
// retries if it doesn't get one — which is how you end up replying twice.
// So we return immediately and hand the real work to waitUntil, which
// keeps the serverless function alive after the response has been sent.
// ---------------------------------------------------------------
export async function POST(req: Request) {
  // Must read the raw text BEFORE parsing — the signature is computed
  // over the exact bytes Meta sent.
  const raw = await req.text();

  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: WebhookBody;

  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  waitUntil(handleWebhook(body));

  return new Response("OK", { status: 200 });
}

// ---------------------------------------------------------------
// The actual work, running after the 200 has gone back to Meta
// ---------------------------------------------------------------
async function handleWebhook(body: WebhookBody) {
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    // Delivery receipts (value.statuses) arrive here too — ignore them.
    if (!message) return;

    const from = message.from; // sender's number, international format

    const text =
      message.type === "text" && message.text?.body ? message.text.body : null;

    console.log(`[${from}] ${message.type}:`, text ?? "(non-text)");

    await markAsRead(message.id);

    // Which of our numbers this arrived on. Always the same one today; the
    // thread key is built for the day it isn't.
    const businessPhoneId =
      value?.metadata?.phone_number_id ??
      process.env.WHATSAPP_PHONE_NUMBER_ID ??
      "unknown";

    // Writing the message is also how we detect a duplicate: the unique
    // index on wa_message_id rejects the second copy. Meta retries when a
    // 200 is slow, and without this the customer gets answered twice.
    //
    // Voice notes and photos are recorded too, as a placeholder, so staff
    // looking at the thread can see that one arrived — even though the
    // bot cannot read it yet.
    const isNew = await recordInbound(
      businessPhoneId,
      from,
      text ?? `[${message.type} message]`,
      message.id
    );

    if (!isNew) {
      console.log(`[${from}] duplicate ${message.id} — already handled`);
      return;
    }

    // Staff has taken over this chat from the dashboard. The message is
    // saved above, so it shows up in their thread view; the bot stays
    // quiet so the customer never gets two voices answering at once.
    if (await isBotPaused(businessPhoneId, from)) {
      console.log(`[${from}] bot paused — staff is handling this chat`);
      return;
    }

    if (text === null) {
      await sendText(
        from,
        "I can only read text messages right now. Could you type it out?"
      );
      return;
    }

    // Includes the message just written, as the final turn.
    const history = await loadHistory(businessPhoneId, from);

    const reply = await generateReply(history);

    if (reply === null) {
      // The model failed. The customer still hears something, but the
      // fallback stays out of history — otherwise the next reply is built
      // on top of our own error message. Skip extraction too: there is no
      // new exchange to extract from.
      console.error(`[${from}] no reply generated — sending fallback`);
      await sendText(from, FALLBACK_REPLY);
      return;
    }

    console.log(`[${from}] reply:`, reply);

    const delivered = await sendText(from, reply);

    // Only remember what the customer actually received. A reply Meta
    // rejected never reached them, so the model must not think it said it.
    if (delivered) {
      await recordOutbound(businessPhoneId, from, reply);
    } else {
      console.error(`[${from}] reply not delivered — not saved to history`);
    }

    // The customer has their answer by now, so this costs them nothing.
    // Runs even when delivery failed: what the customer TOLD us is still
    // true, and the clinic still wants the lead. The undelivered reply is
    // left out of the transcript so extraction only sees what happened.
    // Its own try/catch: a failed extraction loses one lead, and must not
    // take the rest of the handler down with it.
    try {
      const draft = await extractLead(
        delivered ? [...history, { role: "assistant", content: reply }] : history
      );

      if (draft && worthFollowingUp(draft)) {
        const event = await upsertLead(businessPhoneId, from, draft);
        console.log(`[${from}] lead${event ? ` (${event})` : ""}:`, draft);

        // Only new leads, returning customers and fresh complaints wake a
        // human up. Never throws — sendLeadAlert catches its own errors.
        if (event) {
          await sendLeadAlert(event, from, draft);
        }
      } else if (draft) {
        console.log(`[${from}] not a lead yet (${draft.intent}, no name or time)`);
      }
    } catch (err) {
      console.error("lead capture failed:", err);
    }
  } catch (err) {
    console.error("handler error:", err);
  }
}
