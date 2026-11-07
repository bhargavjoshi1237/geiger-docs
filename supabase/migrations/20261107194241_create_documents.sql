-- Create documents
--
-- Owns docs.documents: per-project Markdown documents with a status, a share mode and an optional collection.

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

create table if not exists docs.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  collection_id uuid references docs.collections(id) on delete set null,
  title text not null default 'Untitled',
  body text not null default '',
  status text not null default 'Draft',
  share_mode text not null default 'workspace',
  -- Expansion bag for not-yet-promoted config.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Back-fill older copies of the table (idempotent re-run on a partial apply).
alter table docs.documents
  add column if not exists project_id uuid not null references public.projects(id) on delete cascade;
alter table docs.documents
  add column if not exists collection_id uuid references docs.collections(id) on delete set null;
alter table docs.documents add column if not exists title text not null default 'Untitled';
alter table docs.documents add column if not exists body text not null default '';
alter table docs.documents add column if not exists status text not null default 'Draft';
alter table docs.documents add column if not exists share_mode text not null default 'workspace';

-- Named checks, dropped first so a re-run never duplicates them.
alter table docs.documents drop constraint if exists documents_status_check;
alter table docs.documents add constraint documents_status_check
  check (status in ('Draft', 'In review', 'Published', 'Archived'));

alter table docs.documents drop constraint if exists documents_share_mode_check;
alter table docs.documents add constraint documents_share_mode_check
  check (share_mode in ('workspace', 'public', 'restricted'));

create index if not exists documents_project_idx
  on docs.documents (project_id)
  where deleted_at is null;

create index if not exists documents_collection_idx
  on docs.documents (collection_id)
  where deleted_at is null;

drop trigger if exists documents_touch_updated_at on docs.documents;
create trigger documents_touch_updated_at
before update on docs.documents
for each row execute function docs.touch_updated_at();

-- Demo-open RLS (suite convention); restricted sharing stays UI-enforced until a later migration.
alter table docs.documents enable row level security;

drop policy if exists documents_demo_all on docs.documents;
create policy documents_demo_all on docs.documents
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on docs.documents to anon, authenticated;

-- @down
-- The shared schema and touch_updated_at() stay; dropping the table also drops its grants.
drop policy if exists documents_demo_all on docs.documents;
drop trigger if exists documents_touch_updated_at on docs.documents;
drop index if exists docs.documents_collection_idx;
drop index if exists docs.documents_project_idx;
alter table if exists docs.documents drop constraint if exists documents_share_mode_check;
alter table if exists docs.documents drop constraint if exists documents_status_check;
drop table if exists docs.documents cascade;
