-- Create settings
--
-- Owns docs.settings: one row of workspace preferences per project (default share mode, public links).

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

create table if not exists docs.settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  default_share_mode text not null default 'workspace',
  allow_public_links boolean not null default true,
  -- Expansion bag for not-yet-promoted config.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Back-fill older copies of the table (idempotent re-run on a partial apply).
alter table docs.settings
  add column if not exists project_id uuid not null references public.projects(id) on delete cascade;
alter table docs.settings add column if not exists default_share_mode text not null default 'workspace';
alter table docs.settings add column if not exists allow_public_links boolean not null default true;

-- Named check, dropped first so a re-run never duplicates it.
alter table docs.settings drop constraint if exists settings_default_share_mode_check;
alter table docs.settings add constraint settings_default_share_mode_check
  check (default_share_mode in ('workspace', 'public', 'restricted'));

-- One row per project; the upsert target, so non-partial (PostgREST can't infer a partial index).
create unique index if not exists settings_project_idx
  on docs.settings (project_id);

drop trigger if exists settings_touch_updated_at on docs.settings;
create trigger settings_touch_updated_at
before update on docs.settings
for each row execute function docs.touch_updated_at();

-- Demo-open RLS (suite convention); tightening it is a later migration.
alter table docs.settings enable row level security;

drop policy if exists settings_demo_all on docs.settings;
create policy settings_demo_all on docs.settings
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on docs.settings to anon, authenticated;

-- @down
-- The shared schema and touch_updated_at() stay; dropping the table also drops its grants.
drop policy if exists settings_demo_all on docs.settings;
drop trigger if exists settings_touch_updated_at on docs.settings;
drop index if exists docs.settings_project_idx;
alter table if exists docs.settings drop constraint if exists settings_default_share_mode_check;
drop table if exists docs.settings cascade;
