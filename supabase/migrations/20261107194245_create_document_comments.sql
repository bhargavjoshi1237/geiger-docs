-- Create document comments
--
-- Owns docs.document_comments: the flat comment thread on a document.

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

create table if not exists docs.document_comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references docs.documents(id) on delete cascade,
  body text not null,
  author_name text not null default '',
  author_email text not null default '',
  -- Expansion bag for not-yet-promoted config.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Back-fill older copies of the table (idempotent re-run on a partial apply).
alter table docs.document_comments
  add column if not exists document_id uuid not null references docs.documents(id) on delete cascade;
alter table docs.document_comments add column if not exists body text not null;
alter table docs.document_comments add column if not exists author_name text not null default '';
alter table docs.document_comments add column if not exists author_email text not null default '';

create index if not exists document_comments_document_idx
  on docs.document_comments (document_id)
  where deleted_at is null;

drop trigger if exists document_comments_touch_updated_at on docs.document_comments;
create trigger document_comments_touch_updated_at
before update on docs.document_comments
for each row execute function docs.touch_updated_at();

-- Demo-open RLS (suite convention); tightening it is a later migration.
alter table docs.document_comments enable row level security;

drop policy if exists document_comments_demo_all on docs.document_comments;
create policy document_comments_demo_all on docs.document_comments
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on docs.document_comments to anon, authenticated;

-- @down
-- The shared schema and touch_updated_at() stay; dropping the table also drops its grants.
drop policy if exists document_comments_demo_all on docs.document_comments;
drop trigger if exists document_comments_touch_updated_at on docs.document_comments;
drop index if exists docs.document_comments_document_idx;
drop table if exists docs.document_comments cascade;
