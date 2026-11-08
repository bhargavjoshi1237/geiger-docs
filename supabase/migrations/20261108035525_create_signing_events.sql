-- Create signing events
--
-- Owns docs.signing_events: the idempotency log of Documenso webhooks (one row per event + envelope + createdAt).
-- payload is the webhook body with signing tokens and URLs stripped. Writes come only from /api/signing/webhook on
-- the service role; signed-in users read the events of requests whose document passes docs.can_view_signing(uuid).
-- Depends on docs.signing_requests and docs.can_view_signing(uuid) (create_signing_requests).

-- @up
create extension if not exists pgcrypto;

create schema if not exists docs;
grant usage on schema docs to anon, authenticated, service_role;

-- Shared touch_updated_at() trigger function, defined here so this migration never depends on another.
create or replace function docs.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists docs.signing_events (
  id uuid primary key default gen_random_uuid(),
  -- Null for envelopes this app didn't create, or once the request row is gone.
  request_id uuid references docs.signing_requests(id) on delete set null,
  envelope_id text,
  event text not null,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  -- Expansion bag for not-yet-promoted config.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Back-fill older copies of the table (idempotent re-run on a partial apply).
alter table docs.signing_events
  add column if not exists request_id uuid references docs.signing_requests(id) on delete set null;
alter table docs.signing_events add column if not exists envelope_id text;
alter table docs.signing_events add column if not exists event text not null;
alter table docs.signing_events add column if not exists dedupe_key text not null;
alter table docs.signing_events add column if not exists payload jsonb not null default '{}'::jsonb;
alter table docs.signing_events add column if not exists received_at timestamptz not null default now();

-- The webhook's insert ... on conflict (dedupe_key) do nothing target, so non-partial.
create unique index if not exists signing_events_dedupe_key_idx
  on docs.signing_events (dedupe_key);

create index if not exists signing_events_request_idx
  on docs.signing_events (request_id, received_at desc);

drop trigger if exists signing_events_touch_updated_at on docs.signing_events;
create trigger signing_events_touch_updated_at
before update on docs.signing_events
for each row execute function docs.touch_updated_at();

-- Read-only for signing viewers of the request's document; no client writes (no insert/update policies).
alter table docs.signing_events enable row level security;

drop policy if exists signing_events_select on docs.signing_events;
create policy signing_events_select on docs.signing_events
  for select to authenticated
  using (
    exists (
      select 1
        from docs.signing_requests r
       where r.id = signing_events.request_id
         and docs.can_view_signing(r.document_id)
    )
  );

revoke all on docs.signing_events from anon, authenticated;
grant select on docs.signing_events to authenticated;
grant all on docs.signing_events to service_role;

notify pgrst, 'reload schema';

-- @down
-- The shared schema and touch_updated_at() stay; dropping the table also drops its grants, policy, indexes and trigger.
drop policy if exists signing_events_select on docs.signing_events;
drop trigger if exists signing_events_touch_updated_at on docs.signing_events;
drop index if exists docs.signing_events_request_idx;
drop index if exists docs.signing_events_dedupe_key_idx;
drop table if exists docs.signing_events cascade;

notify pgrst, 'reload schema';
