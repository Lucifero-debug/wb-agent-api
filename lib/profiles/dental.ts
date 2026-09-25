// lib/profiles/dental.ts
//
// Demo profile: a dental clinic. Everything clinic-specific that used to
// live in the prompt itself (doctors, insurance, symptoms) lives here now.

import type { BusinessProfile } from "./types";

export const dental: BusinessProfile = {
  name: "Sharma Dental Care",
  type: "dental clinic",
  location: "Lajpat Nagar, New Delhi",
  hours: "Monday to Saturday, 10am to 7pm. Closed Sunday.",

  team: "the clinic",

  request: {
    noun: "appointment",
    collect: ["their name", "their preferred day and time"],
    whatLabel: "Treatment",
    whenLabel: "Preferred time",
  },

  services: [
    "Consultation — Rs 300",
    "Scaling and polishing — Rs 1500",
    "Tooth filling — Rs 1200 onwards",
    "Root canal — Rs 6000 onwards",
    "Braces — consultation required for quote",
  ],

  faqs: [
    "Patient parking is in the basement of the same building. The clinic itself is on the ground floor.",
    "We accept cash, UPI and all major cards.",
    "Walk-ins are accepted but appointments get priority.",
    "First consultation includes a full oral examination.",
  ],

  unknowns: [
    "insurance, cashless treatment, reimbursement or invoicing",
    "which doctor is available, their name, or their qualifications",
    "how long a treatment takes, or how many visits it needs",
  ],

  offLimits: [
    "diagnosing any dental or medical problem",
    "suggesting medication, dosage or home remedies",
    "advising whether a symptom is serious or urgent",
    "quoting a final price for treatment not listed above",
  ],
};
