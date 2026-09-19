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
import { generateReply } from "@/lib/llm";
import {
  recordInbound,
  recordOutbound,
  loadHistory,
} from "@/lib/conversation";

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

    console.log(`[${from}] ${message.type}:`, message.text?.body ?? "(non-text)");

    await markAsRead(message.id);

    if (message.type !== "text" || !message.text?.body) {
      await sendText(
        from,
        "I can only read text messages right now. Could you type it out?"
      );
      return;
    }

    // Which of our numbers this arrived on. Always the same one today; the
    // thread key is built for the day it isn't.
    const businessPhoneId =
      value?.metadata?.phone_number_id ??
      process.env.WHATSAPP_PHONE_NUMBER_ID ??
      "unknown";

    // Writing the message is also how we detect a duplicate: the unique
    // index on wa_message_id rejects the second copy. Meta retries when a
    // 200 is slow, and without this the customer gets answered twice.
    const isNew = await recordInbound(
      businessPhoneId,
      from,
      message.text.body,
      message.id
    );

    if (!isNew) {
      console.log(`[${from}] duplicate ${message.id} — already handled`);
      return;
    }

    // Includes the message just written, as the final turn.
    const history = await loadHistory(businessPhoneId, from);

    const reply = await generateReply(history);

    await sendText(from, reply);
    await recordOutbound(businessPhoneId, from, reply);
  } catch (err) {
    console.error("handler error:", err);
  }
}
