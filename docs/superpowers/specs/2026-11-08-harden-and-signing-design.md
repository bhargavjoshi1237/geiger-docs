# Geiger Docs — Harden v1 + Signing Design

Date: 2026-11-08 · Branch: `feat/harden-and-signing` · Builds on `2026-11-08-docs-workspace-design.md`.

Three steps, in order: **Harden v1** → **Signing decision** → **Signing core**. Conventions in `MODULE_CONVENTIONS.md`, `SUPABASE_CONVENTIONS.md`, `MIGRATION_CONVENTIONS.md` and `crafting.md` apply throughout. UI uses `@geiger/ui` only, Lucide icons, semantic tokens. Read `node_modules/next/dist/docs/` before writing Next.js server code (Next 16: `proxy.js` replaces middleware, `params`/`cookies()` are async).

## Decisions (confirmed with the user)

| Topic | Decision |
|---|---|
| Documenso hosting | Self-hosted, **unmodified** official Docker image. Called only over its HTTP API v2 (`/api/v2/envelope/*`). AGPL stays clean because Geiger Docs is not a derivative work. |
| Field placement | Auto **signature page** at the end of every PDF (one block per signer: signature, name, date) **plus** optional inline fields authors insert into the Markdown as Documenso placeholders (`{{signature, r1}}`). |
| Delivery | Documenso sends the signing emails, reminders and completed copies itself, through the suite's **Resend** account (`NEXT_PRIVATE_SMTP_TRANSPORT=resend`) from a `geiger.studio` address. Suite email (`/api/email/send`) stays a later fallback; keep delivery isolated in `lib/server/documenso.js` (`distributionMethod`). |
| Locking | Content (title + body) is read-only while a request is `sending`/`pending` and after `completed`. `cancelled`, `declined` and `failed` unlock it. Enforced by a DB trigger; the UI mirrors it. |

## Environment (`.env.example`)

```bash
NEXT_PUBLIC_SUPABASE_URL=            # runtime (browser)
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_COOKIE_DOMAIN=           # same value the hub uses, e.g. .geiger.studio (blank locally)
NEXT_PUBLIC_DASH_ORIGIN=             # hub origin for /login (e.g. https://geiger.studio; http://localhost:3000 locally)
SUPABASE_SERVICE_ROLE_KEY=           # server-only: webhook writes, notifications, storage
STRING_URI=                          # server-only: migrations (@geiger/orm)
DOCUMENSO_URL=                       # server-only: e.g. https://sign.geiger.studio (no trailing /api/v2)
DOCUMENSO_API_TOKEN=                 # server-only: team API token
DOCUMENSO_WEBHOOK_SECRET=            # server-only: shared secret sent in X-Documenso-Secret
```

---

## Step 1 — Harden v1

### 1a. Auth + server foundation (owner: Agent H-AUTH)

Files: `proxy.js`, `lib/supabase/client.js`, `lib/server/supabase.js`, `lib/server/http.js`, `lib/server/documents.js`, `lib/client/api.js`, `components/internal/screens/documents/access.js`, `.env.example`.

- **`proxy.js`** (root): optimistic gate copied from geiger-forms (`C:\Pro\geiger-forms\proxy.js`). Signed-out requests to `/project/:path*`, `/home`, `/org` redirect to `${NEXT_PUBLIC_DASH_ORIGIN}/login?next=docs`. Never gates `/`, `/d/*`, `/api/*`, `/pallet*`, static assets. Check how `basePath` interacts with the matcher in the Next 16 docs.
- **`lib/supabase/client.js`**: pass `cookieOptions` matching dash (`domain: NEXT_PUBLIC_COOKIE_DOMAIN || undefined, path: "/", sameSite: "lax", secure: prod`).
- **`lib/server/supabase.js`** (`import "server-only"`):
  - `sessionClient()` → cookie-bound `createServerClient` (async `cookies()`, same `cookieOptions`).
  - `getSessionUser()` → `{ id, email, name } | null` using verified `auth.getUser()`.
  - `adminClient()` → service-role client (`persistSession: false`) or `null` when the key is missing.
- **`lib/server/http.js`**: `ok(data, status = 200)`, `fail(status, message, code?)`, `unauthorized()`, `forbidden()`, `notFound()`, `readJson(request, limitBytes = 64 * 1024)` → parsed body or `null`.
- **`lib/server/documents.js`**: `requireDocument(id, { need = "read" | "edit" | "comment" })` → `{ user, document, access } | { error: Response }`. Uses `sessionClient()`, calls RPC `docs.document_access(p_document)` (defined in 1b) and loads the row under the caller's RLS. `document` is the camelCase view model (reuse `normalizeDocument` shape, but it must not import a `"use client"` file — copy the mapping or extract a shared pure module).
- **`lib/client/api.js`**: `apiRequest(path, { method = "GET", body, signal } = {})` → `{ data, error, status }`, never throws. Prefixes `process.env.NEXT_PUBLIC_BASE_PATH`. JSON in/out; `error` is the server's `message` or a generic string.
- **`access.js`**: no signed-in user → `"none"` (the workspace is now gated). Keep the rest; add a header comment that `docs.document_access()` is the source of truth and this mirrors it for the UI.

### 1b. Real RLS (owner: Agent H-RLS)

Files: one new migration `npm run db:new -- lock_down_rls --template raw`, plus compatibility fixes only in `lib/supabase/{documents,collections,templates,document_versions,document_members,document_comments,settings}.js`.

Uses the dash-owned `public.is_project_member(uuid)` (SECURITY DEFINER; see `C:\Pro\geiger-dash\supabase\migrations\20261024195500_harden_org_and_roles_rls.sql`). Name that dependency in the header.

Helpers in `docs` (all `language sql stable security definer set search_path = ''`, `revoke all … from public`, `grant execute … to anon, authenticated, service_role` as appropriate):

- `docs.current_email()` → `lower(auth.jwt() ->> 'email')`.
- `docs.document_access(p_document uuid) returns text` — the **single source of truth**:
  - row missing → `null` (soft-deleted rows are **not** special-cased: `update … returning` on a soft delete must still pass the select policy; lists filter `deleted_at`, and the anon public policy checks it)
  - `created_by = auth.uid()` → `'owner'`
  - `share_mode = 'restricted'` → the caller's live `document_members.role` matched by `lower(email) = docs.current_email()`, else `null`
  - `share_mode in ('workspace','public')` and `public.is_project_member(project_id)` → `'editor'`
  - `share_mode = 'public'` and `docs.public_links_allowed(project_id)` otherwise (incl. anon) → `'viewer'`
  - else `null`
- `docs.can_read_document(uuid)`, `docs.can_edit_document(uuid)` (`owner`/`editor`), `docs.can_comment_document(uuid)` (`owner`/`editor`/`commenter`).

Policies (drop every `*_demo_all`; one policy per action; revoke `insert, update, delete` from `anon` on every docs table):

| Table | select | insert | update |
|---|---|---|---|
| documents | `docs.can_read_document(id)`; plus `to anon using (share_mode = 'public' and deleted_at is null)` | `public.is_project_member(project_id) and (created_by is null or created_by = auth.uid())` | using `docs.can_edit_document(id)`, check `public.is_project_member(project_id) or docs.can_edit_document(id)` |
| document_versions | `docs.can_read_document(document_id)` | `docs.can_edit_document(document_id)` | none |
| document_members | `docs.can_read_document(document_id) or lower(email) = docs.current_email()` | `docs.can_edit_document(document_id)` | `docs.can_edit_document(document_id)` |
| document_comments | `docs.can_read_document(document_id)` | `docs.can_comment_document(document_id) and created_by = auth.uid()` | `created_by = auth.uid() or docs.document_access(document_id) = 'owner'` |
| collections, templates, settings | `public.is_project_member(project_id)` | same | same |

No `delete` policies (soft delete only). `@down` restores the demo-open policies and grants exactly as before and drops the helpers. Audit each data-layer insert so it satisfies the checks (e.g. `created_by` stamped with the session user). The public page (`lib/docs/fetch_public_document.js`, anon REST) must keep working through the anon policy.

### 1c. Notifications (owner: Agent H-NOTIFY)

Files: `package.json` (+ `@geiger/notify` from GitHub, same style as `@geiger/ui`), `next.config.mjs` (`transpilePackages`), `app/globals.css` (`@source` for notify), `components/internal/topbar/**`, `lib/notifications/**`, `lib/server/notifications.js`, and the notify calls inside `components/internal/screens/documents/detail/{comments_tab,sharing_tab}.jsx`.

- Replace the Flow-copied dropdown with `@geiger/notify/react` `NotificationBell` (`app="docs"`), mirroring `C:\Pro\geiger-events\components\internal\topbar\dialogue\notifications_bell.jsx`. Delete the old dropdown.
- `lib/notifications/types.js` — `defineNotificationTypes` for: `docs.comment.created`, `docs.document.shared`, `docs.signing.signed`, `docs.signing.completed`, `docs.signing.declined`, `docs.signing.cancelled`, `docs.signing.expired`. Every `url` deep-links to `/project/<projectId>/documents?doc=<id>&section=<comments|sharing|signing>` (respect base path).
- Client sends (session sender, allowed for users sharing an org): comment created → the document's creator (skip self); member added → the invited person (resolve email → user id via `public.organization_members(p_org)`; skip if not found). Fire-and-forget after the write succeeds; never block or toast on notify failure.
- **Contract for Step 3** — `lib/server/notifications.js` (`import "server-only"`, uses `createServerNotifier`):
  `notifySigningEvent({ type, projectId, documentId, documentTitle, recipientsUserIds, recipientName? })` → `Promise<void>`, never throws. `type` ∈ `signed | completed | declined | cancelled | expired`.

---

## Step 2 — Signing decision (owner: Agent S-DECIDE)

Files: `docs/decisions/2026-11-08-signing-with-documenso.md` (decision record), `deploy/documenso/compose.yml`, `deploy/documenso/.env.example`, `deploy/documenso/README.md`.

- Decision record: context, options considered (Cloud vs self-host vs commercial; field placement; delivery; locking), decision, AGPL reasoning with Documenso's own policy quotes, consequences, revisit triggers.
- Deploy kit: pinned `documenso/documenso:v2.21.1` + `postgres:15`, cert generation (`openssl` → `cert.p12`, uid 1001, non-empty passphrase), Resend transport, `NEXT_PUBLIC_DISABLE_SIGNUP`, health checks, first-admin step, creating the team API token, creating the team webhook (`<app>/api/signing/webhook`, events listed in Step 3, secret), team document preferences (include signing certificate + audit log), and `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS` when Documenso and the app share a private network.

---

## Step 3 — Signing core

### Shared, pre-written (owner: lead) — `lib/signing/model.js`, `lib/signing/fields.js`

Isomorphic (no `"use client"`, no server imports). Agents import these and must not redefine them.

- `model.js`: `SIGNING_STATUSES`, `OPEN_SIGNING_STATUSES` (`sending`, `pending`), `LOCKING_SIGNING_STATUSES` (+ `completed`), `SIGNING_ORDERS` (`parallel`, `sequential`), `RECIPIENT_ROLES` (`signer`, `approver`, `cc`), `READ_STATUSES`, `RECIPIENT_SIGNING_STATUSES`, `MAX_RECIPIENTS` (10), `isOpenStatus(status)`, `isLockingStatus(status)`, `normalizeEmail(value)`, `validateRecipients(recipients)` → `string | null`.
- `fields.js`: `FIELD_TYPES` (`{ value, label }[]` for the Insert menu), `fieldTokenRegex()` (fresh global regex), `fieldTypeLabel(type)`, `buildFieldToken(type, position, options?)`, `parseFieldTokens(body)` → `[{ raw, type, position, options, index }]`, `splitFieldTokens(text)` → `(string | token)[]` (for chips), `validateFieldTokens(body, recipients)` → `string | null` (flags unassigned `{{signature}}`, out-of-range `rN`, and fields on non-signers).

### 3a. Data + server + routes (owner: Agent S-BACKEND)

**Migrations** (scaffold each with `npm run db:new`): `create_signing_requests`, `create_signing_recipients`, `create_signing_events`, `lock_documents_for_signing`.

- `docs.signing_requests`: standard columns + `project_id` (FK `public.projects`, cascade), `document_id` (FK `docs.documents`, cascade), `version_number int`, `title text`, `subject text`, `message text`, `signing_order text` (`parallel`|`sequential`), `status text` (`sending`|`pending`|`completed`|`declined`|`cancelled`|`failed`, default `sending`), `envelope_id text` (unique when not null), `sent_at`, `completed_at`, `closed_at`, `signed_pdf_path`, `certificate_path`, `audit_log_path`, `error text`. Partial unique index: one open request per document (`status in ('sending','pending') and deleted_at is null`).
- `docs.signing_recipients`: standard columns + `request_id` (cascade), `position int` (1-based; `rN` in tokens), `name`, `email`, `role` (`signer`|`approver`|`cc`), `signing_order int`, `documenso_recipient_id bigint`, `read_status` (`not_opened`|`opened`), `signing_status` (`not_signed`|`signed`|`declined`), `signed_at`, `rejection_reason`. Unique `(request_id, position)`. Signing tokens/URLs are **never stored**.
- `docs.signing_events`: `id`, `request_id` (nullable, set null), `envelope_id`, `event`, `dedupe_key text unique`, `payload jsonb`, `received_at`. Idempotency log for webhooks.
- RLS: `select` on all three via `docs.can_view_signing(document_id)` (join through the request) — `can_read_document` plus creator, project member or invited person, so public-link-only viewers never see recipients or signed files. No client writes: all writes go through route handlers with `adminClient()`.
- `lock_documents_for_signing`: `before update` trigger on `docs.documents` raising `document_locked_for_signing` when `title` or `body` changes while a live request for that document has a locking status; private storage bucket `docs-signing` (no anon/authenticated storage policies); `docs.document_merge_meta(p_id uuid, p_patch jsonb)` (`metadata = metadata || p_patch`, service_role only).
- **Denormalised status**: whenever a request changes, the server writes `documents.metadata.signing = { requestId, status, updatedAt }` via `document_merge_meta`. `normalizeDocument` spreads it, so the UI reads `doc.signing?.status` with no extra query.

**Server modules** (`import "server-only"`):

- `lib/server/documenso.js` — the only Documenso caller. Plain `fetch` to `${DOCUMENSO_URL}/api/v2`, header `Authorization: <token>`. `isDocumensoConfigured()`, `createEnvelope({ title, externalId, pdf, recipients, meta })` (multipart `payload` + `files`), `getEnvelope(id)`, `distributeEnvelope(id, meta)`, `redistributeEnvelope(id, recipientIds)`, `cancelEnvelope(id, reason)`, `deleteEnvelope(id)`, `downloadEnvelopeItem(itemId)`, `downloadCertificate(id)`, `downloadAuditLog(id)`, `verifyWebhookSecret(value)` (`crypto.timingSafeEqual`). Return `null`/`false` on failure with `console.error("[docs.documenso.<op>]", …)`; handle 429 `Retry-After` once. The exact schemas are in the OpenAPI spec at `C:\Users\space\AppData\Local\Temp\claude\C--Pro-geiger-docs\0a38d94e-78ac-4caa-9440-e9e7d1da7567\scratchpad\dl_openapi\spec.json`.
- `lib/server/signing.js` — orchestration: `sendForSignature`, `remindSigning`, `cancelSigning`, `syncSigningRequest`, `applyWebhookEvent`, `storeCompletedFiles`. Send flow: validate → insert request (`sending`) + recipients → render PDF (3b) → `createEnvelope` (`externalId` = request id, `meta.signingOrder`, `distributionMethod: "EMAIL"`; no `redirectUrl` — signers are external and can't open the workspace) → map recipient ids → `distributeEnvelope` → `pending`. Any failure after insert marks the request `failed` with `error`, deletes a created envelope, and unlocks.
- Webhook events handled: `DOCUMENT_SENT`, `DOCUMENT_OPENED`, `DOCUMENT_SIGNED`, `DOCUMENT_RECIPIENT_COMPLETED`, `DOCUMENT_COMPLETED`, `DOCUMENT_REJECTED`, `DOCUMENT_CANCELLED`, `RECIPIENT_EXPIRED`. Match by `payload.externalId` (request id), fall back to `envelopeId`. On `DOCUMENT_COMPLETED`: download signed PDF(s), certificate and audit log into `docs-signing/<projectId>/<requestId>/{signed.pdf,certificate.pdf,audit-log.pdf}`. Call `notifySigningEvent` (1c) for signed/completed/declined/cancelled/expired.

**Route handlers** (`export const runtime = "nodejs"; export const dynamic = "force-dynamic";`, auth via `requireDocument` / `getSessionUser`, responses via `lib/server/http.js`, camelCase JSON):

| Route | Body | Response |
|---|---|---|
| `GET /api/signing/config` | — | `{ configured }` — signed-in users; true when Documenso URL + token + webhook secret and the service-role key are set |
| `POST /api/signing/preview` | `{ documentId, recipients }` | `application/pdf` (inline) — needs read access |
| `POST /api/signing/requests` | `{ documentId, subject, message, signingOrder, recipients: [{ name, email, role }] }` | `201 { request }` — needs edit; `409` if one is open; `503 { code: "signing_not_configured" }`; `502` on Documenso failure |
| `POST /api/signing/requests/[id]/remind` | `{ recipientIds? }` | `{ ok: true }` |
| `POST /api/signing/requests/[id]/cancel` | `{ reason?, force? }` | `{ request }` — edit; Documenso failure → `502 documenso_failed`; envelope gone (404) closes locally; `force: true` is owner-only, needs only the service-role key and closes locally ("Closed without Documenso.") |
| `POST /api/signing/requests/[id]/sync` | — | `{ request }` — edit; always rewrites `metadata.signing` |
| `GET /api/signing/requests/[id]/files/[kind]` | `kind` = `signed` \| `certificate` \| `audit` | `302` to a 60-second signed storage URL |
| `POST /api/signing/webhook` | Documenso payload | `200` fast; `401` on bad secret; idempotent via `signing_events.dedupe_key` |

`request` view model: `{ id, documentId, projectId, versionNumber, title, subject, message, signingOrder, status, sentAt, completedAt, closedAt, error, hasSignedPdf, hasCertificate, hasAuditLog, createdAt, updatedAt, recipients: [{ id, position, name, email, role, signingOrder, readStatus, signingStatus, signedAt, rejectionReason }] }`.

### 3b. PDF rendering (owner: Agent S-PDF)

Files: `lib/server/pdf/**`, `package.json` (+ `@react-pdf/renderer`, `unified`, `remark-parse`, `remark-gfm` already present).

- `renderDocumentPdf({ title, body, recipients, signaturePage = true })` → `Promise<Buffer>`, exported from `lib/server/pdf/index.js` (import as `@/lib/server/pdf`). Server-only, Node runtime. `recipients` is `[{ position, name, email, role }]`.
- Markdown → mdast (`unified` + `remark-parse` + `remark-gfm`) → react-pdf elements: headings, paragraphs, emphasis/strong/inline code, links (text + URL), lists (nested, ordered/task), blockquotes, code blocks, tables, thematic breaks. Images: skip with alt text. A4, clean typographic defaults, white background, page numbers in the footer.
- Field tokens (from `lib/signing/fields.js`) are emitted **verbatim, on one line, never wrapped**, in a standard font so Documenso can detect them; give them enough font size/space for a usable field.
- Signature page (when `signaturePage`): heading "Signatures", one block per `signer` in position order: label, `{{signature, rN}}`, `{{name, rN}}`, `{{date, rN}}`, the recipient's name/email printed below. Skip if there are no signers.
- Embed a TTF with broad Latin coverage so non-ASCII text renders (no WinAnsi-only standard fonts for body text).

### 3c. Signing UI (owner: Agent S-UI)

Files: `components/internal/screens/documents/detail/signing_tab.jsx`, `…/detail/send_for_signature_dialog.jsx`, `components/internal/screens/documents/document_detail.jsx`, `…/detail/content_tab.jsx`, `components/internal/shared/markdown_view.jsx`, `components/internal/screens/documents/constants.js` (display maps), `components/internal/screens/documents/all_documents.jsx` (signing pill), `lib/supabase/signing.js`.

- `lib/supabase/signing.js` (client data layer, reads only, `"use client"`): `normalizeSigningRequest`, `listSigningRequests(documentId)` (embed `signing_recipients`, newest first).
- New **Signing** tab (`section=signing`): current request card (status pill, recipients with role/order/read/sign state and timestamps, Remind / Cancel / Refresh status, Download signed PDF / certificate / audit log when present) + history of past requests. Empty state with "Send for signature". Unconfigured server (`503 signing_not_configured`) → explanatory empty state.
- **Send dialog**: recipients (name, email, role; add/remove/reorder; positions shown as "Recipient 1 (r1)"), "Sign in order" switch, subject (defaults to the document title), message, **Preview PDF** (opens the blob in a new tab), validation via `validateFieldTokens`; unsaved changes must be saved first.
- **Lock**: `locked = isLockingStatus(doc.signing?.status)`. When locked, title/body are read-only, Save is hidden, the content tab shows a banner (out for signature / signed — duplicate to change) linking to the Signing tab. Status/collection/sharing edits still work.
- **Insert field** menu in the content tab (Write mode): field type × recipient number → inserts `buildFieldToken` at the cursor.
- **MarkdownView**: render tokens as compact chips (`Signature · Recipient 1`) via `splitFieldTokens`, everywhere MarkdownView is used (incl. the public page).
- Documents list: small signing pill next to the title meta when `doc.signing?.status` is set.

## Verification

- `npx eslint <changed files>` clean for every agent; lead runs `npx eslint .` and `npm run build` at the end (new server routes + proxy justify one build).
- Migrations: `npm run db:push -- --dry-run` requires `STRING_URI`; the user runs `db:push`.
- No test runner exists; pure helpers in `lib/signing/*` get a quick `node` sanity run by the lead.
