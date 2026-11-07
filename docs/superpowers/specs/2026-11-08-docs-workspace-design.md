# Geiger Docs v1 — Document Workspace Design

Date: 2026-11-08 · Branch: `feat/docs-workspace`

## Decisions

- Direction: document workspace first; e-signing is a later, separate project (see `docs/product-research/`).
- Editor: Markdown in a `@geiger/ui` `Textarea` with a rendered Preview (`react-markdown` + `remark-gfm`).
- Collections: flat, a document belongs to at most one.
- Sharing: per-document mode — `workspace` (default), `public` (read-only `/d/<id>` link), `restricted` (named people with viewer / commenter / editor roles). Restricted access is **UI-enforced only**; RLS stays demo-open (suite convention) until a later migration tightens it.
- Comments: a Comments tab on each document; commenters can post, viewers cannot.
- Statuses: `Draft` / `In review` / `Published` / `Archived`; new documents start as `Draft`.
- History: every content save (Save button or Ctrl/Cmd+S) inserts a version; title/status/collection inline edits do not.
- Routing: per project, like Events — `/project/[projectId]/<tabSlug>?doc=<id>&section=<editorTab>&collection=<id>`.
- UI: **only `@geiger/ui` components** (pinned to `1e33dcd`, v0.2.0, barrel and `@geiger/ui/<name>` subpaths). No local `components/ui/*`. Lucide icons. Semantic tokens only.

## Sidebar (exact titles = registry keys)

`Overview` · `Documents` · `Collections` · `Templates` · `Shared` · `Settings`

## File ownership

| Owner | Files |
|---|---|
| Foundation | `package.json`, `app/**` (except `app/d/**`), `context/project-context.js`, `lib/hooks/use-workspace-url.js`, `lib/workspace/tabs.js`, `components/internal/{shared,sidebar,topbar,workspace}/**`, `components/internal/screens/{registry.jsx,coming_soon.jsx}`, `components/internal/screens/documents/constants.js`, `components/internal/shared/markdown_view.jsx`, landing, `lib/rbac.js` |
| Data | `supabase/migrations/**`, `supabase/components/docs-client.js`, `lib/supabase/{documents,collections,templates,document_versions,document_members,document_comments,settings}.js` |
| Screens A | `screens/overview/**`, `screens/documents/{all_documents.jsx,create_document_dialog.jsx}` |
| Screens B | `screens/documents/document_detail.jsx`, `screens/documents/detail/**`, `screens/documents/access.js` |
| Screens C | `screens/collections/**`, `screens/templates/**` |
| Screens D | `screens/shared/**`, `screens/settings/**`, `app/d/**`, `lib/docs/fetch_public_document.js` |

## Database (`docs` schema)

One migration per table, scaffolded with `npm run db:new -- <name> --template table --table <t>`; standard columns (`id`, `metadata`, `created_by`, `created_at`, `updated_at`, `deleted_at`), `touch_updated_at` trigger, demo-open RLS, `@down`. Project FK: `project_id uuid not null references public.projects(id) on delete cascade`.

| Table | Columns (beyond standard) | Indexes |
|---|---|---|
| `docs.collections` | `project_id`, `name text not null default ''`, `description text not null default ''` | `(project_id) where deleted_at is null` |
| `docs.documents` | `project_id`, `collection_id uuid references docs.collections(id) on delete set null`, `title text not null default 'Untitled'`, `body text not null default ''`, `status text not null default 'Draft'` (check in the 4 statuses), `share_mode text not null default 'workspace'` (check in 3 modes) | `(project_id)`, `(collection_id)` partial on live rows |
| `docs.templates` | `project_id`, `name`, `description`, `category text not null default 'General'`, `body` | `(project_id)` partial |
| `docs.document_versions` | `document_id uuid not null references docs.documents(id) on delete cascade`, `version_number int not null`, `title text not null default ''`, `body text not null default ''` | unique `(document_id, version_number)` |
| `docs.document_members` | `document_id` (cascade), `email text not null`, `role text not null default 'viewer'` (check viewer/commenter/editor) | unique non-partial `(document_id, email)` (upsert target) |
| `docs.document_comments` | `document_id` (cascade), `body text not null`, `author_name text not null default ''`, `author_email text not null default ''` | `(document_id)` partial |
| `docs.settings` | `project_id` (unique, non-partial), `default_share_mode text not null default 'workspace'`, `allow_public_links boolean not null default true` | unique `(project_id)` |

Migration order: collections → documents → templates → document_versions → document_members → document_comments → settings.

## Data layer contract

All files: `"use client"`, header comment, `TABLE` const, `schemaClient()` + `isSupabaseConfigured()` from `@/supabase/components/docs-client`, `normalize*` (snake→camel, defaults, `...metadata` last), private `toRow` (emit only present keys), tri-state returns (`null` unconfigured/failed read · `[]` empty · object/`true` success · `false`/`null` failed write), `console.error("[docs.<area>.<op>]", …)`, never throw/toast. Lists filter `deleted_at is null`. `create*` honors a caller-supplied `id`.

View models:

```js
Document        { id, projectId, collectionId, title, body, status, shareMode, createdBy, createdAt, updatedAt }
Collection      { id, projectId, name, description, createdBy, createdAt, updatedAt }
Template        { id, projectId, name, description, category, body, createdBy, createdAt, updatedAt }
DocumentVersion { id, documentId, versionNumber, title, body, createdBy, createdAt }
DocumentMember  { id, documentId, email, role, createdBy, createdAt }
DocumentComment { id, documentId, body, authorName, authorEmail, createdBy, createdAt }
Settings        { id, projectId, defaultShareMode, allowPublicLinks }
```

Functions:

- `documents.js` — `normalizeDocument`, `listDocuments(projectId)` (newest `updated_at` first), `getDocument(id)`, `createDocument(input)`, `updateDocument(id, patch)`, `softDeleteDocument(id)`
- `collections.js` — `normalizeCollection`, `listCollections(projectId)` (name asc), `createCollection(input)`, `updateCollection(id, patch)`, `softDeleteCollection(id)` (also sets `collection_id = null` on its documents)
- `templates.js` — `normalizeTemplate`, `listTemplates(projectId)`, `createTemplate`, `updateTemplate`, `softDeleteTemplate`
- `document_versions.js` — `normalizeDocumentVersion`, `listDocumentVersions(documentId)` (newest first), `createDocumentVersion({ documentId, title, body, createdBy })` (computes next `version_number`)
- `document_members.js` — `normalizeDocumentMember`, `listDocumentMembers(documentId)`, `upsertDocumentMember({ documentId, email, role, createdBy })` (lower-cases email, upserts on `(document_id,email)`, clears `deleted_at`), `updateDocumentMember(id, { role })`, `removeDocumentMember(id)` (soft)
- `document_comments.js` — `normalizeDocumentComment`, `listDocumentComments(documentId)` (oldest first), `createDocumentComment(input)`, `softDeleteDocumentComment(id)`
- `settings.js` — `DEFAULT_SETTINGS`, `getSettings(projectId)` (no row → `{ ...DEFAULT_SETTINGS, projectId }`; unconfigured → `null`), `saveSettings(projectId, patch)` (upsert on `project_id`)

## Workspace plumbing (foundation)

- `useProject()` / `useOptionalProject()` → `{ project, projectId, projects, loading, setActiveProject, createProject, refresh }` (`public.projects`, last project in `localStorage` key `geiger-docs:last-project`).
- `useWorkspaceUrl()` → `{ projectId, tab, docId, section, collectionId, setProject, setTab, openDoc(id), openDocInTab(id, tab), closeDoc, setSection, openCollection(id), closeCollection }`. Tab/project changes `router.push`; query-only changes use `history.pushState` (`replaceState` for `setSection`).
- Screens take **no props** — read `projectId` from `useProject()` and ids from `useWorkspaceUrl()`.
- Opening a document from anywhere = `openDocInTab(id, "Documents")`; only the Documents screen renders the editor.
- `components/internal/screens/documents/constants.js`: `DOCUMENT_STATUSES`, `DOCUMENT_STATUS_MAP` (`{ label, variant, dotClass }` for `StatusPill`), `SHARE_MODES`, `SHARE_MODE_MAP` (`{ label, description, icon, variant }`), `MEMBER_ROLES` / `MEMBER_ROLE_MAP`, `STATUS_FILTER_OPTIONS`, `SHARE_FILTER_OPTIONS` (`"all"` sentinel first), `formatDate`, `formatRelative`, `publicDocumentUrl(id)`, `wordCount(body)`.
- `components/internal/shared/markdown_view.jsx`: `MarkdownView({ source, className })`.
- `components/internal/shared/filter_dropdown.jsx`: `FilterDropdown({ value, onValueChange, options, placeholder })`.

## Document editor contract (Screens B)

```jsx
<DocumentDetailScreen
  document={doc}            // Document view model from the list
  collections={collections} // Collection[]
  settings={settings}       // Settings
  onBack={closeDoc}
  onChange={(doc) => {}}    // sync the list after any optimistic edit
  onDelete={(id) => {}}     // list removes + persists + toasts
/>
```

Tabs (`section` URL param): `content` (Write/Preview, Save → `updateDocument` + `createDocumentVersion`, dirty indicator, Ctrl/Cmd+S) · `details` (inline title, status, collection, created/updated) · `history` (versions, preview, restore = load into editor + save as new version) · `sharing` (mode picker; public option hidden when `allowPublicLinks` false; copy public link; restricted → people list with email + role, add/change/remove) · `comments` (thread, post, delete own).
Access (`access.js`, `resolveDocumentAccess(doc, user, members)` → `owner|editor|commenter|viewer|none`): workspace/public → editor; restricted → creator = owner, member → their role, otherwise none; unknown user (no auth) → editor. Viewer/commenter: read-only content and details; `none` → no-access empty state.

## Screens

- **Overview** — `StatsBar` (Documents, Published, In review, Public links), "Recent documents" `SectionCard` + `DataTable` (top 8 by `updatedAt`), quick "New document" action.
- **Documents** — header + New document; `StatsBar`; `Toolbar` with status / collection / sharing filters + search; `DataTable` (title + collection/word-count meta, `StatusPill`, sharing badge, updated); row actions Open / Duplicate / Delete; loading / empty / filtered-empty; `?doc=` → editor (not-found state when the id isn't in the list).
- **Create document dialog** — title (required), collection (optional), start from template (optional, copies body), uses `settings.defaultShareMode`.
- **Collections** — list (name, description, doc count, updated), create / rename / delete dialogs; `?collection=` → detail with its documents (row → `openDocInTab`).
- **Templates** — list (name, category, description), create/edit dialog (name, category, description, markdown body with preview), delete, "Use template" → `createDocument` (Draft) → `openDocInTab`.
- **Shared** — documents with `shareMode` ≠ workspace; filter by mode; search; copy public link; row → `openDocInTab`.
- **Settings** — `SecondaryScreenWrapper`, `SettingsList`: default sharing mode (select), allow public links (switch); persists via `saveSettings`.
- **`/d/[id]`** — server page, `revalidate = 10`, `generateStaticParams() → []`; `fetchPublicDocument(id)` raw REST fetch (`Accept-Profile: docs`, `share_mode=eq.public`, `deleted_at=is.null`, UUID check); renders title + `MarkdownView`; `notFound()` otherwise.

## Verification

No test runner exists. Done = `npx eslint` clean on all changed files, `npm run build` succeeds, review agent pass. Migrations are written and lint-reviewed; `npm run db:push` needs `STRING_URI` in `.env` (not present in this repo) and is run by the user.
