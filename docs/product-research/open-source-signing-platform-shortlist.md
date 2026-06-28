# Open-Source Signing Platform Shortlist

Research date: 2026-06-07

## Goal

Choose which open-source document signing project we should use as the foundation for our own themed, extended product. The target is not just "works like DocuSign"; the project needs to be practical to rebrand, extend, operate, and price as our own app.

Important: most serious projects in this space are AGPL-licensed. If we fork, modify, and offer the app over the network, we should assume source-code disclosure obligations apply unless we buy a commercial license or get legal review that says otherwise.

## Short Answer

Recommended order:

1. Documenso
2. DocuSeal
3. OpenSign

Documenso is the strongest first candidate because it is closest to our preferred product direction: modern React/TypeScript stack, self-hosting, document signing, templates, API/integrations, PDF tooling, and a roadmap aimed at becoming open trust infrastructure. It should be the first project we attempt to run and theme.

DocuSeal is probably the most immediately polished and mature operational tool, but it is Ruby/Rails plus Vue, and several features we would want for a branded commercial product are listed as Pro features. It is still very useful as a benchmark, and possibly as a backend service if we accept its licensing and commercial boundaries.

OpenSign is attractive because it is JavaScript/React/Node/MongoDB and appears to include the core signing flows. It should be tested, but not picked until we inspect code quality, release velocity, PDF signing details, and how cleanly it supports our own branding and product UX.

## Decision Matrix

| Project | Best use for us | Stack fit | Feature fit | White-label/theme fit | Main risk | Initial decision |
| --- | --- | --- | --- | --- | --- | --- |
| Documenso | Primary fork or core signing engine | Strong: TypeScript, React, Prisma, Tailwind/shadcn, tRPC, Postgres | Strong: core signing, templates, self-hosting, API, PDF signing stack | Good, but AGPL/commercial boundary must be respected | AGPL obligations; some enterprise features require license key | Prototype first |
| DocuSeal | Mature reference app or service layer | Medium/low for us: Ruby on Rails, Vue, Turbo, Tailwind | Very strong: WYSIWYG builder, 12 fields, multiple submitters, SMTP, storage, verification, API/webhooks | Complicated: logo/white-label listed as Pro, AGPL plus additional terms | Rebrand may require commercial/pro path; stack mismatch | Benchmark and evaluate second |
| OpenSign | JS alternative worth testing | Strong-ish: JavaScript, React, Node, MongoDB | Good: PDF e-signing, annotations, templates, sign yourself, multi-signer, signing links/order | Unknown until local inspection | Product/code maturity and PDF verification depth need validation | Prototype if Documenso blocks |
| FreeSign | Watch-list fork of Documenso | Strong: Documenso-derived TypeScript stack | Similar core, positioned around free occasional signing | Good idea, but not enough adoption yet | Very young fork; GitHub showed 0 stars/forks at research time | Watch only |
| LibreSign | Nextcloud-based signing module | Low unless we build on Nextcloud | Useful for governed Nextcloud signing flows | Not a standalone SaaS foundation | Nextcloud dependency; smaller ecosystem | Not a base app |
| SignServer | Cryptographic signing/timestamp infrastructure | Service component, not app foundation | Good for server-side signing, timestamping, keys | Not relevant to UI/theme | Not document workflow/product UI | Possible future signing backend |
| Supersign | Watch-list only | Unknown; GitHub link failed during research | Site claims PKI/TSA/audit/API/branding | Claims strong white-label features | Could not verify repository from linked GitHub URL | Do not pick yet |

## Candidate Notes

### Documenso

Why it fits:

- Open-source DocuSign alternative with self-hosting as a core promise.
- Community Edition is AGPL-3.0 and includes core document signing functionality.
- The docs explicitly say AGPL network use has source availability obligations.
- Strong product-development stack for us: TypeScript, React/React Router, Prisma, Tailwind, shadcn/ui, react-email, tRPC, React-PDF, PDF-Lib, Stripe, Postgres.
- Self-hosting supports Docker/Docker Compose and requires SMTP, storage, database, and a signing certificate.
- The platform exposes user, developer/API, and self-hosting documentation, which is useful for building a real product around it.

What we would wrap/change:

- Replace brand, landing, dashboard shell, emails, and signer experience with our design system.
- Add our pricing model, plan limits, team/admin UX, and onboarding.
- Add product differentiators from our prior feature list: clean unlimited/high-send plans, AI field detection/summaries, public signing links, approvals, payments, and document repository UX.
- Keep signing/audit/PDF code as close to upstream as possible at first so we do not accidentally break trust-critical logic.

Concerns:

- AGPL means a proprietary closed-source SaaS wrapper is not a safe assumption.
- Some enterprise features, such as SSO, embed editor white label, and 21 CFR Part 11, are called out as Enterprise Edition/license-key features in the self-hosting docs.
- We need a local code review before committing to a fork because theme changes may be easy, but product-level flow changes could be deeper.

Verdict: Best first bet.

### DocuSeal

Why it fits:

- Very mature open-source document filling/signing app with a strong GitHub footprint.
- Includes WYSIWYG PDF form builder, 12 field types, multiple submitters, automated SMTP emails, disk/S3/Google/Azure storage, automatic PDF eSignature, PDF signature verification, user management, mobile optimization, multiple languages, API, and webhooks.
- Easy deployment path, including a simple Docker command and database options: SQLite by default, PostgreSQL or MySQL via `DATABASE_URL`.

What we would wrap/change:

- Use as a benchmark for PDF form builder quality and signer UX.
- Potentially use as an internal service if we do not need to deeply restyle the main UI.
- Study its field placement, signer flow, PDF verification, storage, and embedded form concepts.

Concerns:

- Stack mismatch with our current Next/React direction: Ruby on Rails, Vue, Hotwire/Turbo.
- The README lists company logo/white-label, user roles, reminders, SMS verification, conditional fields/formulas, bulk send, SSO/SAML, and embedded builder/signing as Pro features.
- License is AGPLv3 with Section 7(b) Additional Terms, so branding/attribution/legal boundaries need careful review before any "our own clothes" strategy.

Verdict: Excellent reference and possible service, but not the easiest own-product fork.

### OpenSign

Why it fits:

- Free/open-source DocuSign alternative with JavaScript/React/Node/MongoDB topics.
- Features listed include secure PDF e-signing, document annotation, sign yourself, templates, one-click signatures, drive/document area, multi-signer support, signing links, and sequential signing.
- AGPL-3 license.

What we would wrap/change:

- Try it locally as a JS-first alternative to Documenso.
- Inspect how it handles PDF signing, audit trails, signer identity, template data, email delivery, and storage.
- Compare theme flexibility against Documenso.

Concerns:

- Need deeper code inspection before trusting it for a product foundation.
- We need to verify whether PDF outputs are cryptographically signed/verified in the way buyers expect, not just visually signed.
- MongoDB may or may not fit our desired data model depending on where the rest of the product goes.

Verdict: Worth a prototype, but behind Documenso.

## Other Projects Worth Knowing

### FreeSign

FreeSign is a fork of Documenso under AGPL-3.0. Its positioning is interesting: free/open-source e-signatures for occasional signers without subscriptions. At research time, its GitHub repo appeared extremely new with 0 stars/forks, so it should not replace Documenso as our base. It may still be useful for messaging inspiration.

### LibreSign

LibreSign is an AGPL-3.0 Nextcloud app for controlled PDF signing flows. It supports signing order, internal/external signers, request tracking, notifications/reminders, traceable records, certificate validation, Nextcloud file integration, and APIs. It is useful if we ever build inside a Nextcloud ecosystem, but not ideal as the foundation for a standalone SaaS.

### SignServer

SignServer is an LGPL v2.1 open-source signing platform for server-side signing, timestamping, code signing, and document signing. It is not a DocuSign-style product UI. It may be useful later if we need stronger cryptographic signing, timestamping, or key-management infrastructure behind our app.

### Supersign

Supersign's public site claims AGPL-3.0, PKI security, RFC 3161 timestamps, immutable audit trails, API/webhooks, custom branding, S3-compatible storage, and no envelope limits. However, the linked GitHub target failed during research, so it should be kept on a watch list only until the repository can be verified.

## Recommended Build Strategy

### Phase 1: Local Prototype

Run Documenso locally and evaluate:

- Can we replace logo, colors, app shell, dashboard navigation, signer page, email templates, and domain copy without fighting the codebase?
- Can we keep upstream signing/PDF/audit behavior mostly intact?
- Does the API support our desired embedding and integration flows?
- How much of our planned Professional and Business tier can ship from existing code?

### Phase 2: Compliance and Licensing Check

Before branding it as our product:

- Confirm whether we are willing to release our fork source under AGPL.
- If not, ask Documenso for commercial licensing terms or build an integration that does not create a derivative work.
- Confirm attribution requirements and trademark/brand-removal rules.
- Decide whether our hosted product will expose source links and modification notices.

### Phase 3: Product Differentiators

After the base is running:

- Re-theme the app and emails.
- Add our plan model and usage limits.
- Add document repository improvements: folders, tags, search, metadata, saved parties, and status views.
- Add public signing links/forms.
- Add AI-assisted field placement and document summaries.
- Add payments during signing.
- Add clear audit/certificate UX that non-technical users can understand.

## Final Recommendation

Start with Documenso as the serious base. It gives us the most aligned stack and the cleanest path to a modern product. Keep DocuSeal as the quality benchmark for form-building/signing UX. Test OpenSign only if Documenso's licensing, architecture, or enterprise-feature boundaries become a blocker.

## Sources

- Documenso GitHub: https://github.com/documenso/documenso
- Documenso Community Edition: https://docs.documenso.com/docs/policies/community-edition
- Documenso self-hosting: https://docs.documenso.com/docs/self-hosting
- DocuSeal GitHub: https://github.com/docusealco/docuseal
- OpenSign GitHub: https://github.com/OpenSignLabs/OpenSign
- FreeSign website: https://freesign.io/
- FreeSign GitHub: https://github.com/FreeSign-io/freesign
- LibreSign GitHub: https://github.com/LibreSign/libresign
- SignServer about: https://www.signserver.org/about/
- Supersign website: https://supersign.cc/
