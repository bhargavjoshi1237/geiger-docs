-- Create templates
--
-- Owns docs.templates: per-project Markdown starting points copied into new documents.

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

create table if not exists docs.templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default '',
  description text not null default '',
  category text not null default 'General',
  body text not null default '',
  -- Expansion bag for not-yet-promoted config.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Back-fill older copies of the table (idempotent re-run on a partial apply).
alter table docs.templates
  add column if not exists project_id uuid not null references public.projects(id) on delete cascade;
alter table docs.templates add column if not exists name text not null default '';
alter table docs.templates add column if not exists description text not null default '';
alter table docs.templates add column if not exists category text not null default 'General';
alter table docs.templates add column if not exists body text not null default '';

create index if not exists templates_project_idx
  on docs.templates (project_id)
  where deleted_at is null;

drop trigger if exists templates_touch_updated_at on docs.templates;
create trigger templates_touch_updated_at
before update on docs.templates
for each row execute function docs.touch_updated_at();

-- Demo-open RLS (suite convention); tightening it is a later migration.
alter table docs.templates enable row level security;

drop policy if exists templates_demo_all on docs.templates;
create policy templates_demo_all on docs.templates
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on docs.templates to anon, authenticated;

-- @down
-- The shared schema and touch_updated_at() stay; dropping the table also drops its grants.
drop policy if exists templates_demo_all on docs.templates;
drop trigger if exists templates_touch_updated_at on docs.templates;
drop index if exists docs.templates_project_idx;
drop table if exists docs.templates cascade;
