// lib/leads.ts
//
// What the clinic actually wants out of all this: a list of people who
// asked for something, and what they asked for.
//
// One row per (business, customer). A returning customer updates their own
// row rather than creating a second one — a small clinic wants a worklist
// of who needs calling back, not an archive. The full transcript is always
// in `messages` if anyone needs the history.

import "server-only";

import { neon } from "@neondatabase/serverless";

export type Intent = "booking" | "enquiry" | "complaint" | "other";
export type LeadStatus = "new" | "contacted" | "closed";

// What the extraction pass produces. Every detail is optional because a
// conversation reveals them one at a time.
export type LeadDraft = {
  name: string | null;
  service: string | null;
  preferredTime: string | null;
  intent: Intent;
  notes: string | null;
};

export type Lead = LeadDraft & {
  id: string;
  customerWaId: string;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
};

function db() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  return neon(url);
}

// ---------------------------------------------------------------
// Write the current state of a lead.
//
// Called after every customer message, so it has to be additive: a later
// extraction that fails to spot the name must not erase the name we
// already had. That is what the coalesce() on each field is for —
// details accumulate, they never regress to null.
// ---------------------------------------------------------------
export async function upsertLead(
  businessPhoneId: string,
  customerWaId: string,
  draft: LeadDraft
): Promise<void> {
  const sql = db();

  await sql`
    insert into leads
      (business_phone_id, customer_wa_id, name, service, preferred_time, intent, notes)
    values
      (${businessPhoneId}, ${customerWaId}, ${draft.name}, ${draft.service},
       ${draft.preferredTime}, ${draft.intent}, ${draft.notes})
    on conflict (business_phone_id, customer_wa_id) do update set
      name           = coalesce(excluded.name, leads.name),
      service        = coalesce(excluded.service, leads.service),
      preferred_time = coalesce(excluded.preferred_time, leads.preferred_time),
      intent         = excluded.intent,
      notes          = coalesce(excluded.notes, leads.notes),
      -- Whoever at the clinic marked this 'contacted' keeps that state.
      -- But a customer messaging again after it was closed is a new
      -- request, and it needs to surface on the worklist again.
      status         = case when leads.status = 'closed' then 'new' else leads.status end,
      updated_at     = now()
  `;
}

// ---------------------------------------------------------------
// The worklist, newest activity first.
//
// Closed leads are hidden by default — the point of the list is what
// still needs doing — but the dashboard can ask for them.
// ---------------------------------------------------------------
export async function listLeads(
  businessPhoneId: string,
  { includeClosed = false, limit = 200 } = {}
): Promise<Lead[]> {
  const sql = db();

  const rows = includeClosed
    ? await sql`
        select id, customer_wa_id, name, service, preferred_time, intent,
               notes, status, created_at, updated_at
        from leads
        where business_phone_id = ${businessPhoneId}
        order by updated_at desc
        limit ${limit}
      `
    : await sql`
        select id, customer_wa_id, name, service, preferred_time, intent,
               notes, status, created_at, updated_at
        from leads
        where business_phone_id = ${businessPhoneId}
          and status <> 'closed'
        order by updated_at desc
        limit ${limit}
      `;

  return rows.map((r) => toLead(r as LeadRow));
}

// ---------------------------------------------------------------
// Move a lead along the worklist.
//
// Scoped by business_phone_id as well as id: the id alone comes from the
// browser, and on its own it would let anyone with a session read or
// change another business's lead once this is multi-tenant.
// ---------------------------------------------------------------
export async function setLeadStatus(
  businessPhoneId: string,
  leadId: string,
  status: LeadStatus
): Promise<void> {
  const sql = db();

  await sql`
    update leads
    set status = ${status}, updated_at = now()
    where id = ${leadId}
      and business_phone_id = ${businessPhoneId}
  `;
}

// The shape the queries above select. Neon hands back loosely-typed rows,
// so this is the one place the mapping is pinned down.
type LeadRow = {
  id: string | number;
  customer_wa_id: string;
  name: string | null;
  service: string | null;
  preferred_time: string | null;
  intent: Intent;
  notes: string | null;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
};

function toLead(r: LeadRow): Lead {
  return {
    id: String(r.id),
    customerWaId: r.customer_wa_id,
    name: r.name,
    service: r.service,
    preferredTime: r.preferred_time,
    intent: r.intent,
    notes: r.notes,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
