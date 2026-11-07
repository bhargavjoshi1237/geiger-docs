-- Create collections
--
-- Owns docs.collections: flat, per-project groupings; a document belongs to at most one.

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

create table if not exists docs.collections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default '',
  description text not null default '',
  -- Expansion bag for not-yet-promoted config.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Back-fill older copies of the table (idempotent re-run on a partial apply).
alter table docs.collections
  add column if not exists project_id uuid not null references public.projects(id) on delete cascade;
alter table docs.collections add column if not exists name text not null default '';
alter table docs.collections add column if not exists description text not null default '';

-- Every read is "this project's live collections".
create index if not exists collections_project_idx
  on docs.collections (project_id)
  where deleted_at is null;

drop trigger if exists collections_touch_updated_at on docs.collections;
create trigger collections_touch_updated_at
before update on docs.collections
for each row execute function docs.touch_updated_at();

-- Demo-open RLS (suite convention); tightening it is a later migration.
alter table docs.collections enable row level security;

drop policy if exists collections_demo_all on docs.collections;
create policy collections_demo_all on docs.collections
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on docs.collections to anon, authenticated;

-- @down
-- The shared schema and touch_updated_at() stay; dropping the table also drops its grants.
drop policy if exists collections_demo_all on docs.collections;
drop trigger if exists collections_touch_updated_at on docs.collections;
drop index if exists docs.collections_project_idx;
drop table if exists docs.collections cascade;
