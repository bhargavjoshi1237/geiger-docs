-- Lock down RLS
--
-- Replaces the demo-open *_demo_all policies on every docs table with real, per-action RLS.
-- Owns (new): docs.current_email(), docs.document_access(uuid), docs.can_read_document(uuid),
--   docs.can_edit_document(uuid), docs.can_comment_document(uuid), docs.public_links_allowed(uuid),
--   docs.detach_deleted_collection() + trigger collections_detach_documents, and every policy created below.
-- Depends on (owned elsewhere): public.is_project_member(uuid) from geiger-dash 20261024195500_harden_org_and_roles_rls.
-- anon keeps only what the public /d/[id] page reads: public live documents of projects with public links on.
-- authenticated can no longer rewrite a document's project/owner or a comment's document/author (column-level update).
-- No delete policies: every table is soft delete only.
-- Rolling back restores the demo-open policies and grants exactly as the create_* migrations left them and drops the helpers.

-- @up

-- Fail with a clear message instead of a bare "function does not exist" when geiger-dash hasn't been pushed.
do $guard$
begin
  if to_regprocedure('public.is_project_member(uuid)') is null then
    raise exception 'docs lock_down_rls needs public.is_project_member(uuid); push geiger-dash 20261024195500_harden_org_and_roles_rls first';
  end if;
end;
$guard$;

-- Helpers ------------------------------------------------------------------------------------------------------------

-- False when the project switched public links off in Settings (no settings row means on); defined first because document_access calls it.
create or replace function docs.public_links_allowed(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
      from docs.settings s
     where s.project_id = p_project
       and s.allow_public_links = false
  );
$$;

-- The caller's JWT email, lowercased; null for anon.
create or replace function docs.current_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(auth.jwt() ->> 'email');
$$;

-- Single source of truth for document access: 'owner' | 'editor' | 'commenter' | 'viewer' | null (soft-deleted rows are not special-cased; public viewers need public links on).
create or replace function docs.document_access(p_document uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when d.created_by = auth.uid() then 'owner'
           when d.share_mode = 'restricted' then (
             select m.role
               from docs.document_members m
              where m.document_id = d.id
                and m.deleted_at is null
                and lower(m.email) = docs.current_email()
              limit 1
           )
           when d.share_mode in ('workspace', 'public') and public.is_project_member(d.project_id) then 'editor'
           when d.share_mode = 'public' and docs.public_links_allowed(d.project_id) then 'viewer'
           else null
         end
    from docs.documents d
   where d.id = p_document;
$$;

create or replace function docs.can_read_document(p_document uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select docs.document_access(p_document) is not null;
$$;

create or replace function docs.can_edit_document(p_document uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(docs.document_access(p_document) in ('owner', 'editor'), false);
$$;

create or replace function docs.can_comment_document(p_document uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(docs.document_access(p_document) in ('owner', 'editor', 'commenter'), false);
$$;

-- Only the anon documents policy needs a helper (public_links_allowed); lib/server/documents.js calls document_access as authenticated.
revoke all on function docs.public_links_allowed(uuid) from public;
grant execute on function docs.public_links_allowed(uuid) to anon, authenticated, service_role;
revoke all on function docs.current_email() from public, anon;
revoke all on function docs.document_access(uuid) from public, anon;
revoke all on function docs.can_read_document(uuid) from public, anon;
revoke all on function docs.can_edit_document(uuid) from public, anon;
revoke all on function docs.can_comment_document(uuid) from public, anon;
grant execute on function docs.current_email() to authenticated, service_role;
grant execute on function docs.document_access(uuid) to authenticated, service_role;
grant execute on function docs.can_read_document(uuid) to authenticated, service_role;
grant execute on function docs.can_edit_document(uuid) to authenticated, service_role;
grant execute on function docs.can_comment_document(uuid) to authenticated, service_role;

-- docs.documents -----------------------------------------------------------------------------------------------------

drop policy if exists documents_demo_all on docs.documents;

-- The owner clause is document_access's first rule read off the row: INSERT ... RETURNING checks this policy before the row exists.
drop policy if exists documents_select on docs.documents;
create policy documents_select on docs.documents
  for select to authenticated
  using (created_by = (select auth.uid()) or docs.can_read_document(id));

-- The public /d/[id] page reads with the anon key; the helper keeps this policy from querying docs.settings under RLS.
drop policy if exists documents_public_select on docs.documents;
create policy documents_public_select on docs.documents
  for select to anon
  using (share_mode = 'public' and deleted_at is null and docs.public_links_allowed(project_id));

drop policy if exists documents_insert on docs.documents;
create policy documents_insert on docs.documents
  for insert to authenticated
  with check (
    public.is_project_member(project_id)
    and (created_by is null or created_by = (select auth.uid()))
  );

drop policy if exists documents_update on docs.documents;
create policy documents_update on docs.documents
  for update to authenticated
  using (docs.can_edit_document(id))
  with check (public.is_project_member(project_id) or docs.can_edit_document(id));

-- docs.document_versions ---------------------------------------------------------------------------------------------

drop policy if exists document_versions_demo_all on docs.document_versions;

drop policy if exists document_versions_select on docs.document_versions;
create policy document_versions_select on docs.document_versions
  for select to authenticated
  using (docs.can_read_document(document_id));

drop policy if exists document_versions_insert on docs.document_versions;
create policy document_versions_insert on docs.document_versions
  for insert to authenticated
  with check (docs.can_edit_document(document_id));

-- docs.document_members ----------------------------------------------------------------------------------------------

drop policy if exists document_members_demo_all on docs.document_members;

drop policy if exists document_members_select on docs.document_members;
create policy document_members_select on docs.document_members
  for select to authenticated
  using (docs.can_read_document(document_id) or lower(email) = (select docs.current_email()));

drop policy if exists document_members_insert on docs.document_members;
create policy document_members_insert on docs.document_members
  for insert to authenticated
  with check (docs.can_edit_document(document_id));

drop policy if exists document_members_update on docs.document_members;
create policy document_members_update on docs.document_members
  for update to authenticated
  using (docs.can_edit_document(document_id))
  with check (docs.can_edit_document(document_id));

-- docs.document_comments ---------------------------------------------------------------------------------------------

drop policy if exists document_comments_demo_all on docs.document_comments;

drop policy if exists document_comments_select on docs.document_comments;
create policy document_comments_select on docs.document_comments
  for select to authenticated
  using (docs.can_read_document(document_id));

drop policy if exists document_comments_insert on docs.document_comments;
create policy document_comments_insert on docs.document_comments
  for insert to authenticated
  with check (docs.can_comment_document(document_id) and created_by = (select auth.uid()));

-- Authors manage their own comments; the document owner can moderate any.
drop policy if exists document_comments_update on docs.document_comments;
create policy document_comments_update on docs.document_comments
  for update to authenticated
  using (created_by = (select auth.uid()) or docs.document_access(document_id) = 'owner')
  with check (created_by = (select auth.uid()) or docs.document_access(document_id) = 'owner');

-- docs.collections / docs.templates / docs.settings: any member of the project --------------------------------------

drop policy if exists collections_demo_all on docs.collections;

drop policy if exists collections_select on docs.collections;
create policy collections_select on docs.collections
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists collections_insert on docs.collections;
create policy collections_insert on docs.collections
  for insert to authenticated
  with check (public.is_project_member(project_id));

drop policy if exists collections_update on docs.collections;
create policy collections_update on docs.collections
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- Soft-deleting a collection detaches all its documents, including restricted ones the caller can't edit.
create or replace function docs.detach_deleted_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update docs.documents set collection_id = null where collection_id = new.id;
  return null;
end;
$$;

-- Trigger functions are never called directly; firing doesn't need EXECUTE.
revoke all on function docs.detach_deleted_collection() from public, anon, authenticated;

drop trigger if exists collections_detach_documents on docs.collections;
create trigger collections_detach_documents
after update of deleted_at on docs.collections
for each row
when (old.deleted_at is null and new.deleted_at is not null)
execute function docs.detach_deleted_collection();

drop policy if exists templates_demo_all on docs.templates;

drop policy if exists templates_select on docs.templates;
create policy templates_select on docs.templates
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists templates_insert on docs.templates;
create policy templates_insert on docs.templates
  for insert to authenticated
  with check (public.is_project_member(project_id));

drop policy if exists templates_update on docs.templates;
create policy templates_update on docs.templates
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

drop policy if exists settings_demo_all on docs.settings;

drop policy if exists settings_select on docs.settings;
create policy settings_select on docs.settings
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists settings_insert on docs.settings;
create policy settings_insert on docs.settings
  for insert to authenticated
  with check (public.is_project_member(project_id));

drop policy if exists settings_update on docs.settings;
create policy settings_update on docs.settings
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- Grants -------------------------------------------------------------------------------------------------------------

-- anon never writes and reads public documents only; the settings column grant just keeps fetch_public_document's settings read from erroring (no anon policy, so it sees no rows).
revoke insert, update, delete
  on docs.collections, docs.documents, docs.templates, docs.document_versions,
     docs.document_members, docs.document_comments, docs.settings
  from anon;
revoke select
  on docs.collections, docs.templates, docs.document_versions,
     docs.document_members, docs.document_comments, docs.settings
  from anon;
grant select (project_id, allow_public_links) on docs.settings to anon;

-- A document's project/owner and a comment's document/author are fixed after insert; metadata is server-written.
revoke update on docs.documents, docs.document_comments from authenticated;
grant update (collection_id, title, body, status, share_mode, deleted_at) on docs.documents to authenticated;
grant update (body, deleted_at) on docs.document_comments to authenticated;

notify pgrst, 'reload schema';

-- @down

drop policy if exists settings_update on docs.settings;
drop policy if exists settings_insert on docs.settings;
drop policy if exists settings_select on docs.settings;
drop policy if exists settings_demo_all on docs.settings;
create policy settings_demo_all on docs.settings
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists templates_update on docs.templates;
drop policy if exists templates_insert on docs.templates;
drop policy if exists templates_select on docs.templates;
drop policy if exists templates_demo_all on docs.templates;
create policy templates_demo_all on docs.templates
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop trigger if exists collections_detach_documents on docs.collections;
drop function if exists docs.detach_deleted_collection();
drop policy if exists collections_update on docs.collections;
drop policy if exists collections_insert on docs.collections;
drop policy if exists collections_select on docs.collections;
drop policy if exists collections_demo_all on docs.collections;
create policy collections_demo_all on docs.collections
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists document_comments_update on docs.document_comments;
drop policy if exists document_comments_insert on docs.document_comments;
drop policy if exists document_comments_select on docs.document_comments;
drop policy if exists document_comments_demo_all on docs.document_comments;
create policy document_comments_demo_all on docs.document_comments
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists document_members_update on docs.document_members;
drop policy if exists document_members_insert on docs.document_members;
drop policy if exists document_members_select on docs.document_members;
drop policy if exists document_members_demo_all on docs.document_members;
create policy document_members_demo_all on docs.document_members
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists document_versions_insert on docs.document_versions;
drop policy if exists document_versions_select on docs.document_versions;
drop policy if exists document_versions_demo_all on docs.document_versions;
create policy document_versions_demo_all on docs.document_versions
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists documents_update on docs.documents;
drop policy if exists documents_insert on docs.documents;
drop policy if exists documents_public_select on docs.documents;
drop policy if exists documents_select on docs.documents;
drop policy if exists documents_demo_all on docs.documents;
create policy documents_demo_all on docs.documents
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Clear the column-level grants first so only the original table-level grants remain.
revoke update (collection_id, title, body, status, share_mode, deleted_at) on docs.documents from authenticated;
revoke update (body, deleted_at) on docs.document_comments from authenticated;
revoke select (project_id, allow_public_links) on docs.settings from anon;
grant select, insert, update, delete
  on docs.collections, docs.documents, docs.templates, docs.document_versions,
     docs.document_members, docs.document_comments, docs.settings
  to anon, authenticated;

-- Fails (no cascade) while a later migration's policy still uses a helper; roll that one back first.
drop function if exists docs.can_comment_document(uuid);
drop function if exists docs.can_edit_document(uuid);
drop function if exists docs.can_read_document(uuid);
drop function if exists docs.document_access(uuid);
drop function if exists docs.current_email();
drop function if exists docs.public_links_allowed(uuid);

notify pgrst, 'reload schema';
