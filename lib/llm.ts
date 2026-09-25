// lib/llm.ts
//
// The agent's brain. Currently Gemini (free tier), but the rest of the app
// only knows about generateReply() — so swapping providers later means
// editing this file and nothing else.
//
// generateReply() takes the whole conversation, oldest first, with the
// customer's newest message as the last turn. Conversation state lives in
// lib/conversation.ts; this file is stateless.
//
// Requires in .env.local and in Vercel:
//   GEMINI_API_KEY   (aistudio.google.com/apikey)
//
// NOTE: Google may use free-tier inputs and outputs to train their models.
// Fine for development with fake data. Move to a paid tier before real
// customer messages go through this.

import { business } from "./business";
import type { Turn } from "./conversation";
import type { LeadDraft, Intent } from "./leads";

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

// What the customer sees when the model fails. Sent, but never written to
// conversation history — the model should not read its own error messages
// back as things it said.
export const FALLBACK_REPLY = "Sorry, something went wrong. Please try again.";

// Returns null on any failure, so the caller can tell a real reply apart
// from an error and keep errors out of the conversation history.
export async function generateReply(turns: Turn[]): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    console.error("GEMINI_API_KEY is not set");
    return null;
  }

  if (turns.length === 0) {
    console.error("generateReply called with no turns");
    return null;
  }

  try {
    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemPrompt() }],
        },
        // Gemini calls the assistant "model"; everything else maps across
        // unchanged.
        contents: turns.map((t) => ({
          role: t.role === "assistant" ? "model" : "user",
          parts: [{ text: t.content }],
        })),
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.7,
          // Thinking is on by default on 2.5 Flash and adds latency plus
          // token cost. For two-line WhatsApp replies it buys nothing.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("gemini error:", res.status, detail);

      // 429 = you hit the free-tier rate limit. Slow down, don't panic.
      return null;
    }

    const data = await res.json();

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();

    if (!text) {
      // Usually a safety block or an empty candidate — log why.
      console.error("gemini returned no text:", JSON.stringify(data));
      return null;
    }

    return text;
  } catch (err) {
    console.error("gemini request failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------
// Lead extraction
//
// A second pass over the same conversation, asking for JSON instead of a
// reply. It runs after the customer already has their answer, so its
// latency is invisible to them — but it does double the request count
// against the free tier's ~10-15/min.
//
// Deliberately separate from the reply call: an extraction that returns
// nonsense should never be able to affect what the customer reads.
// ---------------------------------------------------------------

const LEAD_SCHEMA = {
  type: "object",
  properties: {
    is_lead: { type: "boolean" },
    name: { type: "string", nullable: true },
    service: { type: "string", nullable: true },
    preferred_time: { type: "string", nullable: true },
    intent: {
      type: "string",
      enum: ["booking", "enquiry", "complaint", "other"],
    },
    notes: { type: "string", nullable: true },
  },
  required: ["is_lead", "intent"],
  propertyOrdering: [
    "is_lead",
    "name",
    "service",
    "preferred_time",
    "intent",
    "notes",
  ],
};

const EXTRACTION_PROMPT = `You are reading a WhatsApp conversation between a customer and ${business.name}, a ${business.type}.

Extract what the business needs in order to follow up. Return JSON only.

is_lead        true if this person wants something from the business — an
               appointment, a quote, a callback, or they have a complaint.
               false for pure information requests the agent already
               answered ("what time do you open?") and for small talk.
intent         booking, enquiry, complaint, or other.
name           the customer's name, ONLY if they stated it. Never guess it
               from their phone number or greeting.
service        which treatment they want, in their words or the closest
               item from the price list. Null if they have not said.
preferred_time their preferred day/time, as they expressed it ("Saturday
               morning", "tomorrow 6pm"). Do not resolve it to a date.
notes          one short line the clinic would want to know before calling
               back. Null if there is nothing beyond the fields above.

Use null for anything the customer has not actually said. Do not infer,
do not fill gaps with something plausible. A half-empty lead is correct
and will be completed as the conversation continues.`;

function transcript(turns: Turn[]): string {
  return turns
    .map((t) => `${t.role === "user" ? "Customer" : "Agent"}: ${t.content}`)
    .join("\n");
}

export async function extractLead(turns: Turn[]): Promise<LeadDraft | null> {
  const key = process.env.GEMINI_API_KEY;

  if (!key || turns.length === 0) return null;

  try {
    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: EXTRACTION_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: transcript(turns) }] }],
        generationConfig: {
          maxOutputTokens: 300,
          // Extraction is not a creative task.
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: LEAD_SCHEMA,
        },
      }),
    });

    if (!res.ok) {
      console.error("lead extraction error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("");

    if (!text) return null;

    const parsed = JSON.parse(text);

    // Nothing worth following up on.
    if (!parsed.is_lead) return null;

    const intents: Intent[] = ["booking", "enquiry", "complaint", "other"];

    return {
      name: parsed.name ?? null,
      service: parsed.service ?? null,
      preferredTime: parsed.preferred_time ?? null,
      intent: intents.includes(parsed.intent) ? parsed.intent : "other",
      notes: parsed.notes ?? null,
    };
  } catch (err) {
    // A lost lead is bad; a thrown exception in the reply path is worse.
    console.error("lead extraction failed:", err);
    return null;
  }
}
