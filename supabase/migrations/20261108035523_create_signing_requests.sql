-- Create signing requests
--
-- Owns docs.signing_requests: one e-signature request per send of a document to Documenso (status, envelope, stored files).
-- Writes come only from the /api/signing/* route handlers on the service role. Signed-in users read signing data only
-- through docs.can_view_signing(uuid) (owned here, also used by the signing_recipients / signing_events policies):
-- a reader of the document who is also its creator, a project member or a named member. Public-link viewers are not,
-- so recipients' names, emails and decline reasons stay private.
-- Depends on docs.documents, docs.document_members, docs.can_read_document(uuid) and docs.current_email() (lock_down_rls),
-- and public.is_project_member(uuid) (geiger-dash).
-- At most one open (sending/pending) request per document, enforced by a partial unique index.

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

create table if not exists docs.signing_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid not null references docs.documents(id) on delete cascade,
  -- Latest document_versions.version_number when sent (null when the document has no versions).
  version_number int,
  title text not null default '',
  subject text not null default '',
  message text not null default '',
  signing_order text not null default 'parallel',
  status text not null default 'sending',
  envelope_id text,
  sent_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  -- Object paths in the private docs-signing bucket, set once the completed files are stored.
  signed_pdf_path text,
  certificate_path text,
  audit_log_path text,
  error text,
  -- Expansion bag for not-yet-promoted config.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Back-fill older copies of the table (idempotent re-run on a partial apply).
alter table docs.signing_requests
  add column if not exists project_id uuid not null references public.projects(id) on delete cascade;
alter table docs.signing_requests
  add column if not exists document_id uuid not null references docs.documents(id) on delete cascade;
alter table docs.signing_requests add column if not exists version_number int;
alter table docs.signing_requests add column if not exists title text not null default '';
alter table docs.signing_requests add column if not exists subject text not null default '';
alter table docs.signing_requests add column if not exists message text not null default '';
alter table docs.signing_requests add column if not exists signing_order text not null default 'parallel';
alter table docs.signing_requests add column if not exists status text not null default 'sending';
alter table docs.signing_requests add column if not exists envelope_id text;
alter table docs.signing_requests add column if not exists sent_at timestamptz;
alter table docs.signing_requests add column if not exists completed_at timestamptz;
alter table docs.signing_requests add column if not exists closed_at timestamptz;
alter table docs.signing_requests add column if not exists signed_pdf_path text;
alter table docs.signing_requests add column if not exists certificate_path text;
alter table docs.signing_requests add column if not exists audit_log_path text;
alter table docs.signing_requests add column if not exists error text;

-- Named checks, dropped first so a re-run never duplicates them.
alter table docs.signing_requests drop constraint if exists signing_requests_signing_order_check;
alter table docs.signing_requests add constraint signing_requests_signing_order_check
  check (signing_order in ('parallel', 'sequential'));

alter table docs.signing_requests drop constraint if exists signing_requests_status_check;
alter table docs.signing_requests add constraint signing_requests_status_check
  check (status in ('sending', 'pending', 'completed', 'declined', 'cancelled', 'failed'));

-- One open request per document; a racing second send fails with 23505 (the API answers 409).
create unique index if not exists signing_requests_open_document_idx
  on docs.signing_requests (document_id)
  where status in ('sending', 'pending') and deleted_at is null;

-- Webhooks fall back to matching on the Documenso envelope id.
create unique index if not exists signing_requests_envelope_idx
  on docs.signing_requests (envelope_id)
  where envelope_id is not null;

-- A document's requests, newest first.
create index if not exists signing_requests_document_idx
  on docs.signing_requests (document_id, created_at desc)
  where deleted_at is null;

drop trigger if exists signing_requests_touch_updated_at on docs.signing_requests;
create trigger signing_requests_touch_updated_at
before update on docs.signing_requests
for each row execute function docs.touch_updated_at();

-- Who may see a document's signing data: a reader who created it, belongs to its project or is a named member.
create or replace function docs.can_view_signing(p_document uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select docs.can_read_document(d.id)
           and (
             d.created_by = auth.uid()
             or public.is_project_member(d.project_id)
             or exists (
               select 1
                 from docs.document_members m
                where m.document_id = d.id
                  and m.deleted_at is null
                  and lower(m.email) = docs.current_email()
             )
           )
      from docs.documents d
     where d.id = p_document
  ), false);
$$;

revoke all on function docs.can_view_signing(uuid) from public, anon;
grant execute on function docs.can_view_signing(uuid) to authenticated, service_role;

-- Read-only for signing viewers of the document; no client writes (no insert/update policies).
alter table docs.signing_requests enable row level security;

drop policy if exists signing_requests_select on docs.signing_requests;
create policy signing_requests_select on docs.signing_requests
  for select to authenticated
  using (docs.can_view_signing(document_id));

revoke all on docs.signing_requests from anon, authenticated;
grant select on docs.signing_requests to authenticated;
grant all on docs.signing_requests to service_role;

notify pgrst, 'reload schema';

-- @down
-- The shared schema and touch_updated_at() stay; dropping the table also drops its grants, policy, indexes and trigger.
drop policy if exists signing_requests_select on docs.signing_requests;
drop trigger if exists signing_requests_touch_updated_at on docs.signing_requests;
drop index if exists docs.signing_requests_document_idx;
drop index if exists docs.signing_requests_envelope_idx;
drop index if exists docs.signing_requests_open_document_idx;
alter table if exists docs.signing_requests drop constraint if exists signing_requests_status_check;
alter table if exists docs.signing_requests drop constraint if exists signing_requests_signing_order_check;
drop table if exists docs.signing_requests cascade;
-- Fails (no cascade) while the signing_recipients / signing_events policies still use it; roll those back first.
drop function if exists docs.can_view_signing(uuid);

notify pgrst, 'reload schema';
