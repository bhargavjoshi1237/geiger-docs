# Documenso on Render (temporary instance): runbook

A Render Blueprint that runs the official, unmodified `documenso/documenso:v2.21.1` image with its own Render Postgres. A small boot script wraps the image; it only sets env and a signing certificate, then hands over to the image's own entrypoint and start command. Migrations and startup behave exactly as upstream. For general Documenso operations, see [`../README.md`](../README.md). The licensing rules are in `docs/decisions/2026-11-08-signing-with-documenso.md`.

| File | Purpose |
|---|---|
| `render.yaml` | Blueprint: the Docker web service, Postgres, generated secrets and fixed config |
| `Dockerfile` | `FROM documenso/documenso:v2.21.1`, adds the boot script, keeps upstream's user, entrypoint and CMD |
| `entrypoint.sh` | Runs on every boot: maps Render's env, provisions the certificate, promotes the admin, logs the setup values |

⚠ marks things I could not verify without deploying. The script itself was tested locally under `dash`, against Documenso's real Prisma schema. Neither the image build nor a Render deploy has been run.

## What the boot script does and doesn't do

| Automated on every boot | Still manual, and why |
|---|---|
| `DATABASE_URL` → `NEXT_PRIVATE_DATABASE_URL` and `NEXT_PRIVATE_DIRECT_DATABASE_URL`. Adds `sslmode=require` only for external `*.render.com` hosts. | Pinning the certificate. Render's disk is wiped on each deploy, so you paste the logged base64 into the env once. |
| `RENDER_EXTERNAL_URL` → `NEXT_PUBLIC_WEBAPP_URL`; `NEXT_PRIVATE_INTERNAL_WEBAPP_URL` = `http://localhost:$PORT` | Creating the first account. Open signup would let anyone claim the instance, so you switch it on yourself for one deploy. |
| A self-signed certificate (RSA 2048, 10 years, CN = hostname) when none is pinned, logged as base64 | Organisation, team, API token, webhook and the audit-log preference. These exist only in Documenso's UI, and the token is shown once. |
| Fallback secrets if the Blueprint's are missing, logged with a warning | Putting the three values into Geiger Docs' `.env` and Vercel |
| Promotes `DOCUMENSO_ADMIN_EMAIL` to admin once it exists and is verified (idempotent; never blocks boot) | |
| A "GEIGER DOCS SETUP" banner: public URL, webhook URL, events, secret, remaining steps | |

The script never logs the database URL or the Resend key.

## Plans and cost

| Resource | Plan | RAM | Price |
|---|---|---|---|
| Web service `geiger-documenso` | `1c-2g` | 2 GB, 1 CPU | $25/mo |
| Postgres `geiger-documenso-db` | `0.1c-256mb`, 5 GB disk | 256 MB | $6/mo + $1.50 storage |

Why these plans:

- **Web service.** Documenso documents 1 GB RAM as its minimum and 2 GB as recommended. Both 512 MB plans (`free` and `0.5c-512mb`) are below that, so `1c-2g` is the smallest plan that fits. `NODE_OPTIONS=--max-old-space-size=1536` is sized for it.
- **Postgres.** Free Postgres expires after 30 days, so the database uses the cheapest paid plan instead. See [Free tier](#free-tier).

## 1. Deploy the Blueprint

1. Commit and push `deploy/documenso/render/` to the branch Render will track. It is currently uncommitted on `feat/harden-and-signing`.
2. In the Render Dashboard, go to **New > Blueprint**, connect the repo and pick the branch.
3. Set **Blueprint Path** to `deploy/documenso/render/render.yaml`.
   - Render looks for `render.yaml` at the repo root by default, but this field accepts any path.
4. Fill in the prompted values:

   | Key | Value |
   |---|---|
   | `NEXT_PRIVATE_RESEND_API_KEY` | A dedicated Resend key with sending access to `geiger.studio`. **Required**: boot stops with `[geiger] FATAL` without it. |
   | `DOCUMENSO_ADMIN_EMAIL` | Your operator address, e.g. `ops@geiger.studio` |
   | `GEIGER_DOCS_WEBHOOK_URL` | The exact final URL, e.g. `https://geiger.studio/docs/api/signing/webhook`. Documenso doesn't follow redirects. Optional: it is only printed in the banner. |
   | `NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS` | Leave empty on the first deploy. ⚠ Upstream's own Blueprint leaves many of these prompts blank, but I haven't confirmed that the form accepts an empty value. |

5. Click **Deploy Blueprint**.

Render generates `NEXTAUTH_SECRET`, both encryption keys, the signing passphrase and the webhook secret, and keeps them across deploys. Leave **Docker Command** empty. ⚠ How Render applies that override to an image with an `ENTRYPOINT` is unverified.

## 2. First boot: read the logs

Open the service's **Logs** and search for `GEIGER DOCS`. You will see:

- **PIN THE SIGNING CERTIFICATE.** This shows the `NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS=…` line, which is about 3,700 characters, and the fingerprint.
- **GEIGER DOCS SETUP.** This shows the public URL, the webhook URL, the events, the secret and the Geiger Docs env lines.
- A **SECRETS GENERATED** block appears only if the Blueprint's secrets are missing. If you see it, add those values in Environment straight away. The encryption keys must never change once Documenso holds data.
- A `[geiger] accounts:` line appears once the server is healthy, saying no account exists yet.

To pin the certificate:

1. In **Environment**, set `NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS` to the long value after the `=`.
2. Click **Save and deploy**.
3. The next boot logs `Signing certificate (pinned)` with the same fingerprint, and the pin block disappears.

Notes:

- You can do this in the same save as step 3.1 below, to save a deploy.
- ⚠ I couldn't confirm that Render's log viewer shows a 3,700-character line in one piece. If it is cut off, open **Shell** (paid plans only) and run `openssl base64 -A -in /opt/documenso/cert.p12`. It prints the same certificate, as long as that boot hasn't been replaced.
- Until the certificate is pinned and the logs age out, anyone with log access can copy the key. Logs are kept for 7 days on the Hobby workspace.

## 3. First account and admin

1. In **Environment**, set `DOCUMENSO_ALLOW_SIGNUP=true` (and `DOCUMENSO_ADMIN_EMAIL` if you skipped it), then **Save and deploy**.
2. Open `<public URL>/signup` and sign up with the admin email. Name the account **Geiger Docs**, because signing emails show this name.
3. Click the verification link. This also proves Resend works.
4. Set `DOCUMENSO_ALLOW_SIGNUP=false`, then **Save and deploy**.
5. The log shows `[geiger] admin: promoted … to ADMIN.`

The script only promotes a verified account, so someone who registers your address can't take the admin role. If no email arrives, fix Resend first. See the troubleshooting table in [`../README.md`](../README.md).

## 4. Team, API token and webhook (in Documenso)

Follow the banner's "Remaining manual steps". The details are in [`../README.md`](../README.md) §5–8.

1. Create the organisation **Geiger**, then the team **Geiger Docs**.
2. Team settings > **API Tokens**: create a token and copy it (it is shown once).
3. Team settings > **Webhooks**: create a webhook with the banner's URL, the 8 events and the secret.
4. Team settings > **Preferences > Document**: set **Include the Audit Logs** to Yes.

## 5. Geiger Docs env

Copy the banner's three lines into the local `.env` and into Vercel (Production, plus Preview if you test there). Then redeploy Geiger Docs.

```bash
DOCUMENSO_URL=https://<service>.onrender.com     # no trailing /api/v2
DOCUMENSO_API_TOKEN=<token from step 4.2>
DOCUMENSO_WEBHOOK_SECRET=<secret from the banner>
```

Smoke test:

```bash
curl -s "$DOCUMENSO_URL/api/v2/envelope?perPage=1" -H "Authorization: $DOCUMENSO_API_TOKEN"
```

Then click **Test** on the webhook in Documenso and expect `200`.

If you add a custom domain on Render, set `NEXT_PUBLIC_WEBAPP_URL` to it (the script never overrides an explicit value) and update `DOCUMENSO_URL`.

## Plain web service (no Blueprint)

The Blueprint can't create free-plan services, so for a free or quick setup create the pieces by hand:

1. **Postgres:** New → Postgres, in the same region as the web service. Copy its **Internal Database URL**.
2. **Web service:** New → Web Service from this repo, runtime **Docker**, Dockerfile path `deploy/documenso/render/Dockerfile`. Leave the Docker build context at the repo root (the default) and the Docker Command empty.
3. **Environment:** Add from .env with the same variables the Blueprint sets (see `render.yaml`): `DATABASE_URL` (step 1), the Resend key and sender, stable values for `NEXTAUTH_SECRET`, both encryption keys, `NEXT_PRIVATE_SIGNING_PASSPHRASE` and `DOCUMENSO_WEBHOOK_SECRET`, plus `NODE_OPTIONS=--max-old-space-size=384` on 512 MB. Generate the secrets once and keep them; the encryption keys can never change after Documenso holds data.
4. Continue from **2. First boot** below.

## Free tier

The Blueprint avoids the free tier. If you switch to it anyway, change both `plan:` values to `free`, remove `diskSizeGB`, and set `NODE_OPTIONS=--max-old-space-size=384`. Then expect the following:

- **Too little memory.** 512 MB RAM and 0.1 CPU is below Documenso's documented 1 GB minimum. ⚠ Untested, and it may run out of memory while sealing PDFs.
- **Spin-down.** The service spins down after 15 minutes without traffic and takes about a minute to spin up (⚠ likely longer for Documenso).
  - Geiger Docs' Documenso client aborts after 30 seconds (`REQUEST_TIMEOUT_MS` in `lib/server/documenso.js`). So the first send after an idle period can fail and mark the request `failed`, which unlocks the document; retrying works.
  - Signers who open a link see Render's loading page meanwhile.
  - If that matters, stay on `1c-2g`.
- **Free Postgres expires.**
  - It expires 30 days after creation. Render deletes it, with all its data, after a further 14 days unless you upgrade it.
  - It is capped at 1 GB, has no backups, and you can have only one per workspace.
- **No Shell, and limited hours.** Free services have no Shell. Each workspace gets 750 free instance hours per month, and free services are suspended once they are used up.

## Moving off Render later

1. **Finish or cancel pending signing requests.** Their signing links point at the `onrender.com` URL.
2. **Dump the database.**
   1. Add your IP to the database's inbound rules (Dashboard > database > Networking; the Blueprint blocks all external IPs).
   2. Run `pg_dump "<External Database URL>" > documenso.sql`.
3. **Save the env values.**
   - `NEXTAUTH_SECRET`
   - `NEXT_PRIVATE_ENCRYPTION_KEY` and `NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY`. These are mandatory: the dump is unreadable without them.
   - `NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS` and `NEXT_PRIVATE_SIGNING_PASSPHRASE`
   - `DOCUMENSO_WEBHOOK_SECRET`
4. **Set up the new host** with [`../compose.yml`](../compose.yml) and the same image tag:
   1. Copy those values into `.env`.
   2. Write the certificate to `/opt/documenso/cert.p12` with `base64 -d`.
   3. Start only the database, restore the dump with `docker compose exec -T database psql -U documenso documenso < documenso.sql`, then start Documenso.
5. **Point Geiger Docs at the new host.** Accounts, the team, the API token and the webhook live in the database, so they carry over. Update `DOCUMENSO_URL` in Geiger Docs.
6. **Delete the Blueprint's resources** in Render.

## Troubleshooting

| Log line or symptom | Fix |
|---|---|
| `[geiger] FATAL: NEXT_PRIVATE_SMTP_TRANSPORT=resend but NEXT_PRIVATE_RESEND_API_KEY is empty` | Set the key, then **Save and deploy**. |
| `[geiger] FATAL: No database` | `DATABASE_URL` is missing. Re-sync the Blueprint, or set it from the database's Internal URL. |
| The fingerprint changes on every deploy | The certificate isn't pinned, or the passphrase changed. Pin both as in step 2. |
| `OpenSSL could not open the signing certificate` | The passphrase doesn't match the pinned `.p12`. Check `<public URL>/api/certificate-status`. |
| `[geiger] accounts: check failed, nothing changed` | The database wasn't reachable for the check. Harmless; the next boot retries. |
| `admin: … has not verified its email yet` | Click the verification link, then **Manual Deploy** or restart. |
| First deploy stays unhealthy for minutes | The first boot runs all migrations. Render waits up to 15 minutes for `/api/health`. |
