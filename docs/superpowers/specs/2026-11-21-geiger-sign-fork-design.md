# Geiger Sign — Thin Documenso Fork Design

Date: 2026-11-21 · Status: approved · Supersedes the "do not modify" rule in `docs/decisions/2026-11-08-signing-with-documenso.md` (a new decision record replaces it; the rest of that record stands). Replaces the unmerged full-fork spec on `origin/docs/documenso-fork` (2026-08-05).

## Goal

Every surface an external signer sees — signing page, browser tab, emails, favicon — reads as **Geiger Sign**, not Documenso, while Geiger Docs keeps driving signing over the Documenso HTTP API v2 exactly as today.

## Decisions (confirmed with the user)

| Topic | Decision |
|---|---|
| Shape | **Hybrid.** Geiger Docs keeps its workspace, editor and signing integration; the fork only replaces what signers and the operator see. |
| Depth | **Thin fork + built-in branding settings.** Change only what settings can't reach (about 15–25 files). No shell or primitive reskin. |
| `@geiger/ui` | **Not included in the fork.** Token *values* are written into Documenso's own CSS; no `@geiger/ui` code, so it needs no licence change. |
| Name | **Geiger Sign.** |
| Repo | `bhargavjoshi1237/geiger-sign`, **public**, AGPL-3.0, local clone `C:\Pro\geiger-sign`, `upstream` = documenso/documenso. |
| Domain | `sign.geiger.studio` (Koyeb custom domain). |
| Base | Documenso tag **`v2.21.1`** — the version running today. |

## Why a thin fork is enough

On a self-hosted instance with billing disabled, Documenso unlocks team branding (`packages/lib/server-only/branding/load-recipient-branding.ts`: `allowCustomBranding = !billingEnabled`, `hidePoweredBy = !billingEnabled`). Settings already cover the signer page and every email: logo, brand colours, custom CSS, company details, brand URL, and the hidden "Powered by Documenso" line. The eight signer-facing email templates (`document-invite`, `-completed`, `-reminder`, `-pending`, `-recipient-signed`, `-rejected`, `-cancel`, `recipient-expired`) contain no "Documenso" text.

Settings cannot reach: tab titles and meta tags, favicons and the web manifest, the default logo on Documenso's own pages, the "Check out Documenso" upsell on signer screens, and the product name in operator/account emails. Those are the fork's job.

Geiger users never open Documenso — only external signers (signing page + emails) and the operator (admin dashboard) do — so a deep reskin would only restyle pages nobody in the product sees.

## 1. Repository and licence

- Created from `v2.21.1`; all Geiger work on branch **`geiger`** (default branch), as small `geiger:`-prefixed commits. Upgrade = `git merge <next upstream tag>` into `geiger`, resolve, rebuild.
- `LICENSE` (AGPL-3.0) and all copyright notices stay untouched. `packages/ee` (Documenso Commercial License) is **not modified and not enabled** — no licence key, no Enterprise flags.
- **`GEIGER_CHANGES.md`** at the root: what Geiger Sign is, the upstream base tag, and a table of every modified file with the date and reason (AGPL §5a "prominent notices").
- `README.md` gets a short Geiger Sign header above upstream's content, linking `GEIGER_CHANGES.md` and the licence; upstream's README text stays below it.

## 2. Code changes in the fork

| Area | Files (upstream paths) | Change |
|---|---|---|
| Tab titles & meta | `apps/remix/app/utils/meta.ts`, `apps/remix/app/routes/_recipient+/_layout.tsx` | `"… - Documenso"` → `"… - Geiger Sign"`; description/keywords rewritten for Geiger Sign. |
| Signer upsell | `apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx` (two "Check out Documenso" blocks) and any other `_recipient+` route with the same upsell | Remove the upsell paragraph for signed-out signers; keep the "Go Back Home" link for signed-in users. |
| Default name constants | `packages/lib/constants/email.ts` (`FROM_NAME` default), `packages/lib/constants/app.ts` (`NEXT_PRIVATE_SIGNING_REASON` default) | Defaults → "Geiger Sign" / "Signed with Geiger Sign". Both stay env-overridable. |
| Operator/account emails | `packages/email/templates/*.tsx` that name Documenso (account-disabled, admin-user-created, confirm-team-email, organisation-*) | Product name → "Geiger Sign"; logo `alt` → "Geiger Sign". |
| Logos | `apps/remix/app/components/general/branding-logo.tsx`, `branding-logo-icon.tsx` | Render the Geiger Sign wordmark / mark (inline SVG, Geiger artwork). |
| Static assets | `apps/remix/public/{favicon.ico,favicon-16x16.png,favicon-32x32.png,apple-touch-icon.png,android-chrome-192x192.png,android-chrome-512x512.png,opengraph-image.jpg,site.webmanifest,static/logo.png}`, `packages/email/static/logo.png`, `packages/assets/{favicon*,apple-touch-icon.png,android-chrome-*,logo.png,static/logo.png}` | Replace with Geiger Sign assets generated from the Geiger logo in geiger-docs (`public/logo1.svg`, `app/favicon.ico`); manifest name/short_name → "Geiger Sign". |
| Theme | `packages/ui/styles/theme.css`, `packages/tailwind-config/index.cjs` (the `documenso-*` colour scale) | Light and dark token values taken from the Geiger palette (`/pallet`, `/palletw` in geiger-docs), written as HSL values; `documenso-*` scale remapped to the Geiger primary. Variable names unchanged so no component edits are needed. |
| Source link (AGPL §13) | `apps/remix/app/routes/_recipient+/_layout.tsx`, the authenticated app layout footer, `packages/lib/constants/app.ts` | Small "Source code" link to `GEIGER_SOURCE_URL` (build-time env, defaults to `https://github.com/bhargavjoshi1237/geiger-sign`). The image build sets it to `…/tree/<commit sha>`. |
| Translations | `packages/lib/translations/en/web.po` (+ other locales via `--clean`) | `npm run translate:extract` after the string edits. Other locales fall back to English for changed strings — accepted. |

Out of scope: restyling `packages/ui/primitives`, replacing Documenso's header/sidebar, auth bridges, a shared database, suite-email bridging, removing `packages/ee`/Stripe/webhooks, PDF upload in Geiger Docs.

## 3. Configuration (runbook, not code)

In Documenso admin → team settings → Branding, for the team that owns the API token:

- Enable branding; brand URL `https://geiger.studio`; company details (Geiger legal name/address).
- Logo, brand colours and custom CSS stay unset: the image's defaults are already Geiger Sign and adapt to light and dark mode (setting them would pin light-mode values).
- Env on the service: `NEXT_PRIVATE_SMTP_FROM_NAME="Geiger Sign"`, `NEXT_PRIVATE_SIGNING_REASON="Signed with Geiger Sign"`, `NEXT_PUBLIC_WEBAPP_URL=https://sign.geiger.studio`.

These live in Documenso's database/env, so they're recorded as checklist steps in the runbook.

## 4. Build and deploy

- **CI image:** `.github/workflows/geiger-image.yml` in the fork. On push to `geiger` and on `geiger-v*` tags: build `docker/Dockerfile` with `GEIGER_SOURCE_URL` as a build arg, push to **GHCR** as `ghcr.io/bhargavjoshi1237/geiger-sign:sha-<short>` and, for tags, `:<tag>` + `:latest`. Upstream's own workflows (`publish.yml`, `deploy.yml`, `e2e-tests.yml`, translations, Crowdin) are disabled on the fork so they don't fire against Documenso's secrets. Docker is not installed locally, so CI is the only build path. The GHCR package is made public so Koyeb can pull it without credentials.
- **Version tags:** `geiger-v2.21.1-1` = upstream `v2.21.1`, Geiger revision 1.
- **geiger-docs deploy kit:** `deploy/documenso/render/Dockerfile` → `FROM ghcr.io/bhargavjoshi1237/geiger-sign:geiger-v2.21.1-1`; `deploy/documenso/compose.yml` image likewise. The boot script (`entrypoint.sh`) is unchanged. Documenso's own Postgres is untouched, so data, users, team, API token and webhook carry over.
- **Domain:** Koyeb custom domain `sign.geiger.studio` (user adds the CNAME). Then `NEXT_PUBLIC_WEBAPP_URL` on the service and `DOCUMENSO_URL` in geiger-docs move to it. Pending requests created on the old URL keep working until the old domain is removed; finish or cancel them first.

## 5. Changes in geiger-docs

- **New decision record** `docs/decisions/2026-11-21-geiger-sign-fork.md`: we now run a modified Documenso under AGPL-3.0 with public source; what stays (HTTP-API-only integration, never bundle Documenso packages into Geiger Docs, no Enterprise features, keep notices); obligations (source link, `GEIGER_CHANGES.md`, upstream merges). The 2026-11-08 record gets a one-line "Superseded in part by …" note at the top.
- `deploy/documenso/README.md`, `deploy/documenso/render/README.md`, `deploy/documenso/render/Dockerfile`, `deploy/documenso/compose.yml`, root `README.md`: image, domain, branding checklist, upgrade procedure.
- **No application code changes.** The API contract is identical, so `lib/server/documenso.js` and the signing routes stay as they are.

## Verification

- Fork: `npm ci` then `npx turbo run build --filter=@documenso/remix...` passes locally (or in CI if the local Windows build is impractical); `git diff v2.21.1 --stat` matches `GEIGER_CHANGES.md`; `grep -rn "Documenso"` over signer-facing routes and the eight signer emails returns nothing user-visible.
- CI pushes the image; the deployed service passes `/api/health` and `/api/certificate-status`.
- End-to-end from Geiger Docs on the deployed app: send a document → invite email shows the Geiger Sign logo and sender, no Documenso name → signing page tab reads "… - Geiger Sign" with the source link → sign → webhook updates status → signed PDF, certificate and audit log download from the Signing tab.

## User actions

Add the `sign.geiger.studio` CNAME; make the GHCR package public (or approve it); trigger the Koyeb redeploy; fill in the branding settings (or grant Documenso admin access).
