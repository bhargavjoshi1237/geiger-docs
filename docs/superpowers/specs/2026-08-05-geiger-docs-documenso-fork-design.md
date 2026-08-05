# Geiger Docs — Documenso Fork Design

Date: 2026-08-05
Status: approved

## Goal

Ship Geiger Docs as a document signing product by forking [Documenso](https://github.com/documenso/documenso)
(v2.16.0) and re-skinning it into the Geiger suite: our components, our shell,
our email system, our auth, our database schema.

The alternative — rebuilding Documenso's product natively on this repo's
Next 16 + Supabase + `@geiger/ui` stack — was considered and rejected in favour
of getting a working, trust-critical signing engine immediately.

## Prior research

`docs/product-research/open-source-signing-platform-shortlist.md` ranks Documenso
first among open-source signing platforms, ahead of DocuSeal and OpenSign, on
stack fit, feature fit and theme-ability. This design acts on that finding.

## Licensing

Documenso Community Edition is **AGPL-3.0**. Serving a modified fork over a
network carries source-availability obligations. This was raised and accepted as
a deliberate decision. The fork keeps upstream's `LICENSE` intact.

## Upstream at a glance (verified against the clone)

| | |
|---|---|
| Version | 2.16.0 |
| Layout | Turborepo — `apps/{remix,docs,openpage-api}`, `packages/{ui,lib,trpc,auth,email,prisma,signing,api,ee,assets,tailwind-config}` |
| App | React Router 7 (`apps/remix`, 534 ts/tsx files) served by a Hono Node server (`apps/remix/server/main.js`) |
| UI | 60 shadcn primitives in `packages/ui/primitives`, Tailwind v3 |
| Data | Prisma 6, 1,275-line schema, ~40 tables |
| API | tRPC 11 internally; ts-rest public API in `packages/api` |
| Auth | Custom session auth — Hono + `@oslojs` + `arctic` OAuth + SimpleWebAuthn |
| Jobs | Inngest (`packages/lib/jobs`) |
| i18n | lingui — `@lingui` appears in **466 of 590** `.tsx` files |
| Storage | `NEXT_PUBLIC_UPLOAD_TRANSPORT` = `database` \| `s3` |

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Base | Fork Documenso, don't rebuild | Working signing engine on day one |
| Location | Sibling repo `C:\Pro\geiger-docs-app`, upstream kept as a git remote | Monorepo and toolchain stay intact and mergeable |
| Reskin | Adapter layer at the primitives, shell replaced outright | Every screen inherits our look without touching 534 route files |
| Database | Shared suite Supabase Postgres, `docs` schema via `?schema=docs` | One suite database; Prisma migrations stay upstream-mergeable |
| Migrations | Prisma, **not** `@geiger/orm` | Documented exception; geiger-dash already runs the same split |
| Storage | Supabase Storage over its S3-compatible endpoint | `NEXT_PUBLIC_UPLOAD_TRANSPORT=s3`, no new vendor |
| Email | Bridged to geiger-dash's cross-app API | One Geiger-branded email system for the suite |
| Auth | Suite Supabase auth from day one, behind a flag | Single sign-in across the suite |
| i18n | **Keep lingui, ship English only** | Removal would touch 466 files and defeat the adapter strategy |
| Hosting | **Docker for v1**, Vercel revisited later | Upstream ships a working compose file; the app is a long-running Node server with Inngest jobs |
| This repo | Landing page + shell only | Product screens live in the fork |

The last two overrule earlier preferences (drop i18n, deploy to Vercel) on
evidence gathered from the clone; both were flagged and accepted.

## Architecture

### Reskin — three layers

**Tokens.** `packages/tailwind-config/index.cjs` and `apps/remix/app/app.css`
take their values from `@geiger/ui/tokens.css`: the semantic set
(`background`, `surface-subtle|card|hover|active|strong`, `foreground`,
`muted-foreground`, `text-secondary|tertiary`, `border`, `border-strong`,
`primary`/`primary-foreground`). Documenso's Tailwind v3 already uses
HSL-variable theming, so this is a variable remap rather than a rewrite. Logo,
favicon and fonts are swapped in the same pass.

**Primitives adapter.** Each of the 60 files in `packages/ui/primitives/` is
rewritten to render its `@geiger/ui` counterpart while keeping its exported prop
API byte-identical, so importers need no changes. `@geiger/ui` ships plain JSX
with no types, so a single ambient `.d.ts` declares the module for TypeScript.

Primitives with no Geiger counterpart keep their logic and are restyled with our
tokens: `signature-pad`, `document-flow`, `template-flow`, `field-selector`,
`recipient-selector`, `document-dropzone`, `stepper`, `pin-input`,
`auto-sized-text`, `color-picker`.

**Shell.** Documenso's header, sidebar and layout routes are replaced outright
with the Geiger sidebar, topbar and global banner ported from this repo's
`components/internal/`.

### Data

Prisma points at the shared Supabase Postgres with `?schema=docs` appended to
`NEXT_PRIVATE_DATABASE_URL` / `NEXT_PRIVATE_DIRECT_DATABASE_URL`, placing all
Documenso tables in the `docs` schema alongside the rest of the suite's
per-product schemas. `docs` must be added to Supabase's exposed schemas.

`@geiger/orm` is not used by the fork; `MIGRATION_CONVENTIONS.md` records the
exception.

### Email

`packages/email`'s transport is replaced by a `sendSuiteEmail()` client copied
from `geiger-events/lib/email/client.js`, which POSTs to
`https://geiger.studio/api/email/send` with a `gk_live_…` bearer key. Documenso's
React Email templates are ported into `geiger-dash/mails/templates/docs/` under
`docs.*` keys and registered in `mails/registry.js`, then seeded with
`npm run email:seed`.

Env: `GEIGER_EMAIL_API_URL`, `GEIGER_EMAIL_API_KEY`.

### Auth

Documenso's session table and middleware stay; only the entry point changes.

1. A Supabase session is verified server-side.
2. The user is mapped to a Documenso `User` by email, created on first sight.
3. A normal Documenso session is minted, so everything downstream is unchanged.

Documenso's own login/signup routes are removed from the nav and redirect to
suite sign-in. Public signing links remain anonymous and untouched. The bridge
sits behind a flag that keeps native login available until it is proven — this is
the highest-risk item in the build.

### Stripped for v1

`packages/ee`; Stripe billing and plan UI; the public developer surface
(`packages/api`, ts-rest, API tokens, webhooks, embed SDK, `apps/openpage-api`);
all locales but English. Teams and organisations stay — they are wired through
the document model too deeply to remove cheaply.

## Build sequence

1. Fork, boot unmodified against the Supabase `docs` schema
2. Tokens and shell
3. Primitives adapter
4. Email bridge
5. Auth bridge
6. Strip
7. Landing-page handoff from `geiger-docs`

## Out of scope for v1

- In-app rich-text document authoring (PDF upload only; schema leaves room)
- Cryptographic PDF signing with an X.509 certificate (visual signature plus
  audit trail for now)
- Vercel deployment
- Suite-wide RBAC integration beyond sign-in
