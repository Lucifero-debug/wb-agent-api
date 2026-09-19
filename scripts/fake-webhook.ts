// scripts/fake-webhook.ts
//
// Sends this app a webhook that looks like it came from Meta, signed with
// WHATSAPP_APP_SECRET so it passes the signature check. The whole pipeline
// runs — signature, dedup, conversation memory, reply, lead extraction —
// without Meta, a phone, or a working access token.
//
// Outbound delivery will fail with a 401 unless WHATSAPP_ACCESS_TOKEN is
// current. That is expected and affects nothing else: the reply is still
// generated, still stored, and still shows up in the dev server log.
//
// Run the dev server in another terminal first, then:
//
//   npm run fake -- "cleaning ka rate kya hai"
//   npm run fake -- "hi" --from 919800000001    a different customer
//   npm run fake -- "hi" --replay               twice with one id, to prove dedup
//   npm run fake -- --non-text                  the "text only please" branch
//   npm run fake -- "hi" --url https://your-app.vercel.app
//
// Watch the dev server terminal for the reply — it is printed there, not
// here, because the handler runs after the 200 has already come back.

import crypto from "crypto";

// ---------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------
const argv = process.argv.slice(2);

function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}

function option(name: string, fallback: string): string {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}

// The first bare argument is the message. Anything starting with -- is a
// flag, and the value after a value-taking flag is not the message either.
const valueFlags = ["from", "url", "id"];

function positional(): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      if (valueFlags.includes(arg.slice(2))) i++; // skip its value
      continue;
    }
    return arg;
  }
}

const message = positional() ?? "hello";
const from = option("from", "919812345678");
const baseUrl = option("url", "http://localhost:3000");
const nonText = flag("non-text");
const replay = flag("replay");

// A fixed id makes the same message look like a Meta retry. Otherwise each
// send is a genuinely new message.
const messageId = option("id", `wamid.FAKE.${Date.now()}`);

// ---------------------------------------------------------------
// Payload — the slice of Meta's envelope the route actually reads
// ---------------------------------------------------------------
function buildBody(): string {
  const base = {
    id: messageId,
    from,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };

  const msg = nonText
    ? { ...base, type: "image", image: { id: "fake-image-id", mime_type: "image/jpeg" } }
    : { ...base, type: "text", text: { body: message } };

  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "FAKE_WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "919999999999",
                phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID,
              },
              contacts: [{ wa_id: from, profile: { name: "Test Customer" } }],
              messages: [msg],
            },
          },
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------
// Send
// ---------------------------------------------------------------
async function send(body: string, secret: string, label: string) {
  const signature =
    "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

  const res = await fetch(`${baseUrl}/api/whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": signature,
    },
    body,
  });

  console.log(`${label}  ${res.status} ${await res.text()}`);
}

async function main() {
  const secret = process.env.WHATSAPP_APP_SECRET;

  if (!secret) {
    console.error(
      "WHATSAPP_APP_SECRET is not set — the app would reject this anyway.\n" +
        "Meta App Dashboard -> App settings -> Basic -> App secret."
    );
    process.exit(1);
  }

  const body = buildBody();

  console.log(`-> ${baseUrl}/api/whatsapp`);
  console.log(`   from ${from}`);
  console.log(`   ${nonText ? "(image message)" : JSON.stringify(message)}`);
  console.log(`   id ${messageId}`);
  console.log();

  await send(body, secret, "send  ");

  if (replay) {
    // Meta retries when a 200 is slow. The second copy must be recognised
    // and dropped — look for "duplicate ... already handled" in the dev
    // server log, and confirm the customer is not answered twice.
    console.log("\nwaiting 6s, then replaying the same message id…\n");
    await new Promise((r) => setTimeout(r, 6000));
    await send(body, secret, "replay");
  }

  console.log("\nThe reply is printed by the dev server, not here.");
}

main().catch((err) => {
  // A connection refused here almost always means the dev server is not up.
  console.error("failed:", err);
  process.exit(1);
});
