// lib/business.ts
//
// Everything specific to ONE client lives here. When you onboard a
// second client, this stops being a file and becomes a database row.
//
// IMPORTANT: the agent treats this file as the complete truth. Anything
// not written here, it does not know. Be precise — a vague line here
// becomes a wrong answer to a customer.

export const business = {
  name: "Sharma Dental Care",
  type: "dental clinic",
  location: "Lajpat Nagar, New Delhi",
  hours: "Monday to Saturday, 10am to 7pm. Closed Sunday.",

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

  // What the agent must never do.
  offLimits: [
    "diagnosing any dental or medical problem",
    "suggesting medication or dosage",
    "advising whether a symptom is serious or urgent",
    "quoting a final price for treatment not listed above",
  ],
};
