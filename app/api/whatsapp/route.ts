// app/api/whatsapp/route.ts
//
// WhatsApp Cloud API webhook.
//   GET  -> Meta's one-time verification handshake
//   POST -> incoming messages and status updates
//
// Requires in .env.local:
//   WHATSAPP_VERIFY_TOKEN     (any random string you invent)
//   WHATSAPP_ACCESS_TOKEN     (temporary 24h token for now)
//   WHATSAPP_PHONE_NUMBER_ID  (from the app dashboard)

const GRAPH_VERSION = "v26.0"; // check your app dashboard for the current version

// ---------------------------------------------------------------
// GET — webhook verification
// Meta calls this once when you save the webhook URL. It sends
// hub.challenge and expects it echoed back as PLAIN TEXT, not JSON.
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
// POST — incoming events
// Must return 200 quickly. If Meta doesn't get a 200 in a couple of
// seconds it retries, and you end up replying twice.
// ---------------------------------------------------------------
export async function POST(req: Request) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Log the whole payload while you're learning its shape.
  console.log("webhook payload:", JSON.stringify(body, null, 2));

  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;

    // Delivery receipts arrive here too (value.statuses) with no
    // messages array. Ignore those — only act on real messages.
    const message = value?.messages?.[0];

    if (message) {
      const from = message.from; // sender's number in international format

      if (message.type === "text") {
        const incoming = message.text.body;
        await sendText(from, `Got it: ${incoming}`);
      } else {
        await sendText(from, `Received a ${message.type} message.`);
      }
    }
  } catch (err) {
    // Swallow errors — never let a bad payload stop the 200 below,
    // or Meta will retry the same message forever.
    console.error("handler error:", err);
  }

  return new Response("OK", { status: 200 });
}

// ---------------------------------------------------------------
// Send a plain text message back
// ---------------------------------------------------------------
async function sendText(to: string, body: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  if (!res.ok) {
    console.error("send failed:", res.status, await res.text());
  }
}