// lib/profiles/types.ts
//
// Everything the agent knows about ONE business. The code never assumes
// an industry: a dental clinic, a salon, a coaching centre or a caterer is
// just a different profile. When you onboard real clients, a profile
// stops being a file and becomes a database row with this same shape.
//
// IMPORTANT: the agent treats a profile as the complete truth. Anything
// not written in it, the agent does not know. Be precise — a vague line
// here becomes a wrong answer to a customer.

export type BusinessProfile = {
  name: string;

  // What kind of business, as a customer would say it: "dental clinic",
  // "unisex salon", "home bakery".
  type: string;

  location: string;
  hours: string;

  // Who the agent hands over to, as it would say it in a sentence:
  // "I'll pass this to ___". e.g. "the clinic", "the salon team".
  team: string;

  // What a customer asks this business for. Drives the prompt, lead
  // extraction and the dashboard labels.
  request: {
    // "appointment", "booking", "order", "site visit", "trial class"
    noun: string;

    // What the agent collects, one per message, in this order.
    // e.g. ["their name", "their preferred day and time"]
    collect: string[];

    // Dashboard column labels for the two main lead fields.
    whatLabel: string; // "Treatment", "Service", "Items"
    whenLabel: string; // "Preferred time", "Delivery time"
  };

  // Menu, price list or catalogue. One item per line, price included.
  services: string[];

  // Anything else that is true and worth knowing: parking, payment,
  // walk-ins, delivery area.
  faqs: string[];

  // Topics customers of THIS kind of business ask about that the agent
  // must say it does not know, rather than guess. For a clinic: which
  // doctor is in. For a salon: which stylist. For a caterer: exact
  // ingredients. The generic ones (availability, unlisted services,
  // discounts) are built into the prompt already.
  unknowns: string[];

  // Things the agent must refuse outright and hand to a person — usually
  // advice that could hurt someone if wrong.
  offLimits: string[];
};
