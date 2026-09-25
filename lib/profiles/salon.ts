// lib/profiles/salon.ts
//
// Demo profile: a salon. Exists mainly to prove the code has no clinic
// left in it — and so you can demo to a salon owner with their own kind
// of business on screen.

import type { BusinessProfile } from "./types";

export const salon: BusinessProfile = {
  name: "Glow Unisex Salon",
  type: "unisex salon",
  location: "Rajouri Garden, New Delhi",
  hours: "Every day, 11am to 9pm. Tuesday closed.",

  team: "the salon team",

  request: {
    noun: "booking",
    collect: ["their name", "their preferred day and time"],
    whatLabel: "Service",
    whenLabel: "Preferred time",
  },

  services: [
    "Men's haircut — Rs 300",
    "Women's haircut — Rs 700 onwards",
    "Global hair colour — Rs 2500 onwards",
    "Hair spa — Rs 1200",
    "Cleanup facial — Rs 900",
    "Bridal makeup — trial and consultation required for quote",
  ],

  faqs: [
    "Walk-ins are welcome on weekdays. Weekends are busy, so booking ahead is recommended.",
    "We accept cash, UPI and all major cards.",
    "Street parking only, directly outside the salon.",
  ],

  unknowns: [
    "which stylist is available, or a specific stylist's schedule",
    "which product brands are used",
    "how long a service takes",
    "home service or doorstep visits",
  ],

  offLimits: [
    "advising on skin, scalp or hair conditions",
    "saying whether a product is safe for allergies, sensitive skin or pregnancy",
    "promising a specific result from a treatment",
    "quoting a final price for a service not listed above",
  ],
};
