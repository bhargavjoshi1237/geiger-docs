# Decision: e-signing with self-hosted Documenso

- **Date:** 2026-11-08
- **Status:** Accepted
- **Scope:** Geiger Docs, Step 2 of `docs/superpowers/specs/2026-11-08-harden-and-signing-design.md`
- **Deploy kit:** `deploy/documenso/`

## Context

Geiger Docs authors write documents in Markdown. Some of those documents need legally meaningful signatures from people inside and outside the suite. We want three things:

- Send a document for signature.
- Track each signer's progress.
- Keep the sealed PDF, the signing certificate and the audit log next to the document.

We do not want to build PDF sealing, audit trails or signer email flows ourselves.

`docs/product-research/open-source-signing-platform-shortlist.md` picked Documenso as the strongest open-source engine. That shortlist floated forking and theming it. This record settles how we use it instead.

Facts this decision rests on, checked on 2026-11-08 against Documenso v2.21.1 and its docs:

- **API.** The current API is v2. New integrations use the Envelope endpoints (`/api/v2/envelope/*`). API v1 and the legacy `/api/v2/document/*` endpoints are removed on 2027-03-01.
- **Fields.** Field positions are percentages of the page. Fields can also be placed from text placeholders in the PDF, such as `{{signature, r1}}`.
- **Webhooks.** Webhooks send the shared secret as plain text in `X-Documenso-Secret`, not as an HMAC. They expect a 2xx response within 10 seconds.
- **Licensing.** Documenso is dual-licensed:
  - the Community Edition is AGPL-3.0;
  - the Business and Enterprise editions are commercial.
  - Features under `packages/ee/` need a commercial license. These include embedded authoring, SSO, custom email domains, passkey or 2FA re-authentication, 21 CFR Part 11 and CSC/QES signing.

## Options considered

### Hosting

| Option | Cost | Pros | Cons |
|---|---|---|---|
| Documenso Cloud, Teams plan | $40/mo billed yearly, 5 users, +$8 per extra user | No infrastructure; API, webhooks and embedded signing included | Documents and signer data live with a third party; Documenso's branding; fair-use limits |
| Documenso Cloud, Platform plan | $250/mo billed yearly | White-label embedded signing; embedded authoring available as a paid add-on | The cost is hard to justify at our volume |
| **Self-host the Community Edition, unmodified (chosen)** | Infrastructure only | Free; we keep signer data; API, webhooks, teams, branding and embedded signing are all included in the Community Edition; no plan gates when billing is disabled | We run it: Postgres, backups, the signing certificate and upgrades. A self-signed certificate shows as "unverified" in Adobe Reader. |
| Self-host under a Business or Enterprise license | Price on request | We could modify the code privately and use Enterprise features | We need neither today |
| Fork and theme Documenso | Engineering time, plus a commercial license or AGPL disclosure | Full control of the UX | The AGPL would require us to publish the fork; a permanent merge burden |

### Field placement

| Option | Notes |
|---|---|
| Absolute coordinates computed by our PDF renderer | Brittle, because positions shift whenever the text reflows. |
| Authors place fields in Documenso's own UI | Every author would need a Documenso account and would have to leave Geiger Docs. |
| Embedded authoring (`EmbedCreateEnvelopeV2`) | An Enterprise feature. It needs a commercial license when self-hosted, or the Platform add-on on Cloud. |
| **Signature page plus inline placeholders (chosen)** | Our renderer appends a "Signatures" page with `{{signature, rN}}`, `{{name, rN}}` and `{{date, rN}}` for each signer. Authors can also insert tokens inline in the Markdown. When we pass `recipients[]` to `envelope/create`, Documenso maps `r1` to the first recipient, `r2` to the second, and so on. It creates the fields and covers each token with a white box. No paid features are involved. |

### Delivery

| Option | Notes |
|---|---|
| **Documenso sends the emails (`distributionMethod: "EMAIL"`) through Resend (chosen)** | Documenso's own templates cover invitations, reminders, completion and expiry. We send through the suite's existing Resend account (`NEXT_PRIVATE_SMTP_TRANSPORT=resend`) from a `geiger.studio` address. This is the least code to write. |
| `distributionMethod: "NONE"` plus suite email (`/api/email/send`) | Gives a consistent suite look and one email log. Dash's `sendRenderedEmail` already exists for this. However, we would have to render and own every lifecycle email. Kept as a later fallback; the choice stays isolated in `lib/server/documenso.js`. |
| Embedded signing inside Geiger Docs (`EmbedSignDocument`) | Included in the self-hosted Community Edition. A possible later addition for signers who are suite users. |

### Locking

| Option | Notes |
|---|---|
| No lock | The live document could drift away from what was actually signed. |
| Lock in the UI only | Easy to bypass through the API or a stale tab. |
| Freeze a version number and keep editing | People reading the document cannot tell which text is binding. |
| **DB trigger plus a UI mirror (chosen)** | Title and body are read-only while a request is `sending` or `pending`, and after it is `completed`. The states `cancelled`, `declined` and `failed` unlock it. To change signed content, duplicate the document. Each request also records `version_number`. |

## Decision

1. **Self-host the Documenso Community Edition**, using the official, unmodified `documenso/documenso` image with a pinned tag (currently `v2.21.1`) and its own Postgres. The image runs as a separate service, for example at `https://sign.geiger.studio`.
2. **Talk to it only over its HTTP API v2 Envelope endpoints**, from one server-only module, `lib/server/documenso.js`. Configuration comes from `DOCUMENSO_URL`, `DOCUMENSO_API_TOKEN` and `DOCUMENSO_WEBHOOK_SECRET`. Use plain `fetch`, with no Documenso code imported.
3. **Field placement:** an automatic signature page plus optional inline placeholders.
4. **Delivery:** Documenso sends all signing email through Resend from a `geiger.studio` sender.
5. **Locking:** content is locked by a DB trigger and mirrored in the UI, as described above.
6. **Storage:** completed artifacts (signed PDF, certificate, audit log) are copied into the private `docs-signing` bucket on `DOCUMENT_COMPLETED`, so Geiger Docs does not depend on Documenso to serve them later.

## Why the AGPL does not reach Geiger Docs

This rests on Documenso's own published policy (accessed 2026-11-08). It is not legal advice.

From [Licenses](https://docs.documenso.com/docs/policies/licenses):

> "Does using the Documenso API require a commercial license?" — "No. Calling the Documenso API from your application does not create a derivative work. Your application remains under your chosen license. However, if you modify Documenso itself and provide network access, AGPL-3.0 requirements apply."

> "What counts as a 'modification' under AGPL-3.0?" — "Modifying the source code, forking the repository and making changes, or linking Documenso libraries into your application in a way that creates a combined work. Configuration changes and using Documenso through its API are not modifications."

> "**No modifications**: Both licenses work. Community Edition is free and sufficient if you run Documenso as-is."

> "Do signed documents fall under the license?" — "No. The license applies to the software, not content created with the software. Documents you sign are your property and are not subject to AGPL-3.0."

From [Enterprise Edition](https://docs.documenso.com/docs/policies/enterprise-edition):

> "If you run Documenso without modifications, or your modifications are open source under AGPL-3.0, the Community Edition is sufficient."

> Common use cases: "SaaS product using Documenso API only | Community Edition"; "SaaS product with modified Documenso code | Enterprise Edition".

> "Features in the `packages/ee/` directory require an active Business or Enterprise license." (list: [`packages/ee/FEATURES`](https://github.com/documenso/documenso/blob/main/packages/ee/FEATURES))

Our setup matches the "API only" row:

- We run the upstream image unchanged.
- We change only environment variables and settings in the admin panel and team settings. These count as configuration.
- We call Documenso over HTTP.

The npm packages we might add later (`@documenso/embed-*` and `@documenso/sdk-typescript`) are MIT-licensed, not AGPL.

## Consequences

**We get:**

- E-signing with sealed PDFs, a certificate and an audit trail, at infrastructure cost only.
- Signer data stays on infrastructure we control.
- Geiger Docs stays proprietary.

**We take on:**

- **Running the Documenso instance.** This covers backups of its Postgres, the certificate file and `.env`, plus pinned-tag upgrades. Follow the runbook in `deploy/documenso/README.md`.
- **Yearly renewal of the signing certificate.** A self-signed certificate is not on Adobe's trust list. Signed PDFs show as "unverified", although they remain tamper-evident.
- **An extra failure point in the send flow.** If Documenso is down or not configured, sending fails with `503` or `502` and the request is marked `failed`, which unlocks the document. Webhooks can arrive late or more than once, so we store an idempotency log and add a manual "Refresh status" sync.
- **Signing email that uses Documenso's templates, not the suite's look.** It is still sent from our domain.
- **Its own database.** Documenso uses a dedicated Postgres, not the suite's shared Supabase database: its Prisma migrations take over the `public` schema, which the suite reserves for cross-product tables.

**We must never:**

- Modify Documenso's source, patch or rebuild the image, run a fork, or mount files over its application code, unless we publish the complete modified source under AGPL-3.0 to everyone who uses it. The alternative is buying a commercial license first. In practice: **do not modify it.**
- Import or bundle Documenso's AGPL packages into Geiger Docs, for example `@documenso/lib`, `@documenso/prisma` or `@documenso/ui`. This would be linking that creates a combined work. Use the HTTP API, or the MIT-licensed SDK and embed packages.
- Enable Enterprise features without a license, even when they are reachable. That covers:
  - embed authoring and its white-label option;
  - the SSO or authentication portal;
  - custom email domains;
  - the 21 CFR and HIPAA flags;
  - passkey or 2FA action re-authentication, so the API's `actionAuth` must never be set to `PASSKEY` or `TWO_FACTOR_AUTH`;
  - CSC/QES signing.
- Remove Documenso's copyright or license notices. Built-in branding settings are configuration and are allowed.
- Send `DOCUMENSO_API_TOKEN` to the browser, or store signer tokens or signing URLs.

## Revisit when

- We want **field placement or document editing inside Geiger Docs** through embedded authoring, especially white-labelled. That needs a Business or Enterprise license, or Cloud Platform with the add-on.
- We need **SSO** into Documenso, **custom per-organisation sender domains**, **passkey or 2FA signer re-authentication**, **21 CFR Part 11**, **HIPAA** or **QES/CSC** signatures.
- Signers or customers need an **Adobe-trusted (AATL) certificate**. That means a CA-issued certificate, or the Enterprise edition, which includes an AATL certificate.
- We find we **must change Documenso's code**, for example a bug fix we cannot wait for or a deep UI change. Then upstream the change or buy a license first.
- Running the instance (uptime, upgrades, incidents) **costs more than a Cloud Teams or Platform subscription**.
- **Volume grows** past what the default `local` job queue handles comfortably. Then move to BullMQ with Redis, or to Inngest.
- Documenso **changes its licensing, its Community Edition feature set, or the v2 API**. Watch the 2027-03-01 deprecation and the release notes on every upgrade.
- We decide signing email must look like the rest of the suite. Then switch to `distributionMethod: "NONE"` and suite email.
