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

// Returns true only if Meta accepted the message. Callers use this to
// decide whether the reply goes into conversation history — a message the
// customer never received must not become something the model thinks it
// said.
export async function sendText(to: string, body: string): Promise<boolean> {
  try {
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
      return false;
    }

    return true;
  } catch (err) {
    console.error("send request failed:", err);
    return false;
  }
}

// Shows the blue ticks. Cheap trick, but it makes the bot feel present
// while the model is still thinking.
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
