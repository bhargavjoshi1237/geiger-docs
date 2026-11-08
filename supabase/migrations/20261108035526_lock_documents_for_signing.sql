-- Lock documents for signing
--
-- Owns: docs.enforce_document_signing_lock() and its trigger documents_signing_lock on docs.documents,
--   docs.document_merge_meta(uuid, jsonb), the private storage bucket docs-signing, and the service_role read grants
--   on docs.documents / docs.document_versions / docs.settings that the signing route handlers need.
-- Lock: title and body can't change while a live request for the document is sending, pending or completed
--   (cancelled, declined and failed unlock it), and the document can't be soft-deleted while a request is open
--   (sending/pending; deleting a signed document stays allowed). Applies to every role, the service role included.
-- docs-signing holds signed PDFs, certificates and audit logs under <projectId>/<requestId>/; it has no anon or
--   authenticated storage policies, so only the service role reads or writes it (the API hands out signed URLs).
-- document_merge_meta shallow-merges a patch into documents.metadata (e.g. { signing: { requestId, status, updatedAt } });
--   authenticated has no column grant on metadata, so the server writes it through this service_role-only function.
-- Depends on docs.documents, docs.signing_requests (create_signing_requests) and Supabase's storage.buckets.

-- @up
create schema if not exists docs;
grant usage on schema docs to anon, authenticated, service_role;

-- Trigger function: definer rights so the check sees every request regardless of the caller's RLS.
create or replace function docs.enforce_document_signing_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.title is distinct from old.title or new.body is distinct from old.body)
     and exists (
       select 1
         from docs.signing_requests r
        where r.document_id = old.id
          and r.deleted_at is null
          and r.status in ('sending', 'pending', 'completed')
     ) then
    raise exception 'document_locked_for_signing'
      using detail = 'The title and body are read-only while the document is out for signature or signed.',
            hint = 'Cancel the signing request, or duplicate the document to change it.';
  end if;
  if old.deleted_at is null
     and new.deleted_at is not null
     and exists (
       select 1
         from docs.signing_requests r
        where r.document_id = old.id
          and r.deleted_at is null
          and r.status in ('sending', 'pending')
     ) then
    raise exception 'document_locked_for_signing'
      using detail = 'A document can''t be deleted while it is out for signature.',
            hint = 'Cancel the signing request first.';
  end if;
  return new;
end;
$$;

revoke all on function docs.enforce_document_signing_lock() from public, anon, authenticated;

drop trigger if exists documents_signing_lock on docs.documents;
create trigger documents_signing_lock
before update of title, body, deleted_at on docs.documents
for each row execute function docs.enforce_document_signing_lock();

-- Shallow merge (metadata || patch) so one writer never clobbers another key; returns the merged metadata, or null.
create or replace function docs.document_merge_meta(p_id uuid, p_patch jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  update docs.documents
     set metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
   where id = p_id
  returning metadata;
$$;

revoke all on function docs.document_merge_meta(uuid, jsonb) from public, anon, authenticated;
grant execute on function docs.document_merge_meta(uuid, jsonb) to service_role;

-- The signing server reads documents, their latest version number and project settings on the service role.
grant select on docs.documents, docs.document_versions, docs.settings to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('docs-signing', 'docs-signing', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';

-- @down
-- The docs-signing bucket is left in place: storage rows can only be removed through the Storage API
-- (storage.protect_delete blocks direct deletes), and it may hold signed records.
revoke select on docs.documents, docs.document_versions, docs.settings from service_role;
drop function if exists docs.document_merge_meta(uuid, jsonb);
drop trigger if exists documents_signing_lock on docs.documents;
drop function if exists docs.enforce_document_signing_lock();

notify pgrst, 'reload schema';
