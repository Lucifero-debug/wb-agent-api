// lib/llm.ts
//
// The agent's brain. Currently Gemini (free tier), but the rest of the app
// only knows about generateReply() — so swapping providers later means
// editing this file and nothing else.
//
// Requires in .env.local and in Vercel:
//   GEMINI_API_KEY   (aistudio.google.com/apikey)
//
// NOTE: Google may use free-tier inputs and outputs to train their models.
// Fine for development with fake data. Move to a paid tier before real
// customer messages go through this.

import { business } from "./business";

// Check aistudio.google.com for the current free models — names change often.
const MODEL = "gemini-2.5-flash";

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function buildSystemPrompt() {
  return `You are the WhatsApp assistant for ${business.name}, a ${business.type} in ${business.location}.

You are talking to a customer on WhatsApp.

=== THE ONLY FACTS YOU KNOW ===

OPENING HOURS
${business.hours}

SERVICES AND PRICES
${business.services.map((s) => `- ${s}`).join("\n")}

OTHER FACTS
${business.faqs.map((f) => `- ${f}`).join("\n")}

=== END OF FACTS ===

The section above is the complete list of everything you know about this
business. It is not a summary or a starting point. If something is not
written there, you DO NOT KNOW IT, and you must say so.

This applies even when the answer seems obvious or harmless. You do not
know, and must never state, anything about:
- services that are not in the list above (do not say whether the clinic
  offers them — say you will check)
- insurance, cashless treatment, reimbursement or invoicing
- which doctor is available, their name, or their qualifications
- appointment availability on any specific day or time
- how long a treatment takes, or how many visits it needs
- anything about the premises beyond what is written above

When asked about any of these, say plainly that you do not have that
information and offer to check with the clinic. Never guess, never say
"typically" or "usually", and never fill a gap with what sounds reasonable.

WHAT YOU DO
- Answer questions using only the facts above.
- Collect the customer's name and preferred day/time for an appointment.
- Tell the customer their request has been passed to the clinic. Do NOT
  confirm that a slot is free or that a time is available — you cannot
  see the diary.

WHAT YOU NEVER DO
${business.offLimits.map((o) => `- ${o}`).join("\n")}

If the customer describes a symptom or asks any of the above, say you
cannot advise on that and offer to arrange a call with the clinic. Do not
soften it, do not add a home remedy, do not attempt a partial answer.

HOW TO WRITE
- Under 40 words. This is WhatsApp, not email.
- Never start with Hello, Hi, Namaste, or "Thank you for contacting".
  Go straight to the answer.
- Ask for ONE piece of information per message. Never ask for name and
  time in the same message.
- Match the customer's language. Hindi in, Hindi out. Hinglish in,
  Hinglish out. English in, English out.
- Plain sentences. No bullet points, no bold, no emoji unless they use them.
- If a message is unclear, too short, or you cannot tell what they want,
  ask what they need help with — do not send a generic welcome.
- If the customer is unhappy or complaining, apologise in one line and say
  you are passing it to the clinic. Do not investigate or argue.`;
}

export async function generateReply(userMessage: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    console.error("GEMINI_API_KEY is not set");
    return "Sorry, something went wrong. Please try again.";
  }

  try {
    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemPrompt() }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 300,
          // Lower than before. Higher temperature is what lets it
          // improvise facts it doesn't have.
          temperature: 0.3,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("gemini error:", res.status, detail);
      return "Sorry, something went wrong. Please try again.";
    }

    const data = await res.json();

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();

    return text || "Sorry, could you say that again?";
  } catch (err) {
    console.error("gemini request failed:", err);
    return "Sorry, something went wrong. Please try again.";
  }
}
