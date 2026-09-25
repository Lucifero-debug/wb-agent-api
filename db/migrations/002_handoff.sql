-- db/migrations/002_handoff.sql
--
-- Phase 2: staff handoff. Brings a database created from the ORIGINAL
-- schema.sql up to date. Safe to run more than once.
--
-- Run it in the Neon SQL editor on the "wb-agent-api" project.
-- (A fresh database built from the current schema.sql does not need this.)

-- 1. Allow staff replies in the transcript.
--    Postgres names an inline column check <table>_<column>_check.
alter table messages drop constraint if exists messages_role_check;
alter table messages add constraint messages_role_check
  check (role in ('user', 'assistant', 'staff'));

-- 2. The per-thread handoff switch.
create table if not exists conversations (
  business_phone_id text        not null,
  customer_wa_id    text        not null,
  paused_until      timestamptz,
  updated_at        timestamptz not null default now(),

  primary key (business_phone_id, customer_wa_id)
);
