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
