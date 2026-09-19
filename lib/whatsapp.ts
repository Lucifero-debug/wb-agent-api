// lib/whatsapp.ts
//
// Everything that talks to the WhatsApp Cloud API.

const GRAPH_VERSION = "v26.0"; // check your app dashboard for the current version

function endpoint() {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function sendText(to: string, body: string) {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: headers(),
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

// Shows the blue ticks. Cheap trick, but it makes the bot feel present
// while Claude is still thinking.
export async function markAsRead(messageId: string) {
  try {
    await fetch(endpoint(), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
  } catch (err) {
    console.error("read receipt failed:", err);
  }
}
