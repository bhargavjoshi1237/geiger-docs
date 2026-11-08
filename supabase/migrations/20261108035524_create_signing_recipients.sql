-- Create signing recipients
--
-- Owns docs.signing_recipients: the people on a signing request, in position order (position N is rN in field tokens).
-- Mirrors Documenso's read/signing state per recipient; signing tokens and URLs are never stored.
-- Writes come only from the /api/signing/* route handlers on the service role; signed-in users read the recipients
-- of requests whose document passes docs.can_view_signing(uuid). Depends on docs.signing_requests and
-- docs.can_view_signing(uuid) (create_signing_requests).

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

create table if not exists docs.signing_recipients (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references docs.signing_requests(id) on delete cascade,
  position int not null,
  name text not null default '',
  email text not null default '',
  role text not null default 'signer',
  signing_order int,
  documenso_recipient_id bigint,
  read_status text not null default 'not_opened',
  signing_status text not null default 'not_signed',
  signed_at timestamptz,
  rejection_reason text,
  -- Expansion bag for not-yet-promoted config.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Back-fill older copies of the table (idempotent re-run on a partial apply).
alter table docs.signing_recipients
  add column if not exists request_id uuid not null references docs.signing_requests(id) on delete cascade;
alter table docs.signing_recipients add column if not exists position int not null;
alter table docs.signing_recipients add column if not exists name text not null default '';
alter table docs.signing_recipients add column if not exists email text not null default '';
alter table docs.signing_recipients add column if not exists role text not null default 'signer';
alter table docs.signing_recipients add column if not exists signing_order int;
alter table docs.signing_recipients add column if not exists documenso_recipient_id bigint;
alter table docs.signing_recipients add column if not exists read_status text not null default 'not_opened';
alter table docs.signing_recipients add column if not exists signing_status text not null default 'not_signed';
alter table docs.signing_recipients add column if not exists signed_at timestamptz;
alter table docs.signing_recipients add column if not exists rejection_reason text;

-- Named checks, dropped first so a re-run never duplicates them.
alter table docs.signing_recipients drop constraint if exists signing_recipients_position_check;
alter table docs.signing_recipients add constraint signing_recipients_position_check
  check (position >= 1);

alter table docs.signing_recipients drop constraint if exists signing_recipients_role_check;
alter table docs.signing_recipients add constraint signing_recipients_role_check
  check (role in ('signer', 'approver', 'cc'));

alter table docs.signing_recipients drop constraint if exists signing_recipients_read_status_check;
alter table docs.signing_recipients add constraint signing_recipients_read_status_check
  check (read_status in ('not_opened', 'opened'));

alter table docs.signing_recipients drop constraint if exists signing_recipients_signing_status_check;
alter table docs.signing_recipients add constraint signing_recipients_signing_status_check
  check (signing_status in ('not_signed', 'signed', 'declined'));

-- One recipient per position of a request; also serves the position-ordered embed.
create unique index if not exists signing_recipients_request_position_idx
  on docs.signing_recipients (request_id, position);

drop trigger if exists signing_recipients_touch_updated_at on docs.signing_recipients;
create trigger signing_recipients_touch_updated_at
before update on docs.signing_recipients
for each row execute function docs.touch_updated_at();

-- Read-only for signing viewers of the request's document; no client writes (no insert/update policies).
alter table docs.signing_recipients enable row level security;

drop policy if exists signing_recipients_select on docs.signing_recipients;
create policy signing_recipients_select on docs.signing_recipients
  for select to authenticated
  using (
    exists (
      select 1
        from docs.signing_requests r
       where r.id = signing_recipients.request_id
         and docs.can_view_signing(r.document_id)
    )
  );

revoke all on docs.signing_recipients from anon, authenticated;
grant select on docs.signing_recipients to authenticated;
grant all on docs.signing_recipients to service_role;

notify pgrst, 'reload schema';

-- @down
-- The shared schema and touch_updated_at() stay; dropping the table also drops its grants, policy, index and trigger.
drop policy if exists signing_recipients_select on docs.signing_recipients;
drop trigger if exists signing_recipients_touch_updated_at on docs.signing_recipients;
drop index if exists docs.signing_recipients_request_position_idx;
alter table if exists docs.signing_recipients drop constraint if exists signing_recipients_signing_status_check;
alter table if exists docs.signing_recipients drop constraint if exists signing_recipients_read_status_check;
alter table if exists docs.signing_recipients drop constraint if exists signing_recipients_role_check;
alter table if exists docs.signing_recipients drop constraint if exists signing_recipients_position_check;
drop table if exists docs.signing_recipients cascade;

notify pgrst, 'reload schema';
