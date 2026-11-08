<div align="center">

# Geiger Docs

**Create and share documents.**

Document creation, collaboration, and signing — in the same workspace as the rest of your work.

Part of the [Geiger](#the-geiger-suite) suite.

</div>

---

## Overview

Geiger Docs is the document application of the Geiger suite. It covers the document lifecycle a team actually runs: drafting and collaborating on a document, sharing it with the right people, and sending it out for signature with a verifiable audit trail.

It sits alongside Geiger Notes — where Notes is a free-form canvas for thinking, Docs is the structured, shareable, signable artefact that comes out of it.

## Status

**v1 workspace, hardened, with signing.** Per-project Overview, Documents (Markdown editor with preview, version history, sharing, comments and signing), Collections, Templates, Shared and Settings screens, plus a read-only public page at `/d/<id>`.

- **Access** is enforced by Postgres RLS: project members see workspace documents, restricted documents are visible only to their creator and invited people, and public links honour the project's setting. The workspace requires a suite sign-in (`proxy.js`).
- **Signing** runs through a self-hosted, unmodified [Documenso](https://github.com/documenso/documenso) called over its API. Documents render to PDF with a signature page; authors can also place fields inline (`{{signature, r1}}`). Content locks while out for signature and after signing.
- **Notifications** use the suite's `@geiger/notify` bell.

Designs live in [`docs/superpowers/specs/`](docs/superpowers/specs), the signing decision in [`docs/decisions/`](docs/decisions), and research in [`docs/product-research/`](docs/product-research).

## Tech stack

- **Framework** — Next.js 16 (App Router, SSR/SSG) and React 19
- **Styling** — Tailwind CSS v4, components only from the shared [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library
- **Icons** — Lucide
- **Backend** — Supabase (Postgres, Auth, Storage), Next.js route handlers for signing
- **Signing** — self-hosted Documenso (API v2), PDFs rendered with `@react-pdf/renderer`
- **Notifications** — [`@geiger/notify`](https://github.com/bhargavjoshi1237/geiger-notify)

## Getting started

### Prerequisites

- Node.js 20 or later
- A Supabase project (the shared Geiger project)

### Installation

```bash
npm install
```

### Environment

Copy [`.env.example`](.env.example) to `.env` and fill it in. It documents every variable: the Supabase URL and anon key, the cookie domain and hub origin for the shared sign-in, the service-role key (server-only), `STRING_URI` for migrations, and the three Documenso values.

### Database

Tables live in the `docs` schema and ship as `@geiger/orm` migrations in `supabase/migrations/`. The access rules depend on `public.is_project_member()` from geiger-dash, so push dash's migrations first.

```bash
npm run db:status
npm run db:push -- --dry-run
npm run db:push
```

The `notify` schema must be listed under Supabase **Settings → API → Exposed schemas** for the notification bell.

### Signing

Run Documenso with the kit in [`deploy/documenso/`](deploy/documenso) — its README covers the signing certificate, Resend email, the team API token and the webhook (`<app>/api/signing/webhook`). Without the Documenso env values the Signing tab explains that signing isn't set up.

### Develop

```bash
npm run dev
```

Local routes:

- `/` — landing page
- `/project` — opens your last project (`/home` and `/org` redirect here)
- `/project/<projectId>/<tab>` — the Docs workspace (`?doc=<id>` opens a document)
- `/d/<id>` — public read-only document (only when its sharing is set to public link)
- `/pallet` — dark palette reference
- `/palletw` — light palette reference

Production builds use the `/docs` base path behind the suite hub.

## Project structure

```
app/
  project/               Project resolver and the workspace shell
  d/[id]/                Public read-only document page
  api/signing/           Signing routes: config, preview, requests, files, Documenso webhook
  pallet/, palletw/      Dark and light palette references
components/internal/
  screens/               Workspace screens + registry (documents, collections, templates…)
  sidebar/, topbar/      Workspace navigation and top bar (notification bell)
  shared/                Screen kit re-exports, wrappers, filter dropdown, Markdown view
  workspace/             Project gate states and create-project dialog
context/                 Active project
lib/supabase/            Browser data layer, one file per docs table
lib/server/              Server-only: session/admin clients, Documenso client, signing, PDF, notifications
lib/signing/             Shared signing vocabulary and field placeholders (browser + server)
lib/notifications/       Notification types and client senders
proxy.js                 Sign-in gate for the workspace
supabase/                Schema-scoped client helper and migrations
deploy/documenso/        Self-hosted Documenso kit and runbook
docs/                    Design specs, decisions and product research
```

## Conventions

This codebase follows a consistent set of patterns. Read these before contributing:

- [`AGENTS.md`](AGENTS.md) — working notes for this Next.js version
- [`MODULE_CONVENTIONS.md`](MODULE_CONVENTIONS.md) — how to build a workspace screen
- [`SUPABASE_CONVENTIONS.md`](SUPABASE_CONVENTIONS.md) — the data-layer playbook
- [`MIGRATION_CONVENTIONS.md`](MIGRATION_CONVENTIONS.md) — schema changes and `@geiger/orm`
- [`crafting.md`](crafting.md) — UI craft and quality bar

## The Geiger suite

Geiger Docs is one application in the broader Geiger suite, alongside Geiger Notes, Geiger Flow, and Geiger Forms. Every product shares one Supabase project, a common design language, and the [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library, so each app feels native to the whole.

## License

Private and unpublished. All rights reserved.
