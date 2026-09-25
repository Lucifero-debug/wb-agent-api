// lib/business.ts
//
// Which business this deployment is answering for.
//
// Today: one profile per deployment, chosen by the BUSINESS_PROFILE env
// var — so the same code demos as a dental clinic to a dentist and as a
// salon to a salon owner, with one setting changed and a restart.
//
// Later, with real clients: the profile is looked up per incoming number
// (the business_phone_id every message already carries) from a database
// table with the same shape as BusinessProfile. Nothing that reads
// `business` needs to know which of the two it came from.
//
// To add a business type: copy a file in lib/profiles/, fill it in, and
// register it below.

import type { BusinessProfile } from "./profiles/types";
import { dental } from "./profiles/dental";
import { salon } from "./profiles/salon";

export type { BusinessProfile } from "./profiles/types";

const profiles: Record<string, BusinessProfile> = {
  dental,
  salon,
};

function activeProfile(): BusinessProfile {
  const key = process.env.BUSINESS_PROFILE ?? "dental";
  const profile = profiles[key];

  if (!profile) {
    throw new Error(
      `Unknown BUSINESS_PROFILE "${key}". Available: ${Object.keys(profiles).join(", ")}`
    );
  }

  return profile;
}

export const business: BusinessProfile = activeProfile();

// "an appointment", "a booking", "an order" — for sentences built from
// profile nouns. Vowel-letter rule; good enough for the nouns profiles use.
export function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}
