# Documenso for Geiger Docs: runbook

This runbook covers the self-hosted Documenso instance that Geiger Docs uses for e-signing. The reasoning behind it is in `docs/decisions/2026-11-08-signing-with-documenso.md`.

**Run the official image as it ships.** No forks, no patches, and no files mounted over the app code. Everything here is configuration.

For a temporary, self-configuring instance on Render (Blueprint, no host to manage), use [`render/README.md`](render/README.md) instead of steps 0–4.

| | |
|---|---|
| Image | `documenso/documenso:v2.21.1` (pinned in `compose.yml`) + `postgres:15` |
| Public URL | `https://sign.geiger.studio` (example) = `NEXT_PUBLIC_WEBAPP_URL` = Geiger Docs `DOCUMENSO_URL` |
| Geiger Docs env it produces | `DOCUMENSO_URL`, `DOCUMENSO_API_TOKEN`, `DOCUMENSO_WEBHOOK_SECRET` |

⚠ marks steps I could not verify end to end. Nothing in this kit has been run yet.

## 0. Prerequisites

- **Host:** a Linux host with Docker 20.10+, Docker Compose v2 and at least 1 GB RAM.
- **DNS:** `sign.geiger.studio` points at the host.
- **TLS:** a reverse proxy (Caddy, nginx or Traefik) forwards `https://sign.geiger.studio` to `127.0.0.1:3000`. Compose binds to localhost only.
- **Email:** `geiger.studio` must be verified in the suite's Resend account. It already is for dash, which sends as `noreply@geiger.studio`.
  - Create a **separate Resend API key** with sending access for Documenso. Don't reuse dash's key.

## 1. Configure

```bash
cd deploy/documenso
cp .env.example .env
openssl rand -base64 32   # run three times: NEXTAUTH_SECRET, NEXT_PRIVATE_ENCRYPTION_KEY, NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY
openssl rand -hex 24      # POSTGRES_PASSWORD; also replace CHANGE_ME in NEXT_PRIVATE_DATABASE_URL with it
```

Then fill in the rest of `.env`:

- `NEXT_PUBLIC_WEBAPP_URL`
- `NEXT_PRIVATE_RESEND_API_KEY`
- the From address: `signing@geiger.studio`, or any address on the verified domain

**Rules for `.env`:**

- Never commit `.env`.
- Never change the two encryption keys after the first boot.

## 2. Signing certificate

The commands below follow Documenso's "Local Certificate" guide. The `.p12` file **must have a passphrase**. Without one, signing fails with `Failed to get private key bags`.

```bash
sudo mkdir -p /opt/documenso && cd /opt/documenso
sudo openssl genrsa -out private.key 2048
sudo openssl req -new -x509 -key private.key -out certificate.crt -days 365 \
  -subj "/CN=Geiger Docs Signing/O=Geiger"
read -s -p "Certificate passphrase: " CERT_PASS; export CERT_PASS; echo
sudo -E openssl pkcs12 -export -out cert.p12 -inkey private.key -in certificate.crt -password env:CERT_PASS
sudo -E openssl pkcs12 -in cert.p12 -noout -password env:CERT_PASS   # must succeed
sudo chown 1001:1001 cert.p12 && sudo chmod 400 cert.p12             # container runs as uid 1001
sudo shred -u private.key                                            # the key now lives only inside cert.p12
```

Then:

1. Put the same passphrase in `.env` as `NEXT_PRIVATE_SIGNING_PASSPHRASE`.
2. Keep `cert.p12` and its passphrase in the password manager.
3. Set a reminder to renew the certificate before it expires, 365 days from now.

Notes:

- Self-signed certificates show as "unverified" in Adobe Reader. The signed PDFs are still sealed and tamper-evident.
- Setting `NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY` adds trusted timestamps.
- OpenSSL 3's default `.p12` (AES/PBKDF2) works: Documenso v2.21.1's signer (`@libpdf/core` `P12Signer`) was verified to load and sign with it, so `-legacy` isn't needed.

## 3. First boot and health checks

Signup is disabled in `.env`. **Enable it for this one boot only**, so you can create the operator account:

```bash
cd deploy/documenso
NEXT_PUBLIC_DISABLE_SIGNUP=false docker compose up -d   # a shell variable overrides .env
docker compose logs -f documenso                        # wait for "Running database migrations" then "Starting Documenso server"
docker compose ps                                       # documenso should become "healthy" (start period 90s)
curl -s http://127.0.0.1:3000/api/health                # {"status":"ok",...}
curl -s http://127.0.0.1:3000/api/certificate-status    # certificate configured and usable
```

How to read the results:

- **Healthy** means `/api/health` returned `status: "ok"`, so the database is reachable and the certificate is usable.
- **`warning`** means the app is running but the certificate is not usable.
- **`error`** (HTTP 500) means the database is unreachable or the configuration is broken.

## 4. Operator account and first admin

1. Open `https://sign.geiger.studio/signup` and create the operator account.
   - Use a shared mailbox, for example `ops@geiger.studio`.
   - Name it **"Geiger Docs"**. ⚠ Documents created with the API token are owned by this user, so its name probably appears in signing emails.
   - Verify the email. This also confirms that Resend delivery works.
2. Promote it to admin:

   ```bash
   docker compose exec database psql -U documenso -d documenso \
     -c "UPDATE \"User\" SET roles = '{USER,ADMIN}' WHERE email = 'ops@geiger.studio';"
   ```

   Use your `POSTGRES_USER` and `POSTGRES_DB` if you changed them.
3. Turn signup back off:

   ```bash
   docker compose up -d
   ```

   Compose recreates the container with `NEXT_PUBLIC_DISABLE_SIGNUP=true` from `.env`.
4. Check that `/signup` no longer allows new accounts.
5. Create further operator accounts from the **Admin Panel** (`/admin`). ⚠ I haven't checked the exact UI path.

## 5. Organisation and team

Webhooks are configured per **team**, and the docs say personal accounts can't use them. So create a real organisation and team rather than using the personal one:

1. Create an organisation named **Geiger** from the organisation section.
2. On the organisation page, click **Create team**. Name it **Geiger Docs**, with URL `geiger-docs`.

## 6. Team API token → `DOCUMENSO_API_TOKEN`

1. Go to Team settings → **API Tokens** (`/t/geiger-docs/settings/tokens`) → **Create Token**.
   - Name it `geiger-docs-<env>`.
   - Choose an expiry of 12 months, and set a reminder to rotate it.
2. Copy the token immediately. It is shown only once.
3. In Geiger Docs' environment (server-only), set:

   ```bash
   DOCUMENSO_URL=https://sign.geiger.studio      # no trailing /api/v2
   DOCUMENSO_API_TOKEN=api_xxxxxxxxxxxxxxxx
   ```

4. Smoke test. It should return JSON with `"data": []` on a new team:

   ```bash
   curl -s "https://sign.geiger.studio/api/v2/envelope?perPage=1" -H "Authorization: api_xxxxxxxxxxxxxxxx"
   ```

The token has full access to this team. Never expose it to the browser.

## 7. Team webhook → `DOCUMENSO_WEBHOOK_SECRET`

1. Generate a secret: `openssl rand -hex 32`.
2. Go to Team settings → **Webhooks** → **Create Webhook**:
   - **URL:** Geiger Docs' public origin plus its base path, then `/api/signing/webhook`, for example `https://geiger.studio/docs/api/signing/webhook`.
     - Use the exact final URL. Documenso does not follow redirects, so any 3xx counts as a failure.
   - **Events:** `DOCUMENT_SENT`, `DOCUMENT_OPENED`, `DOCUMENT_SIGNED`, `DOCUMENT_RECIPIENT_COMPLETED`, `DOCUMENT_COMPLETED`, `DOCUMENT_REJECTED`, `DOCUMENT_CANCELLED`, `RECIPIENT_EXPIRED`.
   - **Secret:** the value you generated. Documenso sends it as plain text in the `X-Documenso-Secret` header.
3. In Geiger Docs, set `DOCUMENSO_WEBHOOK_SECRET` to the same value.
4. Once Geiger Docs is deployed with Step 3, open the webhook and click **Test**.
   - Expect `200`.
   - `401` means the two secrets differ.
   - Delivery logs and a **Resend** button are on the webhook's detail page.

Limits:

- The endpoint must answer with a 2xx status within 10 seconds.
- With the default `local` job provider, a failed delivery gets 4 attempts with no backoff.

## 8. Team document preferences

Go to Team settings → Preferences → **Document**. You can set these on the organisation instead and let the team inherit them.

- **Include the Signing Certificate:** **Yes**. This is the default.
- **Include the Audit Logs:** **Yes**. The default is No.

These settings control what is embedded in the signed PDF. Geiger Docs also downloads the certificate and audit log as separate files, so both copies are kept either way.

## 9. Private networks (SSRF bypass)

Documenso refuses to deliver webhooks to private or loopback addresses. If Geiger Docs is reachable from Documenso only on a private network, list the target hosts and recreate the container:

```bash
# .env
NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=docs-app,10.0.0.5
```

Then run `docker compose up -d`.

Examples of a private network: the same Docker network, a LAN, or a VPN such as Tailscale. Leave the variable empty when Geiger Docs has a public URL, for example on Vercel.

## 10. Upgrading

1. Read the release notes from your current version up to the target version: https://github.com/documenso/documenso/releases. Major versions can need manual steps.
2. Back up:

   ```bash
   docker compose exec database pg_dump -U documenso documenso > backup-$(date +%Y%m%d-%H%M%S).sql
   cp .env .env.backup-$(date +%Y%m%d)
   ```

3. Change the image tag in `compose.yml`, for example `v2.21.1` → `v2.22.0`. This is the only change; never use `latest`.
4. Pull and restart:

   ```bash
   docker compose pull documenso && docker compose up -d
   ```

   Migrations run automatically on start.
5. Check:
   - `docker compose ps` shows the container as healthy.
   - The API smoke test from step 6 passes.
   - Run a test signature end to end.
6. Rollback: migrations are not reversible. Restore the database dump, then go back to the previous tag.

Keep regular backups of three things: the database dump, `cert.p12` with its passphrase, and `.env`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Signing fails with `Failed to get private key bags` | `cert.p12` has no passphrase. Re-export it with one (step 2) and set `NEXT_PRIVATE_SIGNING_PASSPHRASE`. |
| `mac verify failure` / invalid password | The passphrase doesn't match the file, or has trailing whitespace. Test with `openssl pkcs12 -in cert.p12 -noout`. |
| `/api/health` returns `warning`, or `No certificate found for local signing` | The file isn't mounted at `/opt/documenso/cert.p12`. Check `DOCUMENSO_CERT_FILE`, that the file exists on the host, and that it isn't a directory. If Docker created a directory because the file was missing, delete it and add the file. |
| `Permission denied` reading the certificate | `sudo chown 1001:1001 cert.p12 && sudo chmod 400 cert.p12`. |
| `docker compose up` fails with `required variable … is missing a value` | Fill in that variable in `.env`. |
| Container exits with `Resend transport requires NEXT_PRIVATE_RESEND_API_KEY` | Set the Resend key. |
| Container unhealthy right after starting | Migrations are still running. Wait for the 90-second start period and check `docker compose logs documenso`. |
| Emails not arriving | Check the Resend dashboard logs. The From address must be on the verified `geiger.studio` domain, and the key must have sending access. |
| Can't verify the first account because no email arrives | Fix Resend first. As a stopgap, run `UPDATE "User" SET "emailVerified" = now() WHERE email = '…';` |
| `/signup` is blocked | Expected. Use the one-time override in step 3, or create users from the Admin Panel. |
| Emails or webhooks never fire, and background jobs pile up | With the `local` provider, Documenso calls itself at `NEXT_PRIVATE_INTERNAL_WEBAPP_URL`. Keep it at `http://localhost:3000`. |
| Webhook calls fail with a private or blocked address | Add the host to `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS` (step 9). |
| Webhook log shows `401` | `DOCUMENSO_WEBHOOK_SECRET` in Geiger Docs doesn't match the webhook's secret. |
| Webhook log shows `3xx` | The URL redirects (http→https, base path, trailing slash). Use the exact final URL. |
| Geiger Docs gets `401` from the API | The token was revoked or expired, or belongs to another team. Create a new one (step 6). |
| Geiger Docs gets `429` | The limit is 1000 requests per minute per IP. Honour `Retry-After`. |
| Adobe Reader says the signature is unverified | Expected with a self-signed certificate. The document is still sealed. See the decision record's "Revisit when" section. |
