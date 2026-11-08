import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "@/lib/signing/model";

// The only Documenso caller: plain fetch to the self-hosted API v2 (${DOCUMENSO_URL}/api/v2, header Authorization: <token>).
// Speaks our vocabulary at the boundary (roles, statuses); never returns signing tokens or URLs, never logs the token.
// Failures log as [docs.documenso.<op>] and return null / false; a 429 is retried once after Retry-After.

// Documenso emails the signers itself (through the suite's Resend account); switch to "NONE" + suite email here later.
const DISTRIBUTION_METHOD = "EMAIL";
const LANGUAGE = "en";
const REQUEST_TIMEOUT_MS = 30_000;
// A longer Retry-After isn't worth holding a request open for; the call fails and the caller can retry.
const MAX_RETRY_AFTER_MS = 10_000;

const ROLES = { signer: "SIGNER", approver: "APPROVER", cc: "CC" };
const SIGNING_ORDERS = { parallel: "PARALLEL", sequential: "SEQUENTIAL" };
const ENVELOPE_STATUSES = {
  DRAFT: "sending",
  PENDING: "pending",
  COMPLETED: "completed",
  REJECTED: "declined",
  CANCELLED: "cancelled",
};
const READ_STATUSES = { NOT_OPENED: "not_opened", OPENED: "opened" };
const RECIPIENT_SIGNING_STATUSES = { NOT_SIGNED: "not_signed", SIGNED: "signed", REJECTED: "declined" };

function settings() {
  const origin = String(process.env.DOCUMENSO_URL || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v2$/i, "");
  const token = String(process.env.DOCUMENSO_API_TOKEN || "").trim();
  return origin && token ? { base: `${origin}/api/v2`, token } : null;
}

export const isDocumensoConfigured = () => settings() !== null;
export const isWebhookConfigured = () => Boolean(String(process.env.DOCUMENSO_WEBHOOK_SECRET || "").trim());

const clip = (value, max) => String(value ?? "").trim().slice(0, max);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry-After is either delta-seconds or an HTTP date; a missing/odd value waits one second.
function retryAfterMs(header) {
  if (!header) return 1000;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 1000;
}

async function errorDetail(res) {
  const text = (await res.text().catch(() => "")).slice(0, 500);
  try {
    const body = JSON.parse(text);
    return body?.message || body?.error || text;
  } catch {
    return text;
  }
}

const isPdf = (buffer) => buffer.length > 4 && buffer.subarray(0, 5).toString("latin1") === "%PDF-";

// One API call -> { data, status }: data is the JSON (or a PDF Buffer with binary: true), null on any failure; status is the
// HTTP status (0 when unconfigured or unreachable). form is a factory so a retry gets a fresh body.
async function call(op, path, { method = "GET", json, form, binary = false } = {}) {
  const config = settings();
  if (!config) return { data: null, status: 0 };
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      const headers = { Authorization: config.token, Accept: binary ? "*/*" : "application/json" };
      let body;
      if (form) body = form();
      else if (json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(json);
      }
      res = await fetch(`${config.base}${path}`, {
        method,
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      console.error(`[docs.documenso.${op}]`, e?.name === "TimeoutError" ? "timed out" : e?.message || e);
      return { data: null, status: 0 };
    }
    if (res.status === 429 && attempt === 1) {
      const wait = retryAfterMs(res.headers.get("retry-after"));
      await res.body?.cancel().catch(() => {});
      if (wait <= MAX_RETRY_AFTER_MS) {
        await sleep(wait);
        continue;
      }
    }
    if (!res.ok) {
      console.error(`[docs.documenso.${op}]`, res.status, await errorDetail(res));
      return { data: null, status: res.status };
    }
    try {
      if (binary) {
        const buffer = Buffer.from(await res.arrayBuffer());
        if (isPdf(buffer)) return { data: buffer, status: res.status };
        console.error(`[docs.documenso.${op}]`, "response is not a PDF");
        return { data: null, status: res.status };
      }
      const text = await res.text();
      return { data: text ? JSON.parse(text) : {}, status: res.status };
    } catch (e) {
      console.error(`[docs.documenso.${op}]`, e?.message || e);
      return { data: null, status: res.status };
    }
  }
}

function recipientOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.id);
  return {
    id: Number.isSafeInteger(id) ? id : null,
    email: normalizeEmail(raw.email),
    name: typeof raw.name === "string" ? raw.name : "",
    role: String(raw.role || "").toLowerCase(),
    signingOrder: raw.signingOrder == null ? null : Number(raw.signingOrder),
    readStatus: READ_STATUSES[raw.readStatus] ?? null,
    signingStatus: RECIPIENT_SIGNING_STATUSES[raw.signingStatus] ?? null,
    signedAt: raw.signedAt ?? null,
    rejectionReason: typeof raw.rejectionReason === "string" && raw.rejectionReason ? raw.rejectionReason : null,
    expired: Boolean(raw.expired || raw.expirationNotifiedAt),
  };
}

// A GET /envelope/{id} body or a webhook payload -> { envelopeId, externalId, status, completedAt, recipients, items } (no tokens).
export function normalizeEnvelope(raw) {
  if (!raw || typeof raw !== "object") return null;
  // Webhook payloads carry the legacy numeric id in `id` and the v2 id in `envelopeId`; GET bodies use `id`.
  const envelopeId =
    typeof raw.envelopeId === "string" && raw.envelopeId
      ? raw.envelopeId
      : typeof raw.id === "string" && raw.id
        ? raw.id
        : null;
  const recipients = Array.isArray(raw.recipients) ? raw.recipients : Array.isArray(raw.Recipient) ? raw.Recipient : [];
  const items = Array.isArray(raw.envelopeItems) ? raw.envelopeItems : [];
  return {
    envelopeId,
    externalId: typeof raw.externalId === "string" && raw.externalId ? raw.externalId : null,
    status: ENVELOPE_STATUSES[raw.status] ?? null,
    completedAt: raw.completedAt ?? null,
    recipients: recipients.map(recipientOf).filter(Boolean),
    items: items
      .filter((item) => item && typeof item.id === "string")
      .map((item) => ({ id: item.id, title: item.title ?? "", order: Number(item.order ?? 0) }))
      .sort((a, b) => a.order - b.order),
  };
}

// Drops every signing token / signing URL from a webhook body before it's stored.
export function redactWebhookBody(value) {
  if (Array.isArray(value)) return value.map(redactWebhookBody);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (/token|signingurl/i.test(key)) continue;
    out[key] = redactWebhookBody(inner);
  }
  return out;
}

function envelopeMeta({ subject, message, signingOrder } = {}) {
  const meta = { distributionMethod: DISTRIBUTION_METHOD, language: LANGUAGE };
  if (subject) meta.subject = clip(subject, 254);
  if (message) meta.message = clip(message, 5000);
  if (signingOrder) meta.signingOrder = SIGNING_ORDERS[signingOrder] ?? SIGNING_ORDERS.parallel;
  return meta;
}

const pdfFileName = (title) =>
  `${String(title || "Document").replace(/[^\p{L}\p{N} ._-]+/gu, "").trim().slice(0, 120) || "Document"}.pdf`;

// Uploads the PDF as a DRAFT envelope. recipients: [{ name, email, role, signingOrder }] in position order, so the PDF's
// {{type, rN}} placeholders bind to recipients[N-1]. meta: { subject, message, signingOrder }. -> { id } or null.
export async function createEnvelope({ title, externalId, pdf, recipients, meta } = {}) {
  if (!pdf?.length || !Array.isArray(recipients) || recipients.length === 0) {
    console.error("[docs.documenso.create]", "a PDF and at least one recipient are required");
    return null;
  }
  const payload = {
    type: "DOCUMENT",
    title: clip(title, 255) || "Untitled",
    ...(externalId ? { externalId: String(externalId) } : {}),
    recipients: recipients.map((recipient) => ({
      email: normalizeEmail(recipient.email),
      name: clip(recipient.name, 255),
      role: ROLES[recipient.role] ?? ROLES.signer,
      ...(recipient.signingOrder != null ? { signingOrder: Number(recipient.signingOrder) } : {}),
    })),
    meta: envelopeMeta(meta),
  };
  const { data } = await call("create", "/envelope/create", {
    method: "POST",
    form: () => {
      const form = new FormData();
      form.append("payload", JSON.stringify(payload));
      form.append("files", new Blob([pdf], { type: "application/pdf" }), pdfFileName(title));
      return form;
    },
  });
  if (!data) return null;
  if (typeof data.id !== "string" || !data.id) {
    console.error("[docs.documenso.create]", "response has no envelope id");
    return null;
  }
  return { id: data.id };
}

// -> { envelope, missing }: envelope is null on any failure; missing is true only when Documenso answered 404 (deleted / never existed).
export async function lookupEnvelope(id) {
  if (!id) return { envelope: null, missing: false };
  const { data, status } = await call("get", `/envelope/${encodeURIComponent(id)}`);
  return { envelope: normalizeEnvelope(data), missing: status === 404 };
}

export async function getEnvelope(id) {
  return (await lookupEnvelope(id)).envelope;
}

// DRAFT -> PENDING; Documenso emails the first signer(s). -> { envelopeId, recipients } (ids, no tokens) or null.
export async function distributeEnvelope(id, meta = {}) {
  if (!id) return null;
  const { subject, message } = meta;
  const { data } = await call("distribute", "/envelope/distribute", {
    method: "POST",
    json: { envelopeId: id, meta: envelopeMeta({ subject, message }) },
  });
  if (!data || data.success === false) return null;
  return {
    envelopeId: typeof data.id === "string" ? data.id : id,
    recipients: (Array.isArray(data.recipients) ? data.recipients : []).map(recipientOf).filter(Boolean),
  };
}

// Re-sends the signing email to Documenso recipient ids (numbers). -> true / false.
export async function redistributeEnvelope(id, recipientIds) {
  const recipients = (recipientIds || []).map(Number).filter(Number.isSafeInteger);
  if (!id || recipients.length === 0) return false;
  const { data } = await call("redistribute", "/envelope/redistribute", {
    method: "POST",
    json: { envelopeId: id, recipients },
  });
  return Boolean(data) && data.success !== false;
}

// PENDING envelopes only. -> true / false.
export async function cancelEnvelope(id, reason) {
  if (!id) return false;
  const text = clip(reason, 500);
  const { data } = await call("cancel", "/envelope/cancel", {
    method: "POST",
    json: text ? { envelopeId: id, reason: text } : { envelopeId: id },
  });
  return Boolean(data) && data.success !== false;
}

// Hard-deletes a draft or pending envelope. -> true / false.
export async function deleteEnvelope(id) {
  if (!id) return false;
  const { data } = await call("delete", "/envelope/delete", { method: "POST", json: { envelopeId: id } });
  return Boolean(data) && data.success !== false;
}

// The signed (sealed) PDF of one envelope item. -> Buffer or null.
export async function downloadEnvelopeItem(itemId) {
  if (!itemId) return null;
  const path = `/envelope/item/${encodeURIComponent(itemId)}/download?version=signed`;
  return (await call("download_item", path, { binary: true })).data;
}

export async function downloadCertificate(id) {
  if (!id) return null;
  const path = `/envelope/${encodeURIComponent(id)}/certificate/download`;
  return (await call("download_certificate", path, { binary: true })).data;
}

export async function downloadAuditLog(id) {
  if (!id) return null;
  const path = `/envelope/${encodeURIComponent(id)}/audit-log/download`;
  return (await call("download_audit_log", path, { binary: true })).data;
}

const digest = (value) => createHash("sha256").update(String(value), "utf8").digest();

// X-Documenso-Secret against DOCUMENSO_WEBHOOK_SECRET in constant time (hashing first evens out the lengths).
export function verifyWebhookSecret(value) {
  const secret = String(process.env.DOCUMENSO_WEBHOOK_SECRET || "").trim();
  if (!secret || typeof value !== "string" || !value) return false;
  return timingSafeEqual(digest(value), digest(secret));
}
