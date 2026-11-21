# Decision: run Geiger Sign, a public AGPL fork of Documenso

- **Date:** 2026-11-21
- **Status:** Accepted
- **Supersedes:** the "do not modify it" rule in `2026-11-08-signing-with-documenso.md`. The rest of that record stands.
- **Design:** `docs/superpowers/specs/2026-11-21-geiger-sign-fork-design.md`
- **Source:** https://github.com/bhargavjoshi1237/geiger-sign (branch `geiger`)

## Decision

Signers should see Geiger, not Documenso. Built-in branding settings cover the signing page and every email, but
not tab titles, favicons, the default logo, the "Check out Documenso" upsell or operator emails. We therefore run
**Geiger Sign**: Documenso Community Edition with those surfaces changed, published under AGPL-3.0.

## What stays the same

- Geiger Docs talks to the signing service **only over its HTTP API v2**, from `lib/server/documenso.js`. Geiger Docs
  remains a separate program and is not covered by the AGPL.
- Never import or bundle Documenso or Geiger Sign packages into Geiger Docs.
- Never enable Enterprise features or modify `packages/ee` (Documenso Commercial License).
- No `@geiger/ui` code goes into Geiger Sign; Geiger colours are written as plain values.
- The service keeps its own Postgres.

## Obligations we take on

- **Publish the source.** The repo is public; every page links to the exact running commit (`NEXT_PUBLIC_GEIGER_SOURCE_URL`, set by the image build) — AGPL-3.0 §13.
- **Mark changes.** `GEIGER_CHANGES.md` lists every modified file with a date (§5a). CI fails if one is missing.
- **Keep notices.** `LICENSE` and Documenso's copyright notices stay. Documenso is their trademark; we don't use it as our product name.
- **Merge upstream.** Each Documenso release is merged into `geiger` and tagged `geiger-v<upstream>-<n>`.

## Revisit when

- We want to change Geiger Docs' own UI inside Geiger Sign, or put `@geiger/ui` into it (then `@geiger/ui` must be released under an AGPL-compatible licence first).
- Upstream merges start costing more than the branding is worth.
- Any trigger in the 2026-11-08 record's "Revisit when" list.
