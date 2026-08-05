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

## Where the product lives

**This repo is the marketing site and suite shell.** The Geiger Docs workspace
itself is a separate application — a fork of [Documenso](https://github.com/documenso/documenso)
re-skinned into the suite — in **`geiger-docs-app`**, deployed to
`docs.geiger.studio`. Every "open the app" link here points at
`NEXT_PUBLIC_DOCS_APP_URL`.

That split is deliberate: forking gave us a working, trust-critical signing
engine on day one rather than rebuilding one. The reasoning, the alternatives
weighed, and the shape of the fork are recorded in
[`docs/superpowers/specs/2026-08-05-geiger-docs-documenso-fork-design.md`](docs/superpowers/specs/2026-08-05-geiger-docs-documenso-fork-design.md),
with the competitive research behind the choice in
[`docs/product-research/`](docs/product-research).

**Note on the database:** the fork owns the `docs` Postgres schema and manages it
with Prisma, not `@geiger/orm`. `MIGRATION_CONVENTIONS.md` still governs anything
this repo adds; it does not govern the fork.

**Note on licensing:** Documenso is AGPL-3.0, and the fork carries
source-availability obligations when served over a network.

## Status

**Early.** The application shell is in place: the suite layout, sidebar and topbar, banner, shared screen kit, theming, and the design tokens from `@geiger/ui`.

## Tech stack

- **Framework** — Next.js 16 (App Router, SSR/SSG) and React 19
- **Styling** — Tailwind CSS v4 and shadcn/ui, with the shared [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library
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
```

### Develop

```bash
npm run dev
```

Local routes:

- `/` and `/home` — the Docs workspace
- `/pallet` — dark palette reference
- `/palletw` — light palette reference

Production builds use the `/docs` base path behind the suite hub.

## Project structure

```
app/
  home/                  Docs workspace
  pallet/, palletw/      Dark and light palette references
components/
  internal/screens/      Workspace screens
  internal/sidebar/      Navigation
  internal/topbar/       Workspace top bar
  internal/shared/       Shared screen kit (headers, tables, stats, dialogs)
  landing/               Site header and suite mega-menu
  ui/                    shadcn primitives
lib/supabase/            Supabase client, user, and activity tracking
docs/product-research/   Signing and document-platform research
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
