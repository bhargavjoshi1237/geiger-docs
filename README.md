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

**v1 — document workspace.** Per-project Overview, Documents (Markdown editor with preview, version history, sharing and comments), Collections, Templates, Shared and Settings screens, plus a read-only public page at `/d/<id>`. Sharing is per document: workspace, public link, or specific people (viewer / commenter / editor); specific-people access is enforced in the UI only until RLS is tightened. The design lives in [`docs/superpowers/specs/`](docs/superpowers/specs). Signing is the next major area — see [`docs/product-research/`](docs/product-research).

## Tech stack

- **Framework** — Next.js 16 (App Router, SSR/SSG) and React 19
- **Styling** — Tailwind CSS v4, components only from the shared [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library
- **Icons** — Lucide
- **Backend** — Supabase (Postgres, Auth, Storage)

## Getting started

### Prerequisites

- Node.js 20 or later
- A Supabase project (the shared Geiger project)

### Installation

```bash
npm install
```

### Environment

Create a `.env` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# Server-only, used by migrations (npm run db:push)
STRING_URI=postgresql://...
```

### Database

Tables live in the `docs` schema and ship as `@geiger/orm` migrations in `supabase/migrations/`:

```bash
npm run db:status
npm run db:push
```

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
  pallet/, palletw/      Dark and light palette references
components/internal/
  screens/               Workspace screens + registry (documents, collections, templates…)
  sidebar/, topbar/      Workspace navigation and top bar
  shared/                Screen kit re-exports, wrappers, filter dropdown, Markdown view
  workspace/             Project gate states and create-project dialog
context/                 Active project
lib/supabase/            Data layer, one file per docs table
supabase/                Schema-scoped client helper and migrations
docs/                    Design specs and product research
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
