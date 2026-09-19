// lib/tenant.ts
//
// Which business the dashboard is looking at.
//
// Today: the single number in WHATSAPP_PHONE_NUMBER_ID. The webhook writes
// leads under metadata.phone_number_id from Meta's payload, which is the
// same value — if the dashboard ever comes up empty while leads exist,
// compare those two first.
//
// Tomorrow: this is resolved from the session, and everything downstream
// already takes it as an argument.

import "server-only";

export function businessPhoneId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!id) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
  }

  return id;
}
