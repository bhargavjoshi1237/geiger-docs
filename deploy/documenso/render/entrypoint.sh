#!/bin/sh
# Render boot wrapper for the unmodified documenso/documenso image (Geiger Docs signing service).
# It only sets env, a signing certificate and the first admin's role, logs what Geiger Docs needs, then execs the upstream entrypoint + CMD.
# Runbook: deploy/documenso/render/README.md. Decision: docs/decisions/2026-11-08-signing-with-documenso.md
set -eu

# Upstream image layout (documenso/documenso:v2.21.1)
APP_DIR=/app/apps/remix
PRISMA_SCHEMA=/app/packages/prisma/schema.prisma
UPSTREAM_ENTRYPOINT=docker-entrypoint.sh
DEFAULT_CERT_PATH=/opt/documenso/cert.p12

# Events Geiger Docs' webhook handler consumes
WEBHOOK_EVENTS="DOCUMENT_SENT, DOCUMENT_OPENED, DOCUMENT_SIGNED, DOCUMENT_RECIPIENT_COMPLETED, DOCUMENT_COMPLETED, DOCUMENT_REJECTED, DOCUMENT_CANCELLED, RECIPIENT_EXPIRED"

log() { printf '[geiger] %s\n' "$*"; }
warn() { printf '[geiger] WARNING: %s\n' "$*"; }
die() {
  printf '[geiger] FATAL: %s\n' "$*"
  exit 1
}
rule() { printf '%s\n' "=================================================================================="; }
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
is_true() {
  case "$(lower "${1:-}")" in
    true | 1 | yes | on) return 0 ;;
    *) return 1 ;;
  esac
}
# Host part of a URL (scheme, credentials, port and path stripped)
url_host() {
  _h=${1#*://}
  _h=${_h%%/*}
  _h=${_h##*@}
  printf '%s' "${_h%%:*}"
}
# Masks database URLs in text we echo (Prisma errors can include connection details)
redact() { sed -E 's#postgres(ql)?://[^[:space:]]*#<database-url>#g'; }

# ---------------------------------------------------------------------------------------------
# 1. Map Render's env to Documenso's (explicitly set Documenso vars always win)
# ---------------------------------------------------------------------------------------------

# Render routes traffic to $PORT (default 10000); Documenso's server reads PORT
export PORT="${PORT:-10000}"

if [ -n "${NEXT_PRIVATE_DATABASE_URL:-}" ]; then
  db_source=NEXT_PRIVATE_DATABASE_URL
else
  [ -n "${DATABASE_URL:-}" ] || die "No database. Set DATABASE_URL (the Blueprint wires it from Render Postgres) or NEXT_PRIVATE_DATABASE_URL."
  db_source=DATABASE_URL
  NEXT_PRIVATE_DATABASE_URL=$DATABASE_URL
  # Render rejects plaintext on its external Postgres hosts; internal hosts (no dots) are on the private network
  case "$(url_host "$NEXT_PRIVATE_DATABASE_URL")" in
    *.render.com)
      case "$NEXT_PRIVATE_DATABASE_URL" in
        *sslmode=*) ;;
        *\?*) NEXT_PRIVATE_DATABASE_URL="$NEXT_PRIVATE_DATABASE_URL&sslmode=require" ;;
        *) NEXT_PRIVATE_DATABASE_URL="$NEXT_PRIVATE_DATABASE_URL?sslmode=require" ;;
      esac
      ;;
  esac
fi
export NEXT_PRIVATE_DATABASE_URL
# No connection pooler, so the direct (migrations) URL is the same database
export NEXT_PRIVATE_DIRECT_DATABASE_URL="${NEXT_PRIVATE_DIRECT_DATABASE_URL:-$NEXT_PRIVATE_DATABASE_URL}"

if [ -z "${NEXT_PUBLIC_WEBAPP_URL:-}" ]; then
  if [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
    NEXT_PUBLIC_WEBAPP_URL=$RENDER_EXTERNAL_URL
  elif [ -n "${RENDER_EXTERNAL_HOSTNAME:-}" ]; then
    NEXT_PUBLIC_WEBAPP_URL="https://$RENDER_EXTERNAL_HOSTNAME"
  else
    NEXT_PUBLIC_WEBAPP_URL="http://localhost:$PORT"
    warn "RENDER_EXTERNAL_URL is not set, so NEXT_PUBLIC_WEBAPP_URL defaults to $NEXT_PUBLIC_WEBAPP_URL"
  fi
fi
export NEXT_PUBLIC_WEBAPP_URL="${NEXT_PUBLIC_WEBAPP_URL%/}"
# Background jobs (emails, webhooks) call the app itself; keep that inside the container
export NEXT_PRIVATE_INTERNAL_WEBAPP_URL="${NEXT_PRIVATE_INTERNAL_WEBAPP_URL:-http://localhost:$PORT}"

# Signup stays closed unless DOCUMENSO_ALLOW_SIGNUP=true (switch it on once to create the first account)
if is_true "${DOCUMENSO_ALLOW_SIGNUP:-}"; then
  export NEXT_PUBLIC_DISABLE_SIGNUP=false
else
  export NEXT_PUBLIC_DISABLE_SIGNUP="${NEXT_PUBLIC_DISABLE_SIGNUP:-true}"
fi
# Documenso treats only the exact string "true" as disabled
SIGNUP_OPEN=0
[ "$NEXT_PUBLIC_DISABLE_SIGNUP" = true ] || SIGNUP_OPEN=1

# Documenso throws at startup when Resend is selected without a key; say why before it crash-loops
if [ "${NEXT_PRIVATE_SMTP_TRANSPORT:-}" = resend ] && [ -z "${NEXT_PRIVATE_RESEND_API_KEY:-}" ]; then
  die "NEXT_PRIVATE_SMTP_TRANSPORT=resend but NEXT_PRIVATE_RESEND_API_KEY is empty. Set it in Render > Environment, then Save and deploy."
fi

log "Documenso at $NEXT_PUBLIC_WEBAPP_URL, port $PORT, database from $db_source"

# ---------------------------------------------------------------------------------------------
# 2. Required secrets (the Blueprint generates them; this is only a fallback)
# ---------------------------------------------------------------------------------------------

GENERATED_SECRETS=""
for name in NEXTAUTH_SECRET NEXT_PRIVATE_ENCRYPTION_KEY NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY; do
  eval "current=\${$name:-}"
  if [ -z "$current" ]; then
    eval "$name=\$(openssl rand -base64 32)"
    eval "export $name"
    GENERATED_SECRETS="$GENERATED_SECRETS $name"
  elif [ "${#current}" -lt 32 ]; then
    warn "$name is shorter than the 32 characters Documenso requires."
  fi
done

WEBHOOK_SECRET_GENERATED=0
if [ -z "${DOCUMENSO_WEBHOOK_SECRET:-}" ]; then
  DOCUMENSO_WEBHOOK_SECRET=$(openssl rand -hex 32)
  WEBHOOK_SECRET_GENERATED=1
fi

# ---------------------------------------------------------------------------------------------
# 3. Signing certificate (.p12)
# ---------------------------------------------------------------------------------------------

# Prints "fingerprint|notAfter" when the .p12 opens with the passphrase, else fails
inspect_p12() {
  _x=$(openssl pkcs12 -in "$1" -nokeys -passin env:NEXT_PRIVATE_SIGNING_PASSPHRASE 2>/dev/null |
    openssl x509 -noout -fingerprint -sha256 -enddate 2>/dev/null) || return 1
  _fp=$(printf '%s\n' "$_x" | sed -n 's/^.*Fingerprint=//p')
  _end=$(printf '%s\n' "$_x" | sed -n 's/^notAfter=//p')
  [ -n "$_fp" ] || return 1
  printf '%s|%s' "$_fp" "$_end"
}

# Self-signed RSA 2048, 10 years, CN = public hostname; OpenSSL 3's default PKCS#12 (AES-256), which Documenso's signer reads
generate_p12() {
  _tmp=$(mktemp -d)
  _cn=$(url_host "$NEXT_PUBLIC_WEBAPP_URL" | tr -cd 'A-Za-z0-9.-')
  if openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
    -subj "/CN=${_cn:-documenso}/O=Geiger Docs" \
    -keyout "$_tmp/key.pem" -out "$_tmp/cert.pem" >"$_tmp/openssl.log" 2>&1 &&
    openssl pkcs12 -export -name "Geiger Docs signing" \
      -inkey "$_tmp/key.pem" -in "$_tmp/cert.pem" -out "$1" \
      -passout env:NEXT_PRIVATE_SIGNING_PASSPHRASE >>"$_tmp/openssl.log" 2>&1; then
    rm -rf "$_tmp"
    return 0
  fi
  tail -n 5 "$_tmp/openssl.log" | sed 's/^/[geiger]   openssl: /'
  rm -rf "$_tmp"
  return 1
}

# A path we can write to (Render secret files under /etc/secrets are read-only)
writable_path() {
  if mkdir -p "${1%/*}" 2>/dev/null && [ -w "${1%/*}" ]; then
    printf '%s' "$1"
  else
    printf '%s' "${TMPDIR:-/tmp}/documenso-cert.p12"
  fi
}

CERT_STATE=external # external | pinned | file | generated | reused | failed
CERT_INFO=""
CERT_B64=""
PASSPHRASE_GENERATED=0
old_umask=$(umask)
umask 077

if [ "${NEXT_PRIVATE_SIGNING_TRANSPORT:-local}" = local ]; then
  if [ -z "${NEXT_PRIVATE_SIGNING_PASSPHRASE:-}" ]; then
    if [ -n "${NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS:-}" ]; then
      warn "NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS is set but NEXT_PRIVATE_SIGNING_PASSPHRASE is empty, so signing will fail. Pin the passphrase that came with it."
    else
      # Documenso can't read a .p12 without a passphrase ("Failed to get private key bags")
      NEXT_PRIVATE_SIGNING_PASSPHRASE=$(openssl rand -base64 32)
      export NEXT_PRIVATE_SIGNING_PASSPHRASE
      PASSPHRASE_GENERATED=1
    fi
  fi

  if [ -n "${NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS:-}" ]; then
    # Pinned: Documenso reads the env var itself; decode a copy to self-check it and keep start.sh's file check accurate
    CERT_STATE=pinned
    cert_path=$(writable_path "${NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH:-$DEFAULT_CERT_PATH}")
    if ! printf '%s' "$NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS" | tr -d ' \t\r\n' | openssl base64 -d -A >"$cert_path" 2>/dev/null || [ ! -s "$cert_path" ]; then
      warn "NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS is not valid base64. Paste the single line from the certificate block again."
    fi
  elif [ -n "${NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH:-}" ] && [ -f "$NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH" ]; then
    # Operator-managed file, e.g. a Render secret file at /etc/secrets/cert.p12
    CERT_STATE="file"
    cert_path=$NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH
  else
    cert_path=$(writable_path "${NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH:-$DEFAULT_CERT_PATH}")
    if [ -s "$cert_path" ] && inspect_p12 "$cert_path" >/dev/null; then
      CERT_STATE=reused # same container restarted; still not pinned
    elif generate_p12 "$cert_path"; then
      CERT_STATE=generated
    else
      CERT_STATE=failed
    fi
  fi
  export NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH="$cert_path"

  if [ "$CERT_STATE" = failed ]; then
    warn "Could not generate a signing certificate. Documenso will start, but signing fails until NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS is set."
  elif CERT_INFO=$(inspect_p12 "$cert_path"); then
    log "Signing certificate ($CERT_STATE): SHA-256 ${CERT_INFO%%|*}, valid until ${CERT_INFO#*|}"
  else
    CERT_INFO=""
    warn "OpenSSL could not open the signing certificate with NEXT_PRIVATE_SIGNING_PASSPHRASE (wrong passphrase, or a legacy .p12). Check $NEXT_PUBLIC_WEBAPP_URL/api/certificate-status once Documenso is up."
  fi
  case "$CERT_STATE" in generated | reused) CERT_B64=$(openssl base64 -A -in "$cert_path") ;; esac
fi
umask "$old_umask"

# ---------------------------------------------------------------------------------------------
# 4. Admin promotion and first-account check (background, after the server is healthy; never blocks boot)
# ---------------------------------------------------------------------------------------------

ADMIN_EMAIL=$(lower "${DOCUMENSO_ADMIN_EMAIL:-}")
# Plain addresses only, because the value is spliced into SQL
case "$ADMIN_EMAIL" in
  "" | *@*.*) ;;
  *) ADMIN_EMAIL="!" ;;
esac
case "$ADMIN_EMAIL" in
  *[!a-z0-9._%+@-]* | *@*@* | @* | *@)
    warn "DOCUMENSO_ADMIN_EMAIL is not a plain email address, so nobody will be promoted."
    ADMIN_EMAIL=""
    ;;
esac

# Each outcome raises a GEIGER_* marker that we read back from Prisma's output
COUNT_SQL=$(
  cat <<'SQL'
DO $geiger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User") THEN RAISE EXCEPTION 'GEIGER_NO_USERS'; END IF;
END
$geiger$;
SQL
)
PROMOTE_SQL=$(
  cat <<'SQL'
DO $geiger$
DECLARE target text := '__EMAIL__';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User") THEN RAISE EXCEPTION 'GEIGER_NO_USERS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE lower(email) = target) THEN RAISE EXCEPTION 'GEIGER_USER_MISSING'; END IF;
  IF EXISTS (SELECT 1 FROM "User" WHERE lower(email) = target AND 'ADMIN' = ANY (roles)) THEN RAISE EXCEPTION 'GEIGER_ALREADY_ADMIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE lower(email) = target AND "emailVerified" IS NOT NULL) THEN RAISE EXCEPTION 'GEIGER_USER_UNVERIFIED'; END IF;
  UPDATE "User" SET roles = array_append(roles, 'ADMIN'::"Role") WHERE lower(email) = target;
END
$geiger$;
SQL
)

health_ok() {
  if command -v wget >/dev/null 2>&1; then
    wget -q -T 5 -O /dev/null "http://127.0.0.1:$PORT/api/health" 2>/dev/null
  else
    node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  fi
}

# Same Prisma CLI and schema that start.sh uses for migrations; the image has no psql
run_sql() {
  (cd "$APP_DIR" && printf '%s\n' "$1" | CHECKPOINT_DISABLE=1 npx prisma db execute --stdin --schema "$PRISMA_SCHEMA" 2>&1)
}

signup_steps() {
  if [ "$SIGNUP_OPEN" = 1 ]; then
    log "  Signup is open: sign up at $NEXT_PUBLIC_WEBAPP_URL/signup and click the link in the verification email."
  else
    log "  1. Render > this service > Environment: set DOCUMENSO_ALLOW_SIGNUP=true and DOCUMENSO_ADMIN_EMAIL=<you>, then Save and deploy."
    log "  2. Sign up at $NEXT_PUBLIC_WEBAPP_URL/signup and click the link in the verification email."
  fi
  log "  Then set DOCUMENSO_ALLOW_SIGNUP=false and Save and deploy: that boot promotes DOCUMENSO_ADMIN_EMAIL to admin."
}

account_check() {
  set +e
  _i=0
  until health_ok; do
    _i=$((_i + 1))
    if [ "$_i" -ge 90 ]; then
      log "accounts: Documenso was not healthy after 15 minutes, so the account check was skipped."
      return 0
    fi
    sleep 10
  done
  if [ -n "$ADMIN_EMAIL" ]; then
    _out=$(run_sql "$(printf '%s\n' "$PROMOTE_SQL" | sed "s/__EMAIL__/$ADMIN_EMAIL/")")
  else
    _out=$(run_sql "$COUNT_SQL")
  fi
  case "$_out" in
    *GEIGER_NO_USERS*)
      log "accounts: none yet. To create the first (admin) account:"
      signup_steps
      ;;
    *GEIGER_USER_MISSING*)
      log "admin: no account for $ADMIN_EMAIL yet. To create it:"
      signup_steps
      ;;
    *GEIGER_USER_UNVERIFIED*) log "admin: $ADMIN_EMAIL has not verified its email yet. Click the verification link, then redeploy or restart to promote it." ;;
    *GEIGER_ALREADY_ADMIN*) log "admin: $ADMIN_EMAIL is an admin." ;;
    *"executed successfully"*)
      if [ -n "$ADMIN_EMAIL" ]; then
        log "admin: promoted $ADMIN_EMAIL to ADMIN."
      else
        log "accounts: at least one exists. Set DOCUMENSO_ADMIN_EMAIL to promote one to admin."
      fi
      ;;
    *) log "accounts: check failed, nothing changed: $(printf '%s' "$_out" | redact | tail -n 3 | tr '\n' ' ')" ;;
  esac
  if [ "$SIGNUP_OPEN" = 1 ]; then
    log "accounts: signup is OPEN. Set DOCUMENSO_ALLOW_SIGNUP=false once your account exists, then Save and deploy."
  fi
  return 0
}

# ---------------------------------------------------------------------------------------------
# 5. Log the values Geiger Docs needs (never the database URL or the Resend key)
# ---------------------------------------------------------------------------------------------

if [ -n "$GENERATED_SECRETS" ]; then
  rule
  echo "GEIGER DOCS: SECRETS GENERATED THIS BOOT. PIN THEM NOW"
  rule
  echo "These were missing, so this boot generated them. They change on every deploy until you add them in"
  echo "Render > Environment. The encryption keys must NEVER change once Documenso holds data: a new key"
  echo "makes the data encrypted with the old one unreadable."
  echo
  for name in $GENERATED_SECRETS; do
    eval "printf '%s=%s\n' \"$name\" \"\$$name\""
  done
  rule
fi

if [ -n "$CERT_B64" ]; then
  rule
  echo "GEIGER DOCS: PIN THE SIGNING CERTIFICATE (action required)"
  rule
  echo "Render's disk is wiped on every deploy, so this self-signed certificate is replaced on the next one"
  echo "unless you pin it. In Render > Environment, set the line below (one line, no spaces), then Save and deploy."
  if [ "$PASSPHRASE_GENERATED" = 1 ]; then
    echo "Also set the passphrase line: it was generated this boot."
  else
    echo "The passphrase is already in Render's env (NEXT_PRIVATE_SIGNING_PASSPHRASE); keep it unchanged."
  fi
  echo
  echo "NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS=$CERT_B64"
  echo
  echo "NEXT_PRIVATE_SIGNING_PASSPHRASE=$NEXT_PRIVATE_SIGNING_PASSPHRASE"
  echo
  [ -z "$CERT_INFO" ] || echo "Fingerprint (SHA-256): ${CERT_INFO%%|*}. The next boot logs the same one when pinned."
  echo "Anyone who can read these logs can copy this key until it is pinned and the logs age out."
  rule
fi

rule
echo "GEIGER DOCS SETUP (Documenso on Render)"
rule
echo "Public URL (Geiger Docs DOCUMENSO_URL): $NEXT_PUBLIC_WEBAPP_URL"
echo "Health: $NEXT_PUBLIC_WEBAPP_URL/api/health    Certificate: $NEXT_PUBLIC_WEBAPP_URL/api/certificate-status"
echo
echo "Webhook (Documenso > Team settings > Webhooks > Create Webhook)"
if [ -n "${GEIGER_DOCS_WEBHOOK_URL:-}" ]; then
  echo "  URL:    $GEIGER_DOCS_WEBHOOK_URL"
else
  echo "  URL:    https://<geiger-docs-production-origin>/docs/api/signing/webhook"
  echo "          (set GEIGER_DOCS_WEBHOOK_URL in Render to print the exact URL here)"
fi
echo "  Events: $WEBHOOK_EVENTS"
echo "  Secret: $DOCUMENSO_WEBHOOK_SECRET"
[ "$WEBHOOK_SECRET_GENERATED" = 0 ] || echo "          (generated this boot: set DOCUMENSO_WEBHOOK_SECRET in Render or it changes on the next deploy)"
echo
case "$CERT_STATE" in
  pinned | file)
    if [ -n "$CERT_INFO" ]; then
      echo "Signing certificate: $CERT_STATE, SHA-256 ${CERT_INFO%%|*}"
    else
      echo "Signing certificate: $CERT_STATE but unreadable, so signing may fail (see the warnings above)"
    fi
    ;;
  generated | reused) echo "Signing certificate: NOT PINNED, see the certificate block above" ;;
  failed) echo "Signing certificate: MISSING, so signing will fail (see the warnings above)" ;;
  external) echo "Signing certificate: transport ${NEXT_PRIVATE_SIGNING_TRANSPORT:-local}, managed outside this script" ;;
esac
if [ "$SIGNUP_OPEN" = 1 ]; then
  echo "Signup: OPEN. Set DOCUMENSO_ALLOW_SIGNUP=false once your account exists."
else
  echo "Signup: closed (DOCUMENSO_ALLOW_SIGNUP=true opens it)"
fi
if [ -n "$ADMIN_EMAIL" ]; then
  echo "Admin: $ADMIN_EMAIL is checked once the server is healthy (see the '[geiger] admin:' line below)"
else
  echo "Admin: no valid DOCUMENSO_ADMIN_EMAIL, so nobody is promoted"
fi
echo
echo "Remaining manual steps (in Documenso, signed in as the admin)"
echo "  1. Create the organisation \"Geiger\", then its team \"Geiger Docs\" (URL geiger-docs)."
echo "  2. Team settings > API Tokens > Create Token. Copy it (shown once) into DOCUMENSO_API_TOKEN below."
echo "  3. Team settings > Webhooks > Create Webhook with the URL, events and secret above."
echo "  4. Team settings > Preferences > Document: set \"Include the Audit Logs\" to Yes."
echo
echo "Geiger Docs env (local .env and Vercel, server-only):"
echo "DOCUMENSO_URL=$NEXT_PUBLIC_WEBAPP_URL"
echo "DOCUMENSO_API_TOKEN=<team API token from step 2>"
echo "DOCUMENSO_WEBHOOK_SECRET=$DOCUMENSO_WEBHOOK_SECRET"
rule

# ---------------------------------------------------------------------------------------------
# 6. Hand over to the upstream entrypoint and CMD (start.sh runs the migrations, then the server)
# ---------------------------------------------------------------------------------------------

account_check &
cd "$APP_DIR"
[ "$#" -gt 0 ] || set -- sh start.sh
exec "$UPSTREAM_ENTRYPOINT" "$@"
