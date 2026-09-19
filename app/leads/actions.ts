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
