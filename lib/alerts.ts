// lib/alerts.ts
//
// Telling a human that something needs them.
//
// Email via Resend's HTTP API — no SDK, one fetch. Email because it needs
// nothing from Meta: a WhatsApp alert to the owner is business-initiated,
// so it would need an approved template, which is a later job.
//
// Requires in .env.local and in Vercel:
//   RESEND_API_KEY    (resend.com -> API Keys)
//   ALERT_EMAIL_TO    who gets the alerts. Until you verify a domain in
//                     Resend, this MUST be the email your Resend account
//                     was created with — Resend refuses anything else.
// Optional:
//   ALERT_EMAIL_FROM  defaults to Resend's shared test sender
//   APP_URL           e.g. https://your-app.vercel.app — adds a link
//                     straight to the conversation
//
// If the keys are missing, alerts are skipped with a warning. The agent
// itself keeps working: a missing alert is bad, a crashed webhook is worse.

import "server-only";

import { business } from "./business";
import type { LeadDraft, LeadEvent } from "./leads";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const headlines: Record<LeadEvent, string> = {
  new: "New lead",
  reopened: "Returning customer",
  complaint: "COMPLAINT",
};

export async function sendLeadAlert(
  event: LeadEvent,
  customerWaId: string,
  draft: LeadDraft
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;

  if (!key || !to) {
    console.warn("alerts not configured (RESEND_API_KEY / ALERT_EMAIL_TO) — skipping");
    return;
  }

  const from =
    process.env.ALERT_EMAIL_FROM ?? `${business.name} Agent <onboarding@resend.dev>`;

  const who = draft.name ?? `+${customerWaId}`;
  const subject = `${headlines[event]}: ${who}${draft.service ? ` — ${draft.service}` : ""}`;

  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const link = appUrl ? `${appUrl}/leads/chat/${customerWaId}` : null;

  // Plain text on purpose: it reads fine on a phone lock screen, which is
  // where a receptionist will actually see it.
  const text = [
    `${headlines[event]} on WhatsApp for ${business.name}.`,
    "",
    `Name:           ${draft.name ?? "not given yet"}`,
    `Phone:          +${customerWaId}`,
    `Wants:          ${draft.service ?? "not said yet"}`,
    `Preferred time: ${draft.preferredTime ?? "not said yet"}`,
    `Type:           ${draft.intent}`,
    draft.notes ? `Notes:          ${draft.notes}` : null,
    "",
    event === "complaint"
      ? "The customer was told this is being passed to the clinic. Please reply soon."
      : "The customer was told the clinic will confirm. The agent has NOT confirmed any slot.",
    link ? `\nOpen the conversation: ${link}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });

    if (!res.ok) {
      console.error("alert email failed:", res.status, await res.text());
      return;
    }

    console.log(`alert sent: ${subject}`);
  } catch (err) {
    console.error("alert email request failed:", err);
  }
}
