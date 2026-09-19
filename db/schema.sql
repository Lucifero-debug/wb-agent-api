-- db/schema.sql
--
-- Conversation memory. Applied to the Neon project "wb-agent-api"
-- (lively-firefly-21947720, Postgres 18). Kept here so the schema is
-- reproducible on a fresh branch or a second environment.

create table if not exists messages (
  id                bigint generated always as identity primary key,

  -- The business's own WhatsApp number (metadata.phone_number_id). Always
  -- the same value today; this is the column that makes the agent
  -- multi-tenant when a second client arrives.
  business_phone_id text        not null,

  -- The customer's number, international format.
  customer_wa_id    text        not null,

  role              text        not null check (role in ('user', 'assistant')),
  content           text        not null,

  -- Meta's message id, for inbound only. Null for our own replies.
  wa_message_id     text,

  created_at        timestamptz not null default now()
);

-- Serves the history read: newest N turns of one thread.
create index if not exists messages_thread_idx
  on messages (business_phone_id, customer_wa_id, created_at desc);

-- Deduplicates Meta's webhook retries. Partial, because our outbound rows
-- have no message id — which is why inserts must spell out the same
-- predicate in their ON CONFLICT clause for Postgres to match this index.
create unique index if not exists messages_wa_message_id_key
  on messages (wa_message_id) where wa_message_id is not null;

-- ---------------------------------------------------------------
-- Leads: what the clinic acts on. Populated by the extraction pass in
-- lib/llm.ts after each reply, one row per (business, customer).
-- ---------------------------------------------------------------

create table if not exists leads (
  id                bigint generated always as identity primary key,
  business_phone_id text        not null,
  customer_wa_id    text        not null,

  -- All nullable: a conversation gives these up one at a time, and the
  -- upsert coalesces so a later pass never erases an earlier detail.
  name              text,
  service           text,
  preferred_time    text,
  notes             text,

  intent            text        not null default 'other'
                      check (intent in ('booking', 'enquiry', 'complaint', 'other')),

  -- Owned by the clinic, not the agent. The upsert leaves it alone, except
  -- to reopen a closed lead when the customer comes back.
  status            text        not null default 'new'
                      check (status in ('new', 'contacted', 'closed')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One live lead per customer; the transcript in `messages` is the archive.
  unique (business_phone_id, customer_wa_id)
);

create index if not exists leads_worklist_idx
  on leads (business_phone_id, status, updated_at desc);
