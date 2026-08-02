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

**Early.** The application shell is in place: the suite layout, sidebar and topbar, banner, shared screen kit, theming, and the design tokens from `@geiger/ui`. Product screens are being built out against the suite's screen and data-layer conventions. Competitive research for the signing product lives in [`docs/product-research/`](docs/product-research).

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
