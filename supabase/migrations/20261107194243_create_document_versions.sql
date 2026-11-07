-- Create document versions
--
-- Owns docs.document_versions: an immutable snapshot of a document's title + body on every content save.

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

create table if not exists docs.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references docs.documents(id) on delete cascade,
  version_number int not null,
  title text not null default '',
  body text not null default '',
  -- Expansion bag for not-yet-promoted config.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Back-fill older copies of the table (idempotent re-run on a partial apply).
alter table docs.document_versions
  add column if not exists document_id uuid not null references docs.documents(id) on delete cascade;
alter table docs.document_versions add column if not exists version_number int not null;
alter table docs.document_versions add column if not exists title text not null default '';
alter table docs.document_versions add column if not exists body text not null default '';

-- One number per version of a document (covers soft-deleted rows too); also serves the newest-first list.
create unique index if not exists document_versions_document_version_idx
  on docs.document_versions (document_id, version_number);

drop trigger if exists document_versions_touch_updated_at on docs.document_versions;
create trigger document_versions_touch_updated_at
before update on docs.document_versions
for each row execute function docs.touch_updated_at();

-- Demo-open RLS (suite convention); tightening it is a later migration.
alter table docs.document_versions enable row level security;

drop policy if exists document_versions_demo_all on docs.document_versions;
create policy document_versions_demo_all on docs.document_versions
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on docs.document_versions to anon, authenticated;

-- @down
-- The shared schema and touch_updated_at() stay; dropping the table also drops its grants.
drop policy if exists document_versions_demo_all on docs.document_versions;
drop trigger if exists document_versions_touch_updated_at on docs.document_versions;
drop index if exists docs.document_versions_document_version_idx;
drop table if exists docs.document_versions cascade;
