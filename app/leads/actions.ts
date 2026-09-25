"use server";

// app/leads/actions.ts
//
// Every export here is reachable by a direct POST, whether or not the UI
// that calls it ever rendered. The page's own session check does not cover
// them — so each one re-checks for itself.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import {
  SESSION_COOKIE,
  checkPassword,
  issueToken,
  requireSession,
  sessionCookieOptions,
} from "@/lib/auth";
import { setLeadStatus, type LeadStatus } from "@/lib/leads";
import { businessPhoneId } from "@/lib/tenant";
import {
  lastCustomerMessageAt,
  recordStaff,
  withinServiceWindow,
} from "@/lib/conversation";
import { pauseBot, resumeBot } from "@/lib/handoff";
import { sendText } from "@/lib/whatsapp";

export type LoginState = { error: string | null };

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  if (!password) {
    return { error: "Enter the password." };
  }

  let ok: boolean;

  try {
    ok = checkPassword(password);
  } catch {
    // DASHBOARD_PASSWORD missing. Say so plainly rather than letting the
    // clinic think they typed it wrong.
    return { error: "Dashboard password is not configured on the server." };
  }

  if (!ok) {
    return { error: "Wrong password." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, issueToken(), sessionCookieOptions());

  redirect("/leads");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);

  redirect("/leads/login");
}

export async function updateStatus(formData: FormData) {
  await requireSession();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as LeadStatus;

  if (!id || !["new", "contacted", "closed"].includes(status)) {
    return;
  }

  // Scoped to this business, so an id typed into a curl request cannot
  // reach somebody else's lead.
  await setLeadStatus(businessPhoneId(), id, status);

  revalidatePath("/leads");
}

// ---------------------------------------------------------------
// Handoff
// ---------------------------------------------------------------

// WhatsApp ids are digits only, international format. Anything else in a
// form field is either a bug or somebody poking at the endpoint.
function validWaId(value: FormDataEntryValue | null): string | null {
  const id = String(value ?? "");
  return /^\d{6,20}$/.test(id) ? id : null;
}

function refresh(waId: string) {
  revalidatePath(`/leads/chat/${waId}`);
  revalidatePath("/leads");
}

export async function takeOver(formData: FormData) {
  await requireSession();

  const waId = validWaId(formData.get("waId"));
  if (!waId) return;

  await pauseBot(businessPhoneId(), waId);
  refresh(waId);
}

export async function handBack(formData: FormData) {
  await requireSession();

  const waId = validWaId(formData.get("waId"));
  if (!waId) return;

  await resumeBot(businessPhoneId(), waId);
  refresh(waId);
}

// ---------------------------------------------------------------
// A reply typed by staff, sent from the business's WhatsApp number.
//
// `body` is handed back on failure so the form can put the text back —
// nobody should retype a message because WhatsApp said no. `attempt`
// changes on every call, which the form uses to reset itself.
// ---------------------------------------------------------------
export type ReplyState = {
  error: string | null;
  body: string;
  attempt: number;
};

export async function sendStaffReply(
  prev: ReplyState,
  formData: FormData
): Promise<ReplyState> {
  await requireSession();

  const result = (error: string | null, body: string): ReplyState => ({
    error,
    body,
    attempt: prev.attempt + 1,
  });

  const waId = validWaId(formData.get("waId"));
  const body = String(formData.get("body") ?? "").trim();

  if (!waId) return result("This conversation could not be found.", body);
  if (!body) return result("Type a message first.", "");
  if (body.length > 4096) {
    return result("Too long for one WhatsApp message (4096 characters max).", body);
  }

  const biz = businessPhoneId();

  // Checked here and not just in the UI: the window can close while the
  // page sits open. This also scopes the action — staff can only message
  // someone who wrote to THIS business in the last 24 hours, not any
  // number typed into a request.
  if (!withinServiceWindow(await lastCustomerMessageAt(biz, waId))) {
    return result(
      "It's been over 24 hours since this customer last wrote, so WhatsApp won't deliver a normal message. Call them instead.",
      body
    );
  }

  const delivered = await sendText(waId, body);

  if (!delivered) {
    return result("WhatsApp didn't accept the message. Check the server log.", body);
  }

  await recordStaff(biz, waId, body);

  // Staff replying IS taking over — otherwise the bot answers the
  // customer's next message over the top of the person they're talking to.
  await pauseBot(biz, waId);

  refresh(waId);

  return result(null, "");
}
