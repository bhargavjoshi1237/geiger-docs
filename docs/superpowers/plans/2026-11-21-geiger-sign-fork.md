# Geiger Sign (Thin Documenso Fork) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every surface an external signer sees reads as **Geiger Sign**, served from a public AGPL fork of Documenso that Geiger Docs keeps calling over the HTTP API.

**Architecture:** A new public repo `bhargavjoshi1237/geiger-sign` (local `C:\Pro\geiger-sign`) branched from Documenso tag `v2.21.1`, with small `geiger:` commits on a `geiger` branch. Names, links, logos, theme values and an AGPL source link change; nothing structural does. A GitHub Action builds the image to GHCR; geiger-docs' deploy kit switches its `FROM` to that image. Spec: `docs/superpowers/specs/2026-11-21-geiger-sign-fork-design.md`.

**Tech Stack:** Documenso v2.21.1 (React Router 7 + Hono, Tailwind v3, lingui, Turborepo), Node 24, Git Bash on Windows (`perl` available), `gh` CLI (signed in as `bhargavjoshi1237`), GitHub Actions + GHCR, Koyeb.

## Global Constraints

- Upstream base: Documenso tag **`v2.21.1`**. Fork branch: **`geiger`** (default branch). Commits prefixed `geiger:`.
- Product name: **Geiger Sign**. Brand URL: **`https://geiger.studio`**. Contact mail domain: **`geiger.studio`**. Service domain: **`sign.geiger.studio`**.
- Repo: **`bhargavjoshi1237/geiger-sign`**, public. Image: **`ghcr.io/bhargavjoshi1237/geiger-sign`**, first release tag **`geiger-v2.21.1-1`**.
- **No `@geiger/ui` code in the fork.** Geiger colours are written as plain values.
- Keep `LICENSE` (AGPL-3.0) and every copyright notice. **Never modify or enable `packages/ee`**; no licence key, no Enterprise flags.
- Every file changed from `v2.21.1` is listed in `GEIGER_CHANGES.md` (AGPL §5a).
- Every page offers the running source: `NEXT_PUBLIC_GEIGER_SOURCE_URL`, set at image build to `https://github.com/bhargavjoshi1237/geiger-sign/tree/<sha>`.
- Prefer new files over edits to upstream files; when editing, change the fewest lines possible (merge cost on every upgrade).
- Docker is **not installed locally**; images build only in CI.
- Do not change Geiger Docs application code: `lib/server/documenso.js` and `app/api/signing/**` stay as they are.
- Commit message trailer for every commit in both repos: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

Paths below are relative to `C:\Pro\geiger-sign` unless they start with `geiger-docs/` (= `C:\Pro\geiger-docs`). `$GD` = `/c/Pro/geiger-docs`, `$GS` = `/c/Pro/geiger-sign`.

---

### Task 1: Create the fork repository

**Files:**
- Create: the `C:\Pro\geiger-sign` clone, the `geiger` branch, the GitHub repo `bhargavjoshi1237/geiger-sign`

**Interfaces:**
- Produces: local repo at `$GS` on branch `geiger` at upstream `v2.21.1`; remotes `origin` (geiger-sign) and `upstream` (documenso/documenso); tag `v2.21.1` present locally and on origin.

- [ ] **Step 1: Full clone of upstream (history is needed for future merges)**

```bash
cd /c/Pro && git clone --origin upstream https://github.com/documenso/documenso.git geiger-sign
cd /c/Pro/geiger-sign && git checkout -b geiger v2.21.1 && git log --oneline -1
```
Expected: `8707e33 v2.21.1`

- [ ] **Step 2: Create the public GitHub repo and push**

```bash
cd /c/Pro/geiger-sign
gh repo create bhargavjoshi1237/geiger-sign --public --description "Geiger Sign — Geiger-branded fork of Documenso (AGPL-3.0)" --homepage https://sign.geiger.studio
git remote add origin https://github.com/bhargavjoshi1237/geiger-sign.git
git push -u origin geiger
git push origin v2.21.1
gh repo edit bhargavjoshi1237/geiger-sign --default-branch geiger
```
Expected: push succeeds; `gh repo view bhargavjoshi1237/geiger-sign --json defaultBranchRef -q .defaultBranchRef.name` prints `geiger`.

- [ ] **Step 3: Disable every upstream workflow on the fork (they need Documenso's secrets)**

```bash
cd /c/Pro/geiger-sign
for wf in $(gh workflow list --repo bhargavjoshi1237/geiger-sign --all --json id -q '.[].id'); do gh workflow disable "$wf" --repo bhargavjoshi1237/geiger-sign; done
gh workflow list --repo bhargavjoshi1237/geiger-sign --all
```
Expected: every listed workflow shows `disabled_manually`. (If the list is empty because Actions haven't indexed yet, re-run after Task 9 Step 3 and before pushing the workflow tag.)

---

### Task 2: Branding check, change log and README header

**Files:**
- Create: `scripts/geiger/check-branding.mjs`, `GEIGER_CHANGES.md`
- Modify: `README.md` (insert a header block at the top only)

**Interfaces:**
- Produces: `node scripts/geiger/check-branding.mjs` → exit 0 + `Geiger Sign branding check passed.` when clean; exit 1 + one `file:line: text` per problem otherwise. Every later task re-runs it. `GEIGER_CHANGES.md` has a table `| File | Date | Change |` with each path in backticks.

- [ ] **Step 1: Write the check (the failing test)**

`scripts/geiger/check-branding.mjs`:

```js
#!/usr/bin/env node
// Geiger Sign guard: fails when a signer/email surface still names Documenso, the AGPL source link
// is missing, or GEIGER_CHANGES.md doesn't list every file changed from the upstream tag.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const UPSTREAM_TAG = 'v2.21.1';

const SURFACES = [
  'apps/remix/app/routes/_recipient+',
  'apps/remix/app/utils/meta.ts',
  'apps/remix/app/components/general/document-signing',
  'apps/remix/app/components/general/envelope-signing',
  'apps/remix/public/site.webmanifest',
  'packages/email/templates',
  'packages/email/template-components',
  'packages/lib/constants/email.ts',
];

const BRAND = /\bDocumenso\b|documenso\.com|documen\.so/;
const SKIP_LINE = /@documenso\/|^\s*(\/\/|\*|\/\*)/;

const SOURCE_LINK_FILES = [
  'apps/remix/app/routes/_recipient+/_layout.tsx',
  'apps/remix/app/routes/_authenticated+/_layout.tsx',
];

const walk = (path) => (statSync(path).isDirectory() ? readdirSync(path).flatMap((name) => walk(join(path, name))) : [path]);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);

const problems = [];

for (const file of SURFACES.flatMap(walk)) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (BRAND.test(line) && !SKIP_LINE.test(line)) problems.push(`${file}:${index + 1}: ${line.trim()}`);
    });
}

for (const file of SOURCE_LINK_FILES) {
  if (!readFileSync(file, 'utf8').includes('<GeigerSourceLink')) problems.push(`${file}: missing <GeigerSourceLink />`);
}

const changeLog = existsSync('GEIGER_CHANGES.md') ? readFileSync('GEIGER_CHANGES.md', 'utf8') : '';
const changed = new Set([...git('diff', '--name-only', UPSTREAM_TAG), ...git('ls-files', '--others', '--exclude-standard')]);

for (const file of changed) {
  if (!changeLog.includes(`\`${file}\``)) problems.push(`GEIGER_CHANGES.md: not listed: ${file}`);
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} branding problem(s).`);
  process.exit(1);
}

console.log('Geiger Sign branding check passed.');
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd /c/Pro/geiger-sign && node scripts/geiger/check-branding.mjs; echo "exit=$?"`
Expected: `exit=1`; output includes `apps/remix/app/utils/meta.ts:10:`, `apps/remix/app/routes/_recipient+/_layout.tsx:17:`, `packages/email/template-components/template-footer.tsx:37:`, both `missing <GeigerSourceLink />` lines, and `GEIGER_CHANGES.md: not listed: scripts/geiger/check-branding.mjs`. About 70 problems.

- [ ] **Step 3: Create `GEIGER_CHANGES.md`**

```markdown
# Geiger Sign — changes from Documenso

Geiger Sign is a modified version of [Documenso](https://github.com/documenso/documenso) Community Edition,
distributed under the GNU Affero General Public License v3.0 (see `LICENSE`). Documenso is a trademark of
Documenso, Inc.; Geiger Sign is not affiliated with or endorsed by Documenso, Inc.

- **Upstream base:** `v2.21.1`
- **Source of the running service:** linked from every page ("Source code").
- **Not modified:** `packages/ee` (Documenso Commercial License) — not modified and not enabled.

Every file below differs from the upstream base. Dates are when the change was made.

| File | Date | Change |
|---|---|---|
| `GEIGER_CHANGES.md` | 2026-11-21 | This list of modifications (AGPL-3.0 §5a). |
| `README.md` | 2026-11-21 | Geiger Sign header above the upstream README. |
| `scripts/geiger/check-branding.mjs` | 2026-11-21 | Branding and licence-compliance check. |
```

- [ ] **Step 4: Add the README header**

Insert at the very top of `README.md` (above the existing first line; leave the rest untouched):

```markdown
> **Geiger Sign** is the Geiger suite's signing service: a modified version of Documenso, licensed under
> AGPL-3.0 like the original. What we changed and why is listed in [`GEIGER_CHANGES.md`](GEIGER_CHANGES.md).
> The upstream README follows unchanged.

```

- [ ] **Step 5: Re-run; the change-log problems for these three files are gone**

Run: `node scripts/geiger/check-branding.mjs 2>&1 | grep -c "not listed"`
Expected: `0`. The script still exits 1 for the branding problems handled in Tasks 3–7.

- [ ] **Step 6: Commit**

```bash
git add scripts/geiger/check-branding.mjs GEIGER_CHANGES.md README.md
git commit -m "geiger: add the branding check, change log and README header

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Names, meta tags and the signer upsell

**Files:**
- Modify: `apps/remix/app/utils/meta.ts` (whole function body)
- Modify: `apps/remix/app/routes/_recipient+/_layout.tsx:17`
- Modify: `apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx` (both upsell blocks, ~lines 479–487 and 579–587)
- Modify: `apps/remix/app/components/general/document-signing/document-signing-page-view-v2.tsx:289`
- Modify: `packages/lib/constants/email.ts:3-4`, `packages/lib/constants/app.ts:103`
- Modify: `GEIGER_CHANGES.md`

**Interfaces:**
- Consumes: `scripts/geiger/check-branding.mjs` (Task 2).

- [ ] **Step 1: Confirm the failures this task fixes**

Run: `node scripts/geiger/check-branding.mjs 2>&1 | grep -E "meta.ts|_recipient\+|page-view-v2|constants/email"`
Expected: 13 lines (5 in meta.ts, 5 in `_recipient+`, 1 in page-view-v2, 2 in email.ts).

- [ ] **Step 2: Rewrite `apps/remix/app/utils/meta.ts`**

Replace the whole file with:

```ts
import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { i18n, type MessageDescriptor } from '@lingui/core';

export const appMetaTags = (title?: MessageDescriptor) => {
  const description = 'Geiger Sign — document signing for the Geiger suite.';

  return [
    {
      title: title ? `${i18n._(title)} - Geiger Sign` : 'Geiger Sign',
    },
    {
      name: 'description',
      content: description,
    },
    {
      name: 'keywords',
      content: 'Geiger Sign, Geiger, document signing, e-signature',
    },
    {
      name: 'author',
      content: 'Geiger',
    },
    {
      name: 'robots',
      content: 'noindex, nofollow',
    },
    {
      property: 'og:title',
      content: 'Geiger Sign',
    },
    {
      property: 'og:description',
      content: description,
    },
    {
      property: 'og:image',
      content: `${NEXT_PUBLIC_WEBAPP_URL()}/opengraph-image.jpg`,
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      name: 'twitter:card',
      content: 'summary_large_image',
    },
    {
      name: 'twitter:description',
      content: description,
    },
    {
      name: 'twitter:image',
      content: `${NEXT_PUBLIC_WEBAPP_URL()}/opengraph-image.jpg`,
    },
  ];
};
```

(`robots` becomes `noindex, nofollow`: the service has no public marketing pages. The `twitter:site @documenso` tag is dropped.)

- [ ] **Step 3: Recipient tab title**

In `apps/remix/app/routes/_recipient+/_layout.tsx` replace

```tsx
    { title: i18n._(msg`Sign Document - Documenso`) },
```
with
```tsx
    { title: i18n._(msg`Sign Document - Geiger Sign`) },
```

- [ ] **Step 4: Remove both "Check out Documenso" upsells**

In `apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx` the following block appears **twice** (same indentation both times). Replace each occurrence

```tsx
          {user ? (
            <Link to="/" className="mt-36 text-documenso-700 hover:text-documenso-600">
              <Trans>Go Back Home</Trans>
            </Link>
          ) : (
            <p className="mt-36 text-muted-foreground/60 text-sm">
              <Trans>
                Want to send slick signing links like this one?{' '}
                <Link to="https://documenso.com" className="text-documenso-700 hover:text-documenso-600">
                  Check out Documenso
                </Link>
                .
              </Trans>
            </p>
          )}
```
with
```tsx
          {user && (
            <Link to="/" className="mt-36 text-documenso-700 hover:text-documenso-600">
              <Trans>Go Back Home</Trans>
            </Link>
          )}
```
Use Edit with `replace_all: true`. If the indentation of the second block differs, read lines 470–600 and edit each block separately. Afterwards, `grep -n "Check out Documenso" "apps/remix/app/routes/_recipient+/sign.\$token+/_index.tsx"` must print nothing.

- [ ] **Step 5: "Powered by" link target**

In `apps/remix/app/components/general/document-signing/document-signing-page-view-v2.tsx` replace

```tsx
                  href="https://documenso.com"
```
with
```tsx
                  href="https://geiger.studio"
```
(The badge is hidden on our instance because billing is off, but the link must not point at Documenso if it's ever shown.)

- [ ] **Step 6: Name defaults (still env-overridable)**

`packages/lib/constants/email.ts` — replace

```ts
export const FROM_ADDRESS = env('NEXT_PRIVATE_SMTP_FROM_ADDRESS') || 'noreply@documenso.com';
export const FROM_NAME = env('NEXT_PRIVATE_SMTP_FROM_NAME') || 'Documenso';
```
with
```ts
export const FROM_ADDRESS = env('NEXT_PRIVATE_SMTP_FROM_ADDRESS') || 'noreply@geiger.studio';
export const FROM_NAME = env('NEXT_PRIVATE_SMTP_FROM_NAME') || 'Geiger Sign';
```

`packages/lib/constants/app.ts` — replace

```ts
export const NEXT_PRIVATE_SIGNING_REASON = () => env('NEXT_PRIVATE_SIGNING_REASON') || 'Signed by Documenso';
```
with
```ts
export const NEXT_PRIVATE_SIGNING_REASON = () => env('NEXT_PRIVATE_SIGNING_REASON') || 'Signed with Geiger Sign';
```

- [ ] **Step 7: Log the changes**

Append to the table in `GEIGER_CHANGES.md`:

```markdown
| `apps/remix/app/utils/meta.ts` | 2026-11-21 | Page titles and meta tags name Geiger Sign; noindex. |
| `apps/remix/app/routes/_recipient+/_layout.tsx` | 2026-11-21 | Signer tab title "Sign Document - Geiger Sign". |
| `apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx` | 2026-11-21 | Removed the "Check out Documenso" upsell for signed-out signers. |
| `apps/remix/app/components/general/document-signing/document-signing-page-view-v2.tsx` | 2026-11-21 | "Powered by" badge links to geiger.studio. |
| `packages/lib/constants/email.ts` | 2026-11-21 | Default sender name/address are Geiger Sign. |
| `packages/lib/constants/app.ts` | 2026-11-21 | Default PDF signing reason "Signed with Geiger Sign". |
```

- [ ] **Step 8: Verify these surfaces are clean**

Run: `node scripts/geiger/check-branding.mjs 2>&1 | grep -E "meta.ts|_recipient\+.*:[0-9]+:|page-view-v2|constants/email|not listed"`
Expected: no output. (Email templates and the source-link lines still fail; Tasks 4 and 7.)

- [ ] **Step 9: Commit**

```bash
git add -A apps/remix/app/utils/meta.ts "apps/remix/app/routes/_recipient+" apps/remix/app/components/general/document-signing/document-signing-page-view-v2.tsx packages/lib/constants/email.ts packages/lib/constants/app.ts GEIGER_CHANGES.md
git commit -m "geiger: name Geiger Sign in titles, meta and defaults; drop the signer upsell

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Email templates

**Files:**
- Modify: every file under `packages/email/templates/` and `packages/email/template-components/` that the check flags (expected: 21 templates + 7 components, listed by Step 1)
- Modify: `GEIGER_CHANGES.md`

**Interfaces:**
- Consumes: `scripts/geiger/check-branding.mjs`.

- [ ] **Step 1: List the files to change**

```bash
cd /c/Pro/geiger-sign
node scripts/geiger/check-branding.mjs 2>&1 | grep -oE "^packages/email/[^:]+" | sort -u > "$TEMP/geiger-email-files.txt"
cat "$TEMP/geiger-email-files.txt"; wc -l < "$TEMP/geiger-email-files.txt"
```
Expected: about 28 paths, all under `packages/email/`.

- [ ] **Step 2: Remove Documenso's company address from the footer**

In `packages/email/template-components/template-footer.tsx` replace

```tsx
          Documenso, Inc.
          <br />
          2261 Market Street, #5211, San Francisco, CA 94114, USA
```
with
```tsx
          Geiger Sign
```

- [ ] **Step 3: Mechanical rename in the listed files (imports and comment lines untouched)**

```bash
cd /c/Pro/geiger-sign
xargs perl -pi -e '
  next if m{\@documenso/} || m{^\s*(//|\*|/\*)};
  s{https://documen\.so/mail-footer}{https://geiger.studio}g;
  s{https://documenso\.com(/pricing)?}{https://geiger.studio}g;
  s{\@documenso\.com}{\@geiger.studio}g;
  s{\bDocumenso\b}{Geiger Sign}g;
' < "$TEMP/geiger-email-files.txt"
git diff --stat -- packages/email
```
Expected: the same files as Step 1, small line counts each. Spot-check `git diff packages/email/template-components/template-footer.tsx`: the footer now reads "This document was sent using <Link href="https://geiger.studio">Geiger Sign</Link>". Identifiers such as `documensoLogoUrl` are unchanged (lowercase, no word boundary).

- [ ] **Step 4: Verify emails are clean**

Run: `node scripts/geiger/check-branding.mjs 2>&1 | grep -E "^packages/email/"`
Expected: no output.

- [ ] **Step 5: Log the changes**

Generate the rows and append them to the table in `GEIGER_CHANGES.md`:

```bash
git diff --name-only -- packages/email | sed 's#.*#| `&` | 2026-11-21 | Product name, links and contact addresses read Geiger Sign. |#' >> GEIGER_CHANGES.md
tail -5 GEIGER_CHANGES.md
```
Then open `GEIGER_CHANGES.md` and change the row for `packages/email/template-components/template-footer.tsx` to: `| \`packages/email/template-components/template-footer.tsx\` | 2026-11-21 | Footer names Geiger Sign and links geiger.studio; removed Documenso's company address. |`

- [ ] **Step 6: Commit**

```bash
git add packages/email GEIGER_CHANGES.md
git commit -m "geiger: brand the email templates as Geiger Sign

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Logos, favicons and static assets

**Files:**
- Create: `scripts/geiger/assets/mark.svg`, `scripts/geiger/assets/icon.svg`, `scripts/geiger/assets/wordmark.svg`, `scripts/geiger/assets/og.svg`, `scripts/geiger/make-assets.mjs`
- Modify: `apps/remix/app/components/general/branding-logo.tsx`, `apps/remix/app/components/general/branding-logo-icon.tsx` (whole files)
- Replace (binary): `apps/remix/public/{favicon.ico,favicon-16x16.png,favicon-32x32.png,apple-touch-icon.png,android-chrome-192x192.png,android-chrome-512x512.png,opengraph-image.jpg}`, `apps/remix/public/static/logo.png`, `packages/email/static/logo.png`, `packages/assets/{favicon.ico,favicon-16x16.png,favicon-32x32.png,apple-touch-icon.png,android-chrome-192x192.png,android-chrome-512x512.png,logo.png}`, `packages/assets/static/logo.png`
- Modify: `apps/remix/public/site.webmanifest`, `GEIGER_CHANGES.md`

**Interfaces:**
- Produces: `BrandingLogo` and `BrandingLogoIcon` keep their exports and `LogoProps` type (`SVGAttributes<SVGSVGElement>`), so every importer is unchanged.

- [ ] **Step 1: Confirm the manifest failure**

Run: `node scripts/geiger/check-branding.mjs 2>&1 | grep webmanifest`
Expected: two lines (`"name"` and `"short_name"`).

- [ ] **Step 2: Source artwork (Geiger mark from `geiger-docs/public/logo1.svg`)**

`scripts/geiger/assets/mark.svg` — the Geiger mark, `currentColor`-free, white:

```svg
<svg width="467" height="285" viewBox="0 0 467 285" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M427.054 1.17427C431.046 1.15338 464.984 0.670938 466.079 1.40804C466.298 4.01125 464.421 3.92073 463.267 6.18971C450.436 31.3381 435.978 55.3181 422.003 79.8289L339.669 223C327.843 243.287 317.065 263.871 304.413 283.952L285.161 283.494C273.521 283.311 254.97 282.561 244.096 284C255.18 269.451 265.622 246.845 275.646 231.004C280.056 224.033 284.971 216.613 289.146 209.596C302.879 186.047 316.389 162.368 329.675 138.564C346.203 109.513 363.065 80.653 380.256 51.9898C390.11 35.4483 398.71 17.3651 409.366 1.55774C415.08 1.29513 421.301 1.29165 427.054 1.17427Z" fill="white"/>
<path d="M218.309 1.31216L224 1.15608L193.641 50.3271L170.178 91.0997L136.561 149.51L124.008 172.428L103.37 206.726L77.2097 251.035L57.3197 283.677L6.18221 283.433L0 284.156L22.4687 244.331L54.6016 189.816L75.3213 152.467L94.3273 119.376L144.096 31L161 1.15608L218.309 1.31216Z" fill="white"/>
<path d="M344.758 0L345.096 0.735049C326.643 33.9528 307.753 66.9251 288.428 99.6433C284.236 106.683 278.484 114.061 274.613 121.064C265.581 137.399 256.332 153.496 247.097 169.697L208.592 236.882C199.377 253.009 192.444 267.92 180.666 282.525C163.285 284.093 142.445 282.6 123.432 284L123.098 283.728C123.005 282.163 127.788 276.233 129.062 273.917C135.826 261.605 142.61 249.297 149.637 237.134L240.526 79.7429C249.025 64.9272 257.723 50.1984 266.187 35.3414C268.992 30.4177 277.596 15 285.096 0.735052C305.596 0.735046 325.596 0.735049 344.131 0.1168L344.758 0Z" fill="white"/>
</svg>
```

`scripts/geiger/assets/icon.svg` — white mark centred on the Geiger dark tile (favicons/touch icons):

```svg
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
<rect width="512" height="512" rx="96" fill="#161616"/>
<g transform="translate(56 134) scale(0.8565)" fill="#ffffff">
<path d="M427.054 1.17427C431.046 1.15338 464.984 0.670938 466.079 1.40804C466.298 4.01125 464.421 3.92073 463.267 6.18971C450.436 31.3381 435.978 55.3181 422.003 79.8289L339.669 223C327.843 243.287 317.065 263.871 304.413 283.952L285.161 283.494C273.521 283.311 254.97 282.561 244.096 284C255.18 269.451 265.622 246.845 275.646 231.004C280.056 224.033 284.971 216.613 289.146 209.596C302.879 186.047 316.389 162.368 329.675 138.564C346.203 109.513 363.065 80.653 380.256 51.9898C390.11 35.4483 398.71 17.3651 409.366 1.55774C415.08 1.29513 421.301 1.29165 427.054 1.17427Z"/>
<path d="M218.309 1.31216L224 1.15608L193.641 50.3271L170.178 91.0997L136.561 149.51L124.008 172.428L103.37 206.726L77.2097 251.035L57.3197 283.677L6.18221 283.433L0 284.156L22.4687 244.331L54.6016 189.816L75.3213 152.467L94.3273 119.376L144.096 31L161 1.15608L218.309 1.31216Z"/>
<path d="M344.758 0L345.096 0.735049C326.643 33.9528 307.753 66.9251 288.428 99.6433C284.236 106.683 278.484 114.061 274.613 121.064C265.581 137.399 256.332 153.496 247.097 169.697L208.592 236.882C199.377 253.009 192.444 267.92 180.666 282.525C163.285 284.093 142.445 282.6 123.432 284L123.098 283.728C123.005 282.163 127.788 276.233 129.062 273.917C135.826 261.605 142.61 249.297 149.637 237.134L240.526 79.7429C249.025 64.9272 257.723 50.1984 266.187 35.3414C268.992 30.4177 277.596 15 285.096 0.735052C305.596 0.735046 325.596 0.735049 344.131 0.1168L344.758 0Z"/>
</g>
</svg>
```

`scripts/geiger/assets/wordmark.svg` — dark mark + "Geiger Sign" for emails (light backgrounds):

```svg
<svg width="1980" height="300" viewBox="0 0 1980 300" xmlns="http://www.w3.org/2000/svg">
<g transform="translate(0 7.5) scale(1.0)" fill="#161616">
<path d="M427.054 1.17427C431.046 1.15338 464.984 0.670938 466.079 1.40804C466.298 4.01125 464.421 3.92073 463.267 6.18971C450.436 31.3381 435.978 55.3181 422.003 79.8289L339.669 223C327.843 243.287 317.065 263.871 304.413 283.952L285.161 283.494C273.521 283.311 254.97 282.561 244.096 284C255.18 269.451 265.622 246.845 275.646 231.004C280.056 224.033 284.971 216.613 289.146 209.596C302.879 186.047 316.389 162.368 329.675 138.564C346.203 109.513 363.065 80.653 380.256 51.9898C390.11 35.4483 398.71 17.3651 409.366 1.55774C415.08 1.29513 421.301 1.29165 427.054 1.17427Z"/>
<path d="M218.309 1.31216L224 1.15608L193.641 50.3271L170.178 91.0997L136.561 149.51L124.008 172.428L103.37 206.726L77.2097 251.035L57.3197 283.677L6.18221 283.433L0 284.156L22.4687 244.331L54.6016 189.816L75.3213 152.467L94.3273 119.376L144.096 31L161 1.15608L218.309 1.31216Z"/>
<path d="M344.758 0L345.096 0.735049C326.643 33.9528 307.753 66.9251 288.428 99.6433C284.236 106.683 278.484 114.061 274.613 121.064C265.581 137.399 256.332 153.496 247.097 169.697L208.592 236.882C199.377 253.009 192.444 267.92 180.666 282.525C163.285 284.093 142.445 282.6 123.432 284L123.098 283.728C123.005 282.163 127.788 276.233 129.062 273.917C135.826 261.605 142.61 249.297 149.637 237.134L240.526 79.7429C249.025 64.9272 257.723 50.1984 266.187 35.3414C268.992 30.4177 277.596 15 285.096 0.735052C305.596 0.735046 325.596 0.735049 344.131 0.1168L344.758 0Z"/>
</g>
<text x="540" y="232" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="230" font-weight="600" fill="#161616">Geiger Sign</text>
</svg>
```

`scripts/geiger/assets/og.svg` — 1200×630 share image:

```svg
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
<rect width="1200" height="630" fill="#161616"/>
<g transform="translate(160 250) scale(0.45)" fill="#ffffff">
<path d="M427.054 1.17427C431.046 1.15338 464.984 0.670938 466.079 1.40804C466.298 4.01125 464.421 3.92073 463.267 6.18971C450.436 31.3381 435.978 55.3181 422.003 79.8289L339.669 223C327.843 243.287 317.065 263.871 304.413 283.952L285.161 283.494C273.521 283.311 254.97 282.561 244.096 284C255.18 269.451 265.622 246.845 275.646 231.004C280.056 224.033 284.971 216.613 289.146 209.596C302.879 186.047 316.389 162.368 329.675 138.564C346.203 109.513 363.065 80.653 380.256 51.9898C390.11 35.4483 398.71 17.3651 409.366 1.55774C415.08 1.29513 421.301 1.29165 427.054 1.17427Z"/>
<path d="M218.309 1.31216L224 1.15608L193.641 50.3271L170.178 91.0997L136.561 149.51L124.008 172.428L103.37 206.726L77.2097 251.035L57.3197 283.677L6.18221 283.433L0 284.156L22.4687 244.331L54.6016 189.816L75.3213 152.467L94.3273 119.376L144.096 31L161 1.15608L218.309 1.31216Z"/>
<path d="M344.758 0L345.096 0.735049C326.643 33.9528 307.753 66.9251 288.428 99.6433C284.236 106.683 278.484 114.061 274.613 121.064C265.581 137.399 256.332 153.496 247.097 169.697L208.592 236.882C199.377 253.009 192.444 267.92 180.666 282.525C163.285 284.093 142.445 282.6 123.432 284L123.098 283.728C123.005 282.163 127.788 276.233 129.062 273.917C135.826 261.605 142.61 249.297 149.637 237.134L240.526 79.7429C249.025 64.9272 257.723 50.1984 266.187 35.3414C268.992 30.4177 277.596 15 285.096 0.735052C305.596 0.735046 325.596 0.735049 344.131 0.1168L344.758 0Z"/>
</g>
<text x="420" y="345" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="96" font-weight="600" fill="#ffffff">Geiger Sign</text>
</svg>
```

- [ ] **Step 3: Asset generator**

`scripts/geiger/make-assets.mjs`:

```js
#!/usr/bin/env node
// Renders Geiger Sign favicons, touch icons, email logos and the OG image from scripts/geiger/assets/*.svg.
// Usage: node scripts/geiger/make-assets.mjs <dir whose node_modules has sharp@0.34.4 and png-to-ico@2.1.8>
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const depsDir = process.argv[2];
if (!depsDir) throw new Error('Pass the directory that has sharp and png-to-ico installed.');

const require = createRequire(join(depsDir, 'package.json'));
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const svg = (name) => readFileSync(join('scripts/geiger/assets', name));
const write = (path, buffer) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
  console.log(`wrote ${path}`);
};
const png = (name, size) => sharp(svg(name), { density: 384 }).resize(size, size).png().toBuffer();

const ICON_SIZES = {
  'favicon-16x16.png': 16,
  'favicon-32x32.png': 32,
  'apple-touch-icon.png': 180,
  'android-chrome-192x192.png': 192,
  'android-chrome-512x512.png': 512,
};

const iconFiles = {};
for (const [file, size] of Object.entries(ICON_SIZES)) iconFiles[file] = await png('icon.svg', size);
const favicon = await pngToIco([await png('icon.svg', 16), await png('icon.svg', 32), await png('icon.svg', 48)]);

const wordmark = await sharp(svg('wordmark.svg'), { density: 192 }).resize({ height: 96 }).png().toBuffer();
const og = await sharp(svg('og.svg')).jpeg({ quality: 90 }).toBuffer();

for (const dir of ['apps/remix/public', 'packages/assets']) {
  for (const [file, buffer] of Object.entries(iconFiles)) write(join(dir, file), buffer);
  write(join(dir, 'favicon.ico'), favicon);
  write(join(dir, 'static/logo.png'), wordmark);
}
write('packages/assets/logo.png', wordmark);
write('packages/email/static/logo.png', wordmark);
write('apps/remix/public/opengraph-image.jpg', og);
```

- [ ] **Step 4: Render the assets**

```bash
DEPS="$TEMP/geiger-sign-asset-deps"; mkdir -p "$DEPS" && npm install --prefix "$DEPS" --no-save sharp@0.34.4 png-to-ico@2.1.8
cd /c/Pro/geiger-sign && node scripts/geiger/make-assets.mjs "$DEPS"
git status --short apps/remix/public packages/assets packages/email/static
```
Expected: 18 `wrote …` lines; `git status` shows those files modified (` M`). Open `apps/remix/public/android-chrome-512x512.png` and `packages/email/static/logo.png` with the Read tool and confirm the mark/wordmark render (dark tile + white mark; dark mark + "Geiger Sign" text).

- [ ] **Step 5: Web manifest**

`apps/remix/public/site.webmanifest`: replace

```json
  "name": "Documenso",
  "short_name": "Documenso",
```
with
```json
  "name": "Geiger Sign",
  "short_name": "Geiger Sign",
```

- [ ] **Step 6: Logo components (inline SVG, `currentColor`, same exports)**

Replace `apps/remix/app/components/general/branding-logo.tsx` with:

```tsx
import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

// Geiger Sign wordmark: the Geiger mark plus the product name, drawn in currentColor.
export const BrandingLogo = ({ ...props }: LogoProps) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1980 300" role="img" aria-label="Geiger Sign" {...props}>
      <g fill="currentColor" transform="translate(0 7.5)">
        <path d="M427.054 1.17427C431.046 1.15338 464.984 0.670938 466.079 1.40804C466.298 4.01125 464.421 3.92073 463.267 6.18971C450.436 31.3381 435.978 55.3181 422.003 79.8289L339.669 223C327.843 243.287 317.065 263.871 304.413 283.952L285.161 283.494C273.521 283.311 254.97 282.561 244.096 284C255.18 269.451 265.622 246.845 275.646 231.004C280.056 224.033 284.971 216.613 289.146 209.596C302.879 186.047 316.389 162.368 329.675 138.564C346.203 109.513 363.065 80.653 380.256 51.9898C390.11 35.4483 398.71 17.3651 409.366 1.55774C415.08 1.29513 421.301 1.29165 427.054 1.17427Z" />
        <path d="M218.309 1.31216L224 1.15608L193.641 50.3271L170.178 91.0997L136.561 149.51L124.008 172.428L103.37 206.726L77.2097 251.035L57.3197 283.677L6.18221 283.433L0 284.156L22.4687 244.331L54.6016 189.816L75.3213 152.467L94.3273 119.376L144.096 31L161 1.15608L218.309 1.31216Z" />
        <path d="M344.758 0L345.096 0.735049C326.643 33.9528 307.753 66.9251 288.428 99.6433C284.236 106.683 278.484 114.061 274.613 121.064C265.581 137.399 256.332 153.496 247.097 169.697L208.592 236.882C199.377 253.009 192.444 267.92 180.666 282.525C163.285 284.093 142.445 282.6 123.432 284L123.098 283.728C123.005 282.163 127.788 276.233 129.062 273.917C135.826 261.605 142.61 249.297 149.637 237.134L240.526 79.7429C249.025 64.9272 257.723 50.1984 266.187 35.3414C268.992 30.4177 277.596 15 285.096 0.735052C305.596 0.735046 325.596 0.735049 344.131 0.1168L344.758 0Z" />
      </g>
      <text x="540" y="232" fill="currentColor" fontFamily="inherit" fontSize="230" fontWeight="600">
        Geiger Sign
      </text>
    </svg>
  );
};
```

Replace `apps/remix/app/components/general/branding-logo-icon.tsx` with:

```tsx
import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

// Geiger mark on its own (mobile header, compact spots), drawn in currentColor.
export const BrandingLogoIcon = ({ ...props }: LogoProps) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -91 467 467" role="img" aria-label="Geiger Sign" {...props}>
      <g fill="currentColor">
        <path d="M427.054 1.17427C431.046 1.15338 464.984 0.670938 466.079 1.40804C466.298 4.01125 464.421 3.92073 463.267 6.18971C450.436 31.3381 435.978 55.3181 422.003 79.8289L339.669 223C327.843 243.287 317.065 263.871 304.413 283.952L285.161 283.494C273.521 283.311 254.97 282.561 244.096 284C255.18 269.451 265.622 246.845 275.646 231.004C280.056 224.033 284.971 216.613 289.146 209.596C302.879 186.047 316.389 162.368 329.675 138.564C346.203 109.513 363.065 80.653 380.256 51.9898C390.11 35.4483 398.71 17.3651 409.366 1.55774C415.08 1.29513 421.301 1.29165 427.054 1.17427Z" />
        <path d="M218.309 1.31216L224 1.15608L193.641 50.3271L170.178 91.0997L136.561 149.51L124.008 172.428L103.37 206.726L77.2097 251.035L57.3197 283.677L6.18221 283.433L0 284.156L22.4687 244.331L54.6016 189.816L75.3213 152.467L94.3273 119.376L144.096 31L161 1.15608L218.309 1.31216Z" />
        <path d="M344.758 0L345.096 0.735049C326.643 33.9528 307.753 66.9251 288.428 99.6433C284.236 106.683 278.484 114.061 274.613 121.064C265.581 137.399 256.332 153.496 247.097 169.697L208.592 236.882C199.377 253.009 192.444 267.92 180.666 282.525C163.285 284.093 142.445 282.6 123.432 284L123.098 283.728C123.005 282.163 127.788 276.233 129.062 273.917C135.826 261.605 142.61 249.297 149.637 237.134L240.526 79.7429C249.025 64.9272 257.723 50.1984 266.187 35.3414C268.992 30.4177 277.596 15 285.096 0.735052C305.596 0.735046 325.596 0.735049 344.131 0.1168L344.758 0Z" />
      </g>
    </svg>
  );
};
```

(`viewBox="0 -91 467 467"` makes the icon square so it sits like upstream's 84×84 icon.)

- [ ] **Step 7: Log the changes**

```bash
cd /c/Pro/geiger-sign
{ git diff --name-only -- apps/remix/public packages/assets packages/email/static apps/remix/app/components/general/branding-logo.tsx apps/remix/app/components/general/branding-logo-icon.tsx; git ls-files --others --exclude-standard scripts/geiger; } | sort -u | grep -v check-branding \
  | sed 's#.*#| `&` | 2026-11-21 | Geiger Sign logo, icons and share image. |#' >> GEIGER_CHANGES.md
```
Then edit three generated rows' "Change" text: `scripts/geiger/make-assets.mjs` → "Generates the Geiger Sign icons and logos from the SVG sources."; `scripts/geiger/assets/*.svg` rows → "Geiger Sign artwork source."; `apps/remix/public/site.webmanifest` → "App name Geiger Sign."

- [ ] **Step 8: Verify**

Run: `node scripts/geiger/check-branding.mjs 2>&1 | grep -E "webmanifest|not listed"`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add scripts/geiger apps/remix/public packages/assets packages/email/static apps/remix/app/components/general/branding-logo.tsx apps/remix/app/components/general/branding-logo-icon.tsx GEIGER_CHANGES.md
git commit -m "geiger: Geiger Sign logos, favicons and share image

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Geiger theme values

**Files:**
- Create: `packages/ui/styles/geiger-theme.css`
- Modify: `apps/remix/app/app.css:1` (one import line added after it)
- Modify: `packages/tailwind-config/index.cjs:70-83` (the `documenso` colour scale)
- Modify: `GEIGER_CHANGES.md`

**Interfaces:**
- Produces: the same CSS variable names Documenso already consumes (`--background`, `--primary`, …) with Geiger values; the `documenso-*` Tailwind scale maps to Geiger neutrals.

- [ ] **Step 1: Override file (layered after `theme.css`, so upstream's file stays untouched)**

`packages/ui/styles/geiger-theme.css`:

```css
/* Geiger Sign: Geiger palette values for Documenso's theme variables (HSL triplets, names unchanged). */
@layer base {
  :root,
  .dark-mode-disabled {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;

    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;

    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;

    --card: 0 0% 100%;
    --card-border: 240 5.9% 90%;
    --card-foreground: 240 10% 3.9%;

    --field-card: 240 4.8% 95.9%;
    --field-card-border: 240 5.9% 10%;
    --field-card-foreground: 240 10% 3.9%;

    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;

    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;

    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;

    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;

    --destructive: 0 72.2% 50.6%;
    --destructive-foreground: 0 0% 98%;

    --ring: 240 5% 64.9%;

    --radius: 0.625rem;
  }

  .dark:not(.dark-mode-disabled) {
    --background: 0 0% 8.6%;
    --foreground: 0 0% 90.6%;

    --muted: 0 0% 10.2%;
    --muted-foreground: 0 0% 64%;

    --popover: 0 0% 18%;
    --popover-foreground: 0 0% 90.6%;

    --card: 0 0% 12.5%;
    --card-border: 0 0% 20%;
    --card-foreground: 0 0% 90.6%;

    --widget: 0 0% 12.5%;
    --widget-foreground: 0 0% 18%;

    --border: 0 0% 20%;
    --input: 0 0% 14.1%;

    --primary: 0 0% 100%;
    --primary-foreground: 0 0% 8.6%;

    --secondary: 0 0% 10.2%;
    --secondary-foreground: 0 0% 90.6%;

    --accent: 0 0% 14.1%;
    --accent-foreground: 0 0% 90.6%;

    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;

    --ring: 0 0% 27.8%;

    --radius: 0.625rem;

    --envelope-editor-background: 0 0% 8.6%;
  }
}
```

(Values = geiger-docs `app/globals.css` light `:root` oklch tokens converted to HSL, and the dark hex tokens converted to HSL.)

- [ ] **Step 2: Import it after the upstream theme**

`apps/remix/app/app.css` — replace the first line

```css
@import "@documenso/ui/styles/theme.css";
```
with
```css
@import "@documenso/ui/styles/theme.css";
@import "@documenso/ui/styles/geiger-theme.css";
```

- [ ] **Step 3: Map the `documenso-*` scale to Geiger neutrals**

In `packages/tailwind-config/index.cjs` replace

```js
        documenso: {
          DEFAULT: '#A2E771',
          50: '#FFFFFF',
          100: '#FDFFFD',
          200: '#E7F9DA',
          300: '#D0F3B7',
          400: '#B9ED94',
          500: '#A2E771',
          600: '#83DF41',
          700: '#66C622',
          800: '#4D9619',
          900: '#356611',
          950: '#284E0D',
        },
```
with
```js
        // Geiger Sign: Geiger neutrals in place of Documenso green (class names unchanged).
        documenso: {
          DEFAULT: '#18181B',
          50: '#FAFAFA',
          100: '#F4F4F5',
          200: '#E4E4E7',
          300: '#D4D4D8',
          400: '#A1A1AA',
          500: '#71717A',
          600: '#52525B',
          700: '#3F3F46',
          800: '#27272A',
          900: '#18181B',
          950: '#09090B',
        },
```

- [ ] **Step 4: Check for dark-mode contrast traps**

Run: `grep -rn "text-documenso-7" apps/remix/app --include=*.tsx | grep -v "dark:" | head`
Expected: a handful of hits (e.g. `complete.tsx` "Everyone has signed"). For each hit with no `dark:` variant, append ` dark:text-documenso-300` to that `className` string so the text stays readable on the dark background. Record each touched file in Step 5.

- [ ] **Step 5: Log the changes**

Append to `GEIGER_CHANGES.md`:

```markdown
| `packages/ui/styles/geiger-theme.css` | 2026-11-21 | Geiger palette values for the theme variables. |
| `apps/remix/app/app.css` | 2026-11-21 | Imports the Geiger theme after the upstream theme. |
| `packages/tailwind-config/index.cjs` | 2026-11-21 | `documenso-*` colour scale mapped to Geiger neutrals. |
```
plus one row per file touched in Step 4: `| \`<path>\` | 2026-11-21 | Readable accent text in dark mode. |`

- [ ] **Step 6: Verify and commit**

Run: `node scripts/geiger/check-branding.mjs 2>&1 | grep "not listed"` → no output.

```bash
git add packages/ui/styles/geiger-theme.css apps/remix/app/app.css packages/tailwind-config/index.cjs apps/remix/app GEIGER_CHANGES.md
git commit -m "geiger: Geiger palette for the app theme

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: AGPL source link

**Files:**
- Create: `apps/remix/app/components/general/geiger-source-link.tsx`
- Modify: `apps/remix/app/routes/_recipient+/_layout.tsx` (import + footer after `</main>`)
- Modify: `apps/remix/app/routes/_authenticated+/_layout.tsx` (import + footer after `</main>`)
- Modify: `docker/Dockerfile` (runner stage, after the telemetry `ENV` lines ~108)
- Modify: `GEIGER_CHANGES.md`

**Interfaces:**
- Produces: `GeigerSourceLink({ className?: string })`, href = `env('NEXT_PUBLIC_GEIGER_SOURCE_URL')` or `https://github.com/bhargavjoshi1237/geiger-sign`. Build arg `GEIGER_SOURCE_URL` → runtime env `NEXT_PUBLIC_GEIGER_SOURCE_URL` (exposed to the browser by `createPublicEnv`, which forwards every `NEXT_PUBLIC_*`). Task 9's workflow sets the build arg.

- [ ] **Step 1: Confirm the failure**

Run: `node scripts/geiger/check-branding.mjs 2>&1 | grep GeigerSourceLink`
Expected: two `missing <GeigerSourceLink />` lines.

- [ ] **Step 2: Component**

`apps/remix/app/components/general/geiger-source-link.tsx`:

```tsx
import { env } from '@documenso/lib/utils/env';
import { cn } from '@documenso/ui/lib/utils';
import { Trans } from '@lingui/react/macro';

const DEFAULT_SOURCE_URL = 'https://github.com/bhargavjoshi1237/geiger-sign';

export type GeigerSourceLinkProps = {
  className?: string;
};

// AGPL-3.0 §13: offer every network user the source of the version that is running.
export const GeigerSourceLink = ({ className }: GeigerSourceLinkProps) => {
  const href = env('NEXT_PUBLIC_GEIGER_SOURCE_URL') || DEFAULT_SOURCE_URL;

  return (
    <footer className={cn('flex justify-center px-4 py-4 text-muted-foreground/70 text-xs', className)}>
      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground hover:underline">
        <Trans>Geiger Sign is free software (AGPL-3.0) · Source code</Trans>
      </a>
    </footer>
  );
};
```

- [ ] **Step 3: Recipient layout**

In `apps/remix/app/routes/_recipient+/_layout.tsx` add the import after the `GenericErrorLayout` import:

```tsx
import { GeigerSourceLink } from '~/components/general/geiger-source-link';
```
and replace

```tsx
        <Outlet />
      </main>
    </div>
  );
}
```
with
```tsx
        <Outlet />
      </main>

      <GeigerSourceLink />
    </div>
  );
}
```

- [ ] **Step 4: Authenticated layout**

In `apps/remix/app/routes/_authenticated+/_layout.tsx` add `import { GeigerSourceLink } from '~/components/general/geiger-source-link';` next to the other `~/components/general/*` imports, and replace

```tsx
            <Outlet />
          </main>
        </div>
```
with
```tsx
            <Outlet />
          </main>

          {layoutMode !== 'settings' && <GeigerSourceLink />}
        </div>
```
(Settings mode is a fixed-height `md:h-dvh` layout; there the link would be clipped, and those pages are reached through the main layout, which already shows it.)

- [ ] **Step 5: Build arg → runtime env**

In `docker/Dockerfile`, in the `runner` stage, replace

```dockerfile
ARG NEXT_PRIVATE_TELEMETRY_HOST=""
ENV NEXT_PRIVATE_TELEMETRY_HOST="$NEXT_PRIVATE_TELEMETRY_HOST"

# Don't run production as root
```
with
```dockerfile
ARG NEXT_PRIVATE_TELEMETRY_HOST=""
ENV NEXT_PRIVATE_TELEMETRY_HOST="$NEXT_PRIVATE_TELEMETRY_HOST"

# Geiger Sign: source of this exact build, linked from every page (AGPL-3.0 §13)
ARG GEIGER_SOURCE_URL="https://github.com/bhargavjoshi1237/geiger-sign"
ENV NEXT_PUBLIC_GEIGER_SOURCE_URL="$GEIGER_SOURCE_URL"

# Don't run production as root
```
(This exact text appears once, in the runner stage; the builder stage has no "Don't run production as root" line.)

- [ ] **Step 6: Log the changes**

Append to `GEIGER_CHANGES.md`:

```markdown
| `apps/remix/app/components/general/geiger-source-link.tsx` | 2026-11-21 | "Source code" link to the running version (AGPL-3.0 §13). |
| `apps/remix/app/routes/_authenticated+/_layout.tsx` | 2026-11-21 | Shows the source link. |
| `docker/Dockerfile` | 2026-11-21 | `GEIGER_SOURCE_URL` build arg → `NEXT_PUBLIC_GEIGER_SOURCE_URL`. |
```
and change the existing `apps/remix/app/routes/_recipient+/_layout.tsx` row's text to: "Signer tab title "Sign Document - Geiger Sign"; shows the source link."

- [ ] **Step 7: The check passes**

Run: `node scripts/geiger/check-branding.mjs; echo "exit=$?"`
Expected: `Geiger Sign branding check passed.` and `exit=0`.

- [ ] **Step 8: Commit**

```bash
git add apps/remix/app/components/general/geiger-source-link.tsx "apps/remix/app/routes/_recipient+/_layout.tsx" "apps/remix/app/routes/_authenticated+/_layout.tsx" docker/Dockerfile GEIGER_CHANGES.md
git commit -m "geiger: link the running source from every page (AGPL-3.0 section 13)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Translations and typecheck

**Files:**
- Modify: `packages/lib/translations/*/web.po` (regenerated)
- Modify: `GEIGER_CHANGES.md`

**Interfaces:**
- Consumes: the changed `msg`/`<Trans>` strings from Tasks 3, 4 and 7.

- [ ] **Step 1: Install dependencies without lifecycle scripts**

```bash
cd /c/Pro/geiger-sign && npm ci --ignore-scripts 2>&1 | tail -5
```
Expected: `added N packages`. (`--ignore-scripts` skips Prisma generate, Playwright browsers and husky; extract and typecheck below don't need them. An `EBADENGINE` warning for npm < 11.17 is fine.)

- [ ] **Step 2: Extract catalogues**

```bash
npm run translate:extract 2>&1 | tail -20
git diff --stat -- packages/lib/translations
grep -n 'msgid "Sign Document - Geiger Sign"' packages/lib/translations/en/web.po
grep -c 'Sign Document - Documenso' packages/lib/translations/en/web.po
```
Expected: every locale's `web.po` changes; the `grep -n` prints one line; the `grep -c` prints `0`. (Locales other than English show English for the changed strings until translated — accepted in the spec.)

**Fallback if Step 1 or 2 fails on Windows:** skip committing catalogues; instead add `- run: npm run translate:extract` before the build step in Task 9's workflow (`npm ci --ignore-scripts` first), and note it in `GEIGER_CHANGES.md` under the `.github/workflows/geiger-image.yml` row.

- [ ] **Step 3: Typecheck the changed TypeScript**

```bash
npx tsc -p apps/remix/tsconfig.json --noEmit 2>&1 | grep -E "branding-logo|geiger-source-link|_layout.tsx|meta.ts|_index.tsx|template-|templates/" | head -20
```
Expected: no output (errors in untouched files, e.g. from skipped Prisma generation, are ignored by the filter).

- [ ] **Step 4: Log, verify and commit**

```bash
git diff --name-only -- packages/lib/translations | sed 's#.*#| `&` | 2026-11-21 | Catalogue re-extracted for the renamed strings. |#' >> GEIGER_CHANGES.md
node scripts/geiger/check-branding.mjs
git add packages/lib/translations GEIGER_CHANGES.md
git commit -m "geiger: re-extract translation catalogues

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
Expected: check passes before the commit.

---

### Task 9: Image build on GitHub Actions (GHCR)

**Files:**
- Create: `.github/workflows/geiger-image.yml`
- Modify: `GEIGER_CHANGES.md`

**Interfaces:**
- Produces: `ghcr.io/bhargavjoshi1237/geiger-sign:sha-<7 chars>` on every push to `geiger`; `:<tag>` and `:latest` on `geiger-v*` tags. First release: `ghcr.io/bhargavjoshi1237/geiger-sign:geiger-v2.21.1-1`. Task 10 pins that tag.

- [ ] **Step 1: Workflow**

`.github/workflows/geiger-image.yml`:

```yaml
# Geiger Sign: build the Docker image and publish it to GHCR. Upstream Documenso workflows are disabled on this fork.
name: Geiger Sign image

on:
  push:
    branches: [geiger]
    tags: ['geiger-v*']
  workflow_dispatch:

permissions:
  contents: read
  packages: write

concurrency:
  group: geiger-image-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      # Full history so the branding check can diff against the upstream tag
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Branding and licence check
        run: node scripts/geiger/check-branding.mjs

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=sha,prefix=sha-
            type=ref,event=tag
            type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/geiger-v') }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            GEIGER_SOURCE_URL=https://github.com/${{ github.repository }}/tree/${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

(`fetch-depth: 0` brings the `v2.21.1` tag into the checkout, which `check-branding.mjs` diffs against.)

- [ ] **Step 2: Log and commit**

Append `| \`.github/workflows/geiger-image.yml\` | 2026-11-21 | Builds and publishes the Geiger Sign image to GHCR. |` to `GEIGER_CHANGES.md`, then:

```bash
node scripts/geiger/check-branding.mjs
git add .github/workflows/geiger-image.yml GEIGER_CHANGES.md
git commit -m "geiger: build and publish the image to GHCR

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Push and watch the build**

```bash
git push origin geiger
gh run list --repo bhargavjoshi1237/geiger-sign --workflow "Geiger Sign image" --limit 1
gh run watch --repo bhargavjoshi1237/geiger-sign --exit-status $(gh run list --repo bhargavjoshi1237/geiger-sign --workflow "Geiger Sign image" --limit 1 --json databaseId -q '.[0].databaseId')
```
Expected: the run ends `completed success` (the build takes ~20–40 minutes). Re-run Task 1 Step 3 now if it found no workflows earlier, and confirm only "Geiger Sign image" is enabled.

- [ ] **Step 4: Tag the release and make the package public**

```bash
git tag -a geiger-v2.21.1-1 -m "Geiger Sign 2.21.1-1 (Documenso v2.21.1 + Geiger branding)"
git push origin geiger-v2.21.1-1
gh run watch --repo bhargavjoshi1237/geiger-sign --exit-status $(gh run list --repo bhargavjoshi1237/geiger-sign --workflow "Geiger Sign image" --limit 1 --json databaseId -q '.[0].databaseId')
gh api -X PATCH /user/packages/container/geiger-sign -f visibility=public
gh api /user/packages/container/geiger-sign -q .visibility
```
Expected: run succeeds; last command prints `public`. If the visibility PATCH is rejected (GitHub sometimes only allows it in the UI), ask the user to set it at `https://github.com/users/bhargavjoshi1237/packages/container/geiger-sign/settings` → Change visibility → Public.

- [ ] **Step 5: Verify the image is pullable anonymously**

```bash
curl -s "https://ghcr.io/token?scope=repository:bhargavjoshi1237/geiger-sign:pull" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',async()=>{const t=JSON.parse(s).token;const r=await fetch('https://ghcr.io/v2/bhargavjoshi1237/geiger-sign/manifests/geiger-v2.21.1-1',{headers:{Authorization:'Bearer '+t,Accept:'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json'}});console.log(r.status)})"
```
Expected: `200`.

---

### Task 10: Point geiger-docs at Geiger Sign (decision record + deploy kit + docs)

**Files (all in `geiger-docs/`):**
- Create: `docs/decisions/2026-11-21-geiger-sign-fork.md`
- Modify: `docs/decisions/2026-11-08-signing-with-documenso.md` (status lines at the top)
- Modify: `deploy/documenso/render/Dockerfile:1-4`, `deploy/documenso/compose.yml:22-23`
- Modify: `deploy/documenso/README.md` (intro, image row, new "Branding" section, "Upgrading" step 3), `deploy/documenso/render/README.md` (intro + Dockerfile row)
- Modify: `README.md` (Signing bullet)

**Interfaces:**
- Consumes: image `ghcr.io/bhargavjoshi1237/geiger-sign:geiger-v2.21.1-1` (Task 9).

- [ ] **Step 1: New decision record**

`docs/decisions/2026-11-21-geiger-sign-fork.md`:

```markdown
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
```

- [ ] **Step 2: Mark the old record**

In `docs/decisions/2026-11-08-signing-with-documenso.md` replace

```markdown
- **Status:** Accepted
```
with
```markdown
- **Status:** Accepted; the "do not modify it" rule is superseded by `2026-11-21-geiger-sign-fork.md` (we now run a public AGPL fork, Geiger Sign). Everything else still applies.
```

- [ ] **Step 3: Deploy kit image**

`deploy/documenso/render/Dockerfile` — replace the first four lines

```dockerfile
# Geiger Docs signing service on Render: the official, unmodified Documenso image plus a boot script.
# The script only sets env and a signing certificate, then execs the image's own entrypoint and CMD (see entrypoint.sh, README.md).
# Upgrade by bumping this tag only; never patch or rebuild Documenso itself.
FROM documenso/documenso:v2.21.1
```
with
```dockerfile
# Geiger Docs signing service: the Geiger Sign image (public AGPL fork of Documenso) plus a boot script.
# The script only sets env and a signing certificate, then execs the image's own entrypoint and CMD (see entrypoint.sh, README.md).
# Upgrade by bumping this tag to a newer geiger-v* release of github.com/bhargavjoshi1237/geiger-sign.
FROM ghcr.io/bhargavjoshi1237/geiger-sign:geiger-v2.21.1-1
```

`deploy/documenso/compose.yml` — replace

```yaml
    # Upgrade by bumping this tag only (see README "Upgrading"). Never build or patch this image.
    image: documenso/documenso:v2.21.1
```
with
```yaml
    # Geiger Sign (github.com/bhargavjoshi1237/geiger-sign). Upgrade by bumping the geiger-v* tag (see README "Upgrading").
    image: ghcr.io/bhargavjoshi1237/geiger-sign:geiger-v2.21.1-1
```
and replace the licence comment `# Licence: empty = Community Edition (AGPL, unmodified)` with `# Licence: empty = Community Edition (AGPL; Geiger Sign is a published modified version)`.

- [ ] **Step 4: Runbook — intro, image row, upgrade step**

In `deploy/documenso/README.md`:

Replace
```markdown
**Run the official image as it ships.** No forks, no patches, and no files mounted over the app code. Everything here is configuration.
```
with
```markdown
**Run the Geiger Sign image.** Geiger Sign is our public AGPL fork of Documenso ([source](https://github.com/bhargavjoshi1237/geiger-sign), reasoning in `docs/decisions/2026-11-21-geiger-sign-fork.md`). Change Documenso's code only in that repo; never patch the running container or mount files over the app code.
```

Replace
```markdown
| Image | `documenso/documenso:v2.21.1` (pinned in `compose.yml`) + `postgres:15` |
| Public URL | `https://sign.geiger.studio` (example) = `NEXT_PUBLIC_WEBAPP_URL` = Geiger Docs `DOCUMENSO_URL` |
```
with
```markdown
| Image | `ghcr.io/bhargavjoshi1237/geiger-sign:geiger-v2.21.1-1` (pinned in `compose.yml`) + `postgres:15` |
| Public URL | `https://sign.geiger.studio` = `NEXT_PUBLIC_WEBAPP_URL` = Geiger Docs `DOCUMENSO_URL` |
```

Replace Upgrading step 3
```markdown
3. Change the image tag in `compose.yml`, for example `v2.21.1` → `v2.22.0`. This is the only change; never use `latest`.
```
with
```markdown
3. In `geiger-sign`, merge the upstream tag into `geiger` (`git fetch upstream --tags && git merge v2.22.0`), run `node scripts/geiger/check-branding.mjs`, push, and tag `geiger-v2.22.0-1`. Then change the image tag in `compose.yml` (and `render/Dockerfile`) to it. Never use `latest`.
```

- [ ] **Step 5: Runbook — Branding section**

Insert this section immediately before `## 9. Private networks (SSRF bypass)`:

```markdown
## 8b. Branding

The image already says Geiger Sign everywhere a setting can't reach. Finish the look in settings:

1. Env on the service: `NEXT_PRIVATE_SMTP_FROM_NAME="Geiger Sign"`, `NEXT_PRIVATE_SIGNING_REASON="Signed with Geiger Sign"`, `NEXT_PUBLIC_DISABLE_SIGNUP=true`.
2. Team settings → **Branding** (the team that owns the API token):
   - Enable custom branding.
   - Logo: upload `packages/email/static/logo.png` from the geiger-sign repo.
   - Brand website: `https://geiger.studio`.
   - Brand details: the Geiger legal name and address.
   - Colours: primary `#18181b`, background `#ffffff`.
3. Send a test document to yourself and check: the email shows the Geiger Sign logo and sender, the signing page tab reads "Sign Document - Geiger Sign", and the footer has the "Source code" link.

Branding lives in Documenso's database, so it survives image upgrades.
```

- [ ] **Step 6: Render runbook and root README**

In `deploy/documenso/render/README.md` replace `A Render Blueprint that runs the official, unmodified \`documenso/documenso:v2.21.1\` image` with `A Render Blueprint that runs the Geiger Sign image (\`ghcr.io/bhargavjoshi1237/geiger-sign:geiger-v2.21.1-1\`, our public AGPL fork of Documenso)`, and in its file table replace `` `FROM documenso/documenso:v2.21.1`, adds the boot script `` with `` `FROM ghcr.io/bhargavjoshi1237/geiger-sign:geiger-v2.21.1-1`, adds the boot script ``. Also replace `The licensing rules are in \`docs/decisions/2026-11-08-signing-with-documenso.md\`.` with `The licensing rules are in \`docs/decisions/2026-11-08-signing-with-documenso.md\` and \`docs/decisions/2026-11-21-geiger-sign-fork.md\`.`

In root `README.md` replace

```markdown
- **Signing** runs through a self-hosted, unmodified [Documenso](https://github.com/documenso/documenso) called over its API.
```
with
```markdown
- **Signing** runs through [Geiger Sign](https://github.com/bhargavjoshi1237/geiger-sign), our public AGPL fork of [Documenso](https://github.com/documenso/documenso), called over its API.
```

- [ ] **Step 7: Check nothing still claims "unmodified"**

Run: `cd $GD && grep -rn -iE "unmodified|never (build|patch)|No forks" deploy README.md docs/decisions/2026-11-21-geiger-sign-fork.md`
Expected: no output, except lines that refer to the 2026-11-08 record historically. Fix any other hit by pointing it at Geiger Sign.

- [ ] **Step 8: Commit (geiger-docs)**

```bash
cd /c/Pro/geiger-docs
git add docs/decisions deploy README.md
git commit -m "docs(deploy): run Geiger Sign, the public AGPL fork of Documenso

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Deploy and verify end to end

**Files:** none (operations). Requires the user for DNS, Koyeb and the Documenso admin UI.

**Interfaces:**
- Consumes: Task 9 image, Task 10 deploy kit.

- [ ] **Step 1: Ask the user to finish open signing requests**

Signing links already sent point at the current Koyeb URL. Before switching the domain, ask the user to let pending requests complete or cancel them from the Signing tab.

- [ ] **Step 2: User adds DNS and the Koyeb custom domain**

Ask the user to: add `sign.geiger.studio` as a custom domain on the Koyeb service, create the CNAME record Koyeb shows, and wait until Koyeb marks the domain active.
Verify: `curl -s -o /dev/null -w "%{http_code}\n" https://sign.geiger.studio/api/health` → `200`.

- [ ] **Step 3: User redeploys Koyeb from the updated deploy kit**

Push geiger-docs' branch (ask first) so Koyeb rebuilds `deploy/documenso/render/Dockerfile`, and set on the Koyeb service: `NEXT_PUBLIC_WEBAPP_URL=https://sign.geiger.studio`, `NEXT_PRIVATE_SMTP_FROM_NAME=Geiger Sign`, `NEXT_PRIVATE_SIGNING_REASON=Signed with Geiger Sign`.
Verify:

```bash
curl -s https://sign.geiger.studio/api/health; echo
curl -s https://sign.geiger.studio/api/certificate-status; echo
curl -s https://sign.geiger.studio/signin | grep -oE "<title>[^<]*</title>"
```
Expected: health `"status":"ok"` with database and certificate ok; certificate status ok; title contains `Geiger Sign`.

- [ ] **Step 4: Move Geiger Docs to the new URL and fix the webhook**

- In geiger-docs `.env` (and the hosting env): `DOCUMENSO_URL=https://sign.geiger.studio`.
- In Documenso → team → Webhooks: confirm the webhook URL is the deployed Geiger Docs `<app>/api/signing/webhook` (unchanged by the domain move, but check it isn't a placeholder).
- Run the branding settings from the runbook's section 8b (user, or with admin access).

- [ ] **Step 5: End-to-end signature from Geiger Docs**

On the deployed Geiger Docs: create a document with `{{signature, r1}}`, send it to an inbox you control.
Check, in order:
1. The invite email shows the Geiger Sign logo, sender "Geiger Sign", and no "Documenso" text.
2. The signing page tab reads "Sign Document - Geiger Sign"; the favicon is the Geiger mark; the footer has "Source code" linking to `github.com/bhargavjoshi1237/geiger-sign/tree/<sha>`.
3. After signing, there's no "Check out Documenso" line.
4. Back in Geiger Docs the Signing tab shows **completed** (webhook), and the signed PDF, certificate and audit log download.
Record the outcome (pass, or the exact failure) in the final report to the user.
```
