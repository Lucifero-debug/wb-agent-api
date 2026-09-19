// lib/auth.ts
//
// Dashboard access. One shared password for the whole business, held in
// DASHBOARD_PASSWORD — this is the clinic's own staff looking at their own
// leads, not per-user accounts.
//
// When a second client onboards, this is the first thing to replace: the
// session says "somebody knew the password", not "this is Dr Sharma's
// receptionist", and it has no notion of which business you belong to.
//
// The session is a signed timestamp rather than a database row — nothing
// to store, nothing to clean up. Signing key is the password itself, so
// changing the password invalidates every existing session, which is the
// behaviour you want.

import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "wb_dash";

const SESSION_HOURS = 12;

function secret(): string {
  const password = process.env.DASHBOARD_PASSWORD;

  if (!password) {
    throw new Error("DASHBOARD_PASSWORD is not set");
  }

  return password;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

// Compare without leaking the answer through how long it took.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function checkPassword(attempt: string): boolean {
  return safeEqual(attempt, secret());
}

// Token is `<expiry-ms>.<hmac>`. Tampering with the expiry breaks the mac.
export function issueToken(): string {
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = String(expiresAt);

  return `${payload}.${sign(payload)}`;
}

export function tokenIsValid(token: string | undefined): boolean {
  if (!token) return false;

  const [payload, mac] = token.split(".");

  if (!payload || !mac) return false;
  if (!safeEqual(mac, sign(payload))) return false;

  const expiresAt = Number(payload);

  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

// ---------------------------------------------------------------
// The one call every protected surface makes.
//
// A page-level check does NOT cover the Server Actions defined for that
// page — actions are reachable by direct POST whether or not the UI ever
// renders. So every action calls this too.
// ---------------------------------------------------------------
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();

  return tokenIsValid(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<void> {
  if (!(await isAuthenticated())) {
    throw new Error("Unauthorized");
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  };
}
