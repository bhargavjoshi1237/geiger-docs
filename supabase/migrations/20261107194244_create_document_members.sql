-- Create document members
--
-- Owns docs.document_members: the named people (by email) and their role on a restricted document.

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

create table if not exists docs.document_members (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references docs.documents(id) on delete cascade,
  email text not null,
  role text not null default 'viewer',
  -- Expansion bag for not-yet-promoted config.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Back-fill older copies of the table (idempotent re-run on a partial apply).
alter table docs.document_members
  add column if not exists document_id uuid not null references docs.documents(id) on delete cascade;
alter table docs.document_members add column if not exists email text not null;
alter table docs.document_members add column if not exists role text not null default 'viewer';

-- Named check, dropped first so a re-run never duplicates it.
alter table docs.document_members drop constraint if exists document_members_role_check;
alter table docs.document_members add constraint document_members_role_check
  check (role in ('viewer', 'commenter', 'editor'));

-- Upsert target; non-partial because PostgREST can't infer a partial index (removal sets deleted_at, re-adding clears it).
create unique index if not exists document_members_document_email_idx
  on docs.document_members (document_id, email);

drop trigger if exists document_members_touch_updated_at on docs.document_members;
create trigger document_members_touch_updated_at
before update on docs.document_members
for each row execute function docs.touch_updated_at();

-- Demo-open RLS (suite convention); restricted access stays UI-enforced until a later migration.
alter table docs.document_members enable row level security;

drop policy if exists document_members_demo_all on docs.document_members;
create policy document_members_demo_all on docs.document_members
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on docs.document_members to anon, authenticated;

-- @down
-- The shared schema and touch_updated_at() stay; dropping the table also drops its grants.
drop policy if exists document_members_demo_all on docs.document_members;
drop trigger if exists document_members_touch_updated_at on docs.document_members;
drop index if exists docs.document_members_document_email_idx;
alter table if exists docs.document_members drop constraint if exists document_members_role_check;
drop table if exists docs.document_members cascade;
