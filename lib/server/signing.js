import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { after } from "next/server";
import { adminClient, getSessionUser, sessionClient } from "@/lib/server/supabase";
import { fail, forbidden, notFound, ok, unauthorized } from "@/lib/server/http";
import { requireDocument } from "@/lib/server/documents";
import { notifySigningEvent } from "@/lib/server/notifications";
import {
  cancelEnvelope,
  createEnvelope,
  deleteEnvelope,
  distributeEnvelope,
  downloadAuditLog,
  downloadCertificate,
  downloadEnvelopeItem,
  getEnvelope,
  isDocumensoConfigured,
  isWebhookConfigured,
  lookupEnvelope,
  normalizeEnvelope,
  redactWebhookBody,
  redistributeEnvelope,
} from "@/lib/server/documenso";
import {
  OPEN_SIGNING_STATUSES,
  SIGNING_ORDERS,
  isOpenStatus,
  normalizeEmail,
  validateRecipients,
} from "@/lib/signing/model";
import { validateFieldTokens } from "@/lib/signing/fields";

// Signing orchestration for the /api/signing/* route handlers: every write runs on the service role (no client write
// policies), Documenso is reached only through lib/server/documenso.js, and each request status change is mirrored into
// documents.metadata.signing via docs.document_merge_meta. Exported actions return { …result } or { error: Response }.

const BUCKET = "docs-signing";
const SIGNED_URL_TTL_SECONDS = 60;
const SUBJECT_MAX = 254;
const MESSAGE_MAX = 5000;
const NAME_MAX = 255;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOSED_STATUSES = new Set(["completed", "declined", "cancelled", "failed"]);

// Stored files of a completed request: route kind -> column + object name under <projectId>/<requestId>/.
const FILES = {
  signed: { column: "signed_pdf_path", name: "signed.pdf", label: "signed" },
  certificate: { column: "certificate_path", name: "certificate.pdf", label: "certificate" },
  audit: { column: "audit_log_path", name: "audit-log.pdf", label: "audit log" },
};
export const SIGNING_FILE_KINDS = Object.keys(FILES);

// Webhook events we act on; anything else is acknowledged and ignored.
export const HANDLED_WEBHOOK_EVENTS = new Set([
  "DOCUMENT_SENT",
  "DOCUMENT_OPENED",
  "DOCUMENT_SIGNED",
  "DOCUMENT_RECIPIENT_COMPLETED",
  "DOCUMENT_COMPLETED",
  "DOCUMENT_REJECTED",
  "DOCUMENT_CANCELLED",
  "RECIPIENT_EXPIRED",
]);
// Events that close a request on their own; every other handled event means the envelope is out (pending).
const CLOSING_EVENTS = { DOCUMENT_COMPLETED: "completed", DOCUMENT_REJECTED: "declined", DOCUMENT_CANCELLED: "cancelled" };

// Pure helpers -------------------------------------------------------------------------------------------------------

// Usable only with all three: the Documenso API env, the webhook secret (or statuses never update) and the service-role key.
export const isSigningConfigured = () => isDocumensoConfigured() && isWebhookConfigured() && Boolean(adminClient());
// Force-closing a request only needs the database.
export const canForceClose = () => Boolean(adminClient());
export const signingNotConfigured = () => fail(503, "Signing isn't set up yet.", "signing_not_configured");
export const isUuid = (value) => typeof value === "string" && UUID_RE.test(value);

const text = (value) => (typeof value === "string" ? value.trim() : "");

// DB recipient row -> view model; mirrors normalizeSigningRecipient in lib/supabase/signing.js ("use client").
function normalizeRecipient(row) {
  return {
    id: row.id,
    position: Number(row.position ?? 0),
    name: row.name ?? "",
    email: row.email ?? "",
    role: row.role ?? "signer",
    signingOrder: row.signing_order == null ? null : Number(row.signing_order),
    readStatus: row.read_status ?? "not_opened",
    signingStatus: row.signing_status ?? "not_signed",
    signedAt: row.signed_at ?? null,
    rejectionReason: row.rejection_reason ?? "",
  };
}

// DB request row (+ signing_recipients embed) -> the `request` view model; mirrors normalizeSigningRequest in lib/supabase/signing.js.
export function normalizeSigningRequest(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const recipients = (Array.isArray(row.signing_recipients) ? row.signing_recipients : [])
    .filter((recipient) => recipient && !recipient.deleted_at)
    .map(normalizeRecipient)
    .sort((a, b) => a.position - b.position);
  return {
    ...meta,
    id: row.id,
    documentId: row.document_id ?? null,
    projectId: row.project_id ?? null,
    versionNumber: row.version_number == null ? null : Number(row.version_number),
    title: row.title ?? "",
    subject: row.subject ?? "",
    message: row.message ?? "",
    signingOrder: row.signing_order ?? "parallel",
    status: row.status ?? "sending",
    sentAt: row.sent_at ?? null,
    completedAt: row.completed_at ?? null,
    closedAt: row.closed_at ?? null,
    error: row.error ?? "",
    hasSignedPdf: Boolean(row.signed_pdf_path),
    hasCertificate: Boolean(row.certificate_path),
    hasAuditLog: Boolean(row.audit_log_path),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    recipients,
  };
}

// Request status after a webhook event or a sync: closed requests never change; open ones follow the event or envelope.
export function nextRequestStatus(current, { event, envelopeStatus } = {}) {
  if (!isOpenStatus(current)) return current;
  if (event) return CLOSING_EVENTS[event] ?? "pending";
  // A draft envelope (sending) never moves the request backwards.
  return envelopeStatus && envelopeStatus !== "sending" ? envelopeStatus : current;
}

// Our recipient rows vs Documenso's -> [{ row, patch }] for the rows that changed. Monotonic: opened/signed/declined never revert.
export function recipientPatches(rows, incoming) {
  const byId = new Map();
  const byEmail = new Map();
  for (const recipient of incoming || []) {
    if (recipient.id != null) byId.set(Number(recipient.id), recipient);
    if (recipient.email) byEmail.set(recipient.email, recipient);
  }
  const patches = [];
  for (const row of rows || []) {
    if (row.deleted_at) continue;
    const theirs =
      (row.documenso_recipient_id != null && byId.get(Number(row.documenso_recipient_id))) ||
      byEmail.get(normalizeEmail(row.email));
    if (!theirs) continue;
    const patch = {};
    if (row.documenso_recipient_id == null && theirs.id != null) patch.documenso_recipient_id = theirs.id;
    if (row.read_status !== "opened" && theirs.readStatus === "opened") patch.read_status = "opened";
    // Documenso marks CC recipients signed on creation; they never sign, so their signing state is left alone.
    if (row.role !== "cc" && row.signing_status === "not_signed") {
      if (theirs.signingStatus === "signed") {
        patch.signing_status = "signed";
        patch.signed_at = theirs.signedAt ?? new Date().toISOString();
      } else if (theirs.signingStatus === "declined") {
        patch.signing_status = "declined";
        patch.rejection_reason = theirs.rejectionReason ?? null;
      }
    }
    if (row.signing_status === "signed" && !row.signed_at && theirs.signedAt) patch.signed_at = theirs.signedAt;
    if (Object.keys(patch).length) patches.push({ row, patch });
  }
  return patches;
}

// Who a reminder goes to: the given recipient ids, or every signer/approver still to sign (only the current one in order).
export function remindTargets(rows, { signingOrder, recipientIds } = {}) {
  const waiting = (rows || [])
    .filter((row) => !row.deleted_at && row.role !== "cc" && row.signing_status === "not_signed")
    .sort((a, b) => a.position - b.position);
  if (recipientIds?.length) {
    const wanted = new Set(recipientIds);
    const picked = waiting.filter((row) => wanted.has(row.id));
    if (picked.length !== wanted.size) {
      return { error: "Only signers or approvers who haven't signed yet can be reminded." };
    }
    return { recipients: picked };
  }
  const due = signingOrder === "sequential" ? waiting.slice(0, 1) : waiting;
  return due.length ? { recipients: due } : { error: "Everyone has already signed." };
}

// Webhook idempotency key: event + envelope + createdAt (a body hash stands in when createdAt is missing).
export function webhookDedupeKey(body) {
  const envelopeId = normalizeEnvelope(body?.payload)?.envelopeId ?? "";
  const createdAt =
    typeof body?.createdAt === "string" && body.createdAt
      ? body.createdAt
      : `sha256:${createHash("sha256").update(JSON.stringify(redactWebhookBody(body?.payload ?? null))).digest("hex")}`;
  return `${body?.event ?? ""}:${envelopeId}:${createdAt}`;
}

// What happened -> the notifications to send ([{ type, recipientName? }]); flips are recipient rows whose signing status changed.
export function signingNotes({ event, status, transitioned, flips = [], envelope } = {}) {
  const notes = [];
  for (const flip of flips) {
    if (flip.signing_status === "signed" && flip.role !== "cc") notes.push({ type: "signed", recipientName: flip.name });
  }
  if (transitioned && status === "completed") notes.push({ type: "completed" });
  if (transitioned && status === "declined") {
    const decliner = flips.find((flip) => flip.signing_status === "declined");
    const fromEnvelope = envelope?.recipients?.find((recipient) => recipient.signingStatus === "declined");
    notes.push({ type: "declined", recipientName: decliner?.name || fromEnvelope?.name || undefined });
  }
  if (transitioned && status === "cancelled") notes.push({ type: "cancelled" });
  if (event === "RECIPIENT_EXPIRED") {
    const expired = (envelope?.recipients || []).filter(
      (recipient) => recipient.expired && recipient.signingStatus === "not_signed",
    );
    if (expired.length) for (const recipient of expired) notes.push({ type: "expired", recipientName: recipient.name || undefined });
    else notes.push({ type: "expired" });
  }
  return notes;
}

// Recipients with clean values: [{ position, name, email, role }]; positions always follow array order (a sent position is ignored).
function readRecipients(input) {
  return (Array.isArray(input) ? input : []).map((recipient, index) => ({
    position: index + 1,
    name: text(recipient?.name),
    email: normalizeEmail(recipient?.email),
    role: recipient?.role,
  }));
}

function readSendInput(input, document) {
  const recipients = readRecipients(input.recipients);
  const recipientsError = validateRecipients(recipients);
  if (recipientsError) return { error: recipientsError };
  if (recipients.some((recipient) => recipient.name.length > NAME_MAX)) {
    return { error: `Recipient names can be up to ${NAME_MAX} characters.` };
  }
  const signingOrder = input.signingOrder ?? "parallel";
  if (!SIGNING_ORDERS.includes(signingOrder)) return { error: "Choose whether recipients sign in order." };
  const subject = text(input.subject) || text(document.title).slice(0, SUBJECT_MAX) || "Please sign this document";
  if (subject.length > SUBJECT_MAX) return { error: `The subject can be up to ${SUBJECT_MAX} characters.` };
  const message = text(input.message);
  if (message.length > MESSAGE_MAX) return { error: `The message can be up to ${MESSAGE_MAX} characters.` };
  return { subject, message, signingOrder, recipients };
}

// Data access (service role) -------------------------------------------------------------------------------------------

class SigningDbError extends Error {}

const docsDb = () => adminClient()?.schema("docs") ?? null;

function check({ data, error }, op) {
  if (error) throw new SigningDbError(`${op}: ${error.message}`);
  return data;
}

async function loadRequest(db, id) {
  return check(
    await db.from("signing_requests").select("*, signing_recipients(*)").eq("id", id).is("deleted_at", null).maybeSingle(),
    "load request",
  );
}

// The request a document's signing pill reflects: a live completed one (it keeps the document locked) wins, else the newest.
export function currentSigningRequest(requests) {
  const live = (requests || []).filter((request) => !request.deleted_at);
  const newest = [...live].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return newest.find((request) => request.status === "completed") ?? newest[0] ?? null;
}

// Re-derives documents.metadata.signing ({ requestId, status, updatedAt }, or null) from the document's requests so the
// UI reads doc.signing?.status without another query. Retries the write once. -> true when written. Never throws.
async function refreshDocumentSigning(db, documentId) {
  try {
    const { data, error } = await db
      .from("signing_requests")
      .select("id, status, created_at, deleted_at")
      .eq("document_id", documentId)
      .is("deleted_at", null);
    if (error) {
      console.error("[docs.signing.meta] read", error.message);
      return false;
    }
    const current = currentSigningRequest(data);
    const signing = current ? { requestId: current.id, status: current.status, updatedAt: new Date().toISOString() } : null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { error: writeError } = await db.rpc("document_merge_meta", { p_id: documentId, p_patch: { signing } });
      if (!writeError) return true;
      console.error(`[docs.signing.meta] write (attempt ${attempt})`, writeError.message);
    }
    return false;
  } catch (e) {
    console.error("[docs.signing.meta]", e?.message || e);
    return false;
  }
}

// Moves an open request to `status` (conditional on it still being open) -> the updated row, or null when it was already closed.
async function transitionRequest(db, row, status, patch = {}) {
  const now = new Date().toISOString();
  const update = { status, ...patch };
  if (status === "pending" && !row.sent_at) update.sent_at = now;
  if (status === "completed" && !update.completed_at) update.completed_at = now;
  if (CLOSED_STATUSES.has(status)) update.closed_at = now;
  const data = check(
    await db
      .from("signing_requests")
      .update(update)
      .eq("id", row.id)
      .in("status", OPEN_SIGNING_STATUSES)
      .select("*")
      .maybeSingle(),
    "transition request",
  );
  if (data) await refreshDocumentSigning(db, data.document_id);
  return data;
}

// Applies recipientPatches row by row (each conditional on the state it was computed from) -> the rows whose signing status flipped.
async function reconcileRecipients(db, rows, incoming) {
  const flips = [];
  await Promise.all(
    recipientPatches(rows, incoming).map(async ({ row, patch }) => {
      const data = check(
        await db
          .from("signing_recipients")
          .update(patch)
          .eq("id", row.id)
          .eq("signing_status", row.signing_status)
          .eq("read_status", row.read_status)
          .select("id")
          .maybeSingle(),
        "update recipient",
      );
      if (data && patch.signing_status) flips.push({ ...row, ...patch });
    }),
  );
  return flips;
}

// Brings a request and its recipients in line with a Documenso envelope -> { row, transitioned, flips }.
async function reconcileRequest(db, row, envelope, { event } = {}) {
  const flips = await reconcileRecipients(db, row.signing_recipients || [], envelope.recipients);
  if (!row.envelope_id && envelope.envelopeId) {
    check(
      await db.from("signing_requests").update({ envelope_id: envelope.envelopeId }).eq("id", row.id).is("envelope_id", null),
      "set envelope",
    );
  }
  const status = nextRequestStatus(row.status, { event, envelopeStatus: envelope.status });
  let moved = null;
  if (status !== row.status) {
    moved = await transitionRequest(db, row, status, status === "completed" && envelope.completedAt ? { completed_at: envelope.completedAt } : {});
  }
  const current = (await loadRequest(db, row.id)) ?? row;
  return { row: current, transitioned: Boolean(moved), flips };
}

const missingFiles = (row) => Object.values(FILES).some((file) => !row[file.column]);

// Sender + document creator (deduped, minus whoever acted and a note's own skipUserId) get each note. Never throws.
async function sendNotes(row, notes, { actorId } = {}) {
  try {
    if (!notes.length) return;
    const db = docsDb();
    const { data: document, error } = await db
      .from("documents")
      .select("title, project_id, created_by")
      .eq("id", row.document_id)
      .maybeSingle();
    if (error) console.error("[docs.signing.notify] document", error.message);
    const recipientsUserIds = [...new Set([row.created_by, document?.created_by])].filter((id) => id && id !== actorId);
    if (!recipientsUserIds.length) return;
    for (const note of notes) {
      const audience = recipientsUserIds.filter((id) => id !== note.skipUserId);
      if (!audience.length) continue;
      await notifySigningEvent({
        type: note.type,
        projectId: row.project_id ?? document?.project_id,
        documentId: row.document_id,
        documentTitle: document?.title || row.title,
        recipientsUserIds: audience,
        recipientName: note.recipientName,
      });
    }
  } catch (e) {
    console.error("[docs.signing.notify]", e?.message || e);
  }
}

// Downloads the signed PDF, certificate and audit log of a completed request into docs-signing and records their paths.
// Only missing files are fetched, uploads upsert, so it's safe to repeat. -> the updated row, or null. Never throws.
export async function storeCompletedFiles(row) {
  try {
    const admin = adminClient();
    if (!admin || !row?.envelope_id || row.status !== "completed") return null;
    const prefix = `${row.project_id}/${row.id}`;
    const jobs = [];
    if (!row.signed_pdf_path) {
      jobs.push([
        "signed",
        async () => {
          // We upload one file per envelope, so the signed PDF is its first item.
          const item = (await getEnvelope(row.envelope_id))?.items?.[0];
          return item ? downloadEnvelopeItem(item.id) : null;
        },
      ]);
    }
    if (!row.certificate_path) jobs.push(["certificate", () => downloadCertificate(row.envelope_id)]);
    if (!row.audit_log_path) jobs.push(["audit", () => downloadAuditLog(row.envelope_id)]);
    const patch = {};
    await Promise.all(
      jobs.map(async ([kind, download]) => {
        const pdf = await download();
        if (!pdf) return;
        const path = `${prefix}/${FILES[kind].name}`;
        const { error } = await admin.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
        if (error) console.error("[docs.signing.files] upload", kind, error.message);
        else patch[FILES[kind].column] = path;
      }),
    );
    if (!Object.keys(patch).length) return row;
    const data = check(
      await admin.schema("docs").from("signing_requests").update(patch).eq("id", row.id).select("*").maybeSingle(),
      "store files",
    );
    return data ?? row;
  } catch (e) {
    console.error("[docs.signing.files]", e?.message || e);
    return null;
  }
}

function failure(op, e) {
  console.error(`[docs.signing.${op}]`, e?.message || e);
  return { error: fail(500, "Something went wrong with this signing request. Try again.", "signing_failed") };
}

// Route guards ----------------------------------------------------------------------------------------------------------

// A signing request the caller may act on: { user, document, access, requestId } or { error: Response }.
// The request is read under the caller's RLS first, so an unreadable request is indistinguishable from a missing one.
export async function requireSigningRequest(id, { need = "read" } = {}) {
  const sb = await sessionClient();
  if (!sb) return { error: fail(503, "Supabase isn't configured.", "supabase_not_configured") };
  const user = await getSessionUser(sb);
  if (!user) return { error: unauthorized() };
  if (!isUuid(id)) return { error: notFound("Signing request not found.") };
  const { data, error } = await sb
    .schema("docs")
    .from("signing_requests")
    .select("id, document_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[docs.signing.require]", error.message);
    return { error: fail(500, "Couldn't load this signing request.", "signing_request_load_failed") };
  }
  if (!data) return { error: notFound("Signing request not found.") };
  const guard = await requireDocument(data.document_id, { need });
  if (guard.error) return guard;
  return { ...guard, requestId: data.id };
}

// Actions ---------------------------------------------------------------------------------------------------------------

async function renderPdf(input) {
  const { renderDocumentPdf } = await import("@/lib/server/pdf");
  return renderDocumentPdf(input);
}

// Marks a send failed (unlocking the document) before deleting its envelope, so Documenso's cancel webhook finds it closed.
async function abortSend(db, requestId, envelopeId, { status = 502, message, code = "signing_send_failed" }) {
  try {
    await transitionRequest(db, { id: requestId }, "failed", { error: message });
  } catch (e) {
    console.error("[docs.signing.send] mark failed", e?.message || e);
  }
  if (envelopeId) await deleteEnvelope(envelopeId);
  return { error: fail(status, message, code) };
}

// POST /api/signing/requests: validate -> insert (locks the document) -> render -> create envelope -> map ids -> distribute.
export async function sendForSignature({ document, user, input = {} }) {
  const db = docsDb();
  if (!db || !isDocumensoConfigured()) return { error: signingNotConfigured() };
  const draft = readSendInput(input, document);
  if (draft.error) return { error: fail(400, draft.error, "invalid_request") };
  const { subject, message, signingOrder, recipients } = draft;
  const fieldsError = validateFieldTokens(document.body, recipients);
  if (fieldsError) return { error: fail(400, fieldsError, "invalid_fields") };

  const requestId = randomUUID();
  try {
    // A signed document stays locked for good; sending it again needs a duplicate.
    const signed = check(
      await db
        .from("signing_requests")
        .select("id")
        .eq("document_id", document.id)
        .eq("status", "completed")
        .is("deleted_at", null)
        .limit(1),
      "check signed",
    );
    if (signed.length) {
      return { error: fail(409, "This document is already signed. Duplicate it to send a new version.", "document_already_signed") };
    }

    const inserted = await db.from("signing_requests").insert({
      id: requestId,
      project_id: document.projectId,
      document_id: document.id,
      title: document.title,
      subject,
      message,
      signing_order: signingOrder,
      status: "sending",
      created_by: user.id,
    });
    if (inserted.error?.code === "23505") {
      return { error: fail(409, "This document already has an open signing request.", "signing_request_open") };
    }
    check(inserted, "insert request");
  } catch (e) {
    return failure("send", e);
  }
  await refreshDocumentSigning(db, document.id);

  let envelopeId = null;
  try {
    check(
      await db.from("signing_recipients").insert(
        recipients.map((recipient) => ({
          request_id: requestId,
          position: recipient.position,
          signing_order: recipient.position,
          name: recipient.name,
          email: recipient.email,
          role: recipient.role,
          created_by: user.id,
        })),
      ),
      "insert recipients",
    );

    // Re-read under the lock: from here on the title and body can't change, so this is exactly what gets signed.
    const locked = check(
      await db.from("documents").select("title, body, deleted_at").eq("id", document.id).maybeSingle(),
      "read document",
    );
    if (!locked || locked.deleted_at) {
      return abortSend(db, requestId, null, { status: 404, message: "This document no longer exists.", code: "not_found" });
    }
    const lockedFieldsError = validateFieldTokens(locked.body, recipients);
    if (lockedFieldsError) {
      return abortSend(db, requestId, null, { status: 400, message: lockedFieldsError, code: "invalid_fields" });
    }
    const latest = check(
      await db
        .from("document_versions")
        .select("version_number")
        .eq("document_id", document.id)
        .is("deleted_at", null)
        .order("version_number", { ascending: false })
        .limit(1),
      "read version",
    );

    let pdf;
    try {
      pdf = await renderPdf({ title: locked.title, body: locked.body, recipients });
    } catch (e) {
      console.error("[docs.signing.send] pdf", e?.message || e);
      return abortSend(db, requestId, null, { status: 500, message: "Couldn't render the PDF.", code: "pdf_failed" });
    }

    const created = await createEnvelope({
      title: locked.title,
      externalId: requestId,
      pdf,
      recipients: recipients.map((recipient) => ({ ...recipient, signingOrder: recipient.position })),
      meta: { subject, message, signingOrder },
    });
    if (!created) {
      return abortSend(db, requestId, null, { message: "Documenso couldn't create the envelope.", code: "documenso_failed" });
    }
    envelopeId = created.id;

    // Conditional on still sending: a cancel that landed meanwhile wins, and the draft envelope is discarded.
    const saved = check(
      await db
        .from("signing_requests")
        .update({ envelope_id: envelopeId, title: locked.title, version_number: latest[0]?.version_number ?? null })
        .eq("id", requestId)
        .eq("status", "sending")
        .select("id")
        .maybeSingle(),
      "save envelope",
    );
    if (!saved) {
      await deleteEnvelope(envelopeId);
      return { error: fail(409, "This signing request was cancelled.", "signing_request_closed") };
    }

    const rows = check(await db.from("signing_recipients").select("*").eq("request_id", requestId), "read recipients");
    const envelope = await getEnvelope(envelopeId);
    const distributed = await distributeEnvelope(envelopeId, { subject, message });
    if (!distributed) {
      return abortSend(db, requestId, envelopeId, { message: "Documenso couldn't send the signing emails.", code: "documenso_failed" });
    }
    // Documenso's recipient ids (needed for reminders), matched by email; the distribute reply is the fallback source.
    await reconcileRecipients(db, rows, envelope?.recipients?.length ? envelope.recipients : distributed.recipients);

    const sent = await transitionRequest(db, { id: requestId, sent_at: null }, "pending");
    if (!sent) {
      const current = await loadRequest(db, requestId);
      if (current?.status === "cancelled") await deleteEnvelope(envelopeId);
    }
    return { request: normalizeSigningRequest(await loadRequest(db, requestId)) };
  } catch (e) {
    console.error("[docs.signing.send]", e?.message || e);
    return abortSend(db, requestId, envelopeId, { status: 500, message: "Couldn't send the document for signature.", code: "signing_failed" });
  }
}

// POST /api/signing/requests/[id]/remind: re-sends the signing email through Documenso. -> { ok: true } or { error }.
export async function remindSigning({ requestId, recipientIds }) {
  const db = docsDb();
  if (!db || !isDocumensoConfigured()) return { error: signingNotConfigured() };
  if (recipientIds !== undefined && (!Array.isArray(recipientIds) || !recipientIds.every(isUuid))) {
    return { error: fail(400, "recipientIds must be a list of recipient ids.", "invalid_request") };
  }
  try {
    let row = await loadRequest(db, requestId);
    if (!row) return { error: notFound("Signing request not found.") };
    if (row.status !== "pending" || !row.envelope_id) {
      return { error: fail(409, "Only requests that are out for signature can be reminded.", "signing_request_not_pending") };
    }
    const targets = remindTargets(row.signing_recipients, { signingOrder: row.signing_order, recipientIds });
    if (targets.error) return { error: fail(400, targets.error, "nothing_to_remind") };
    let recipients = targets.recipients;
    if (recipients.some((recipient) => recipient.documenso_recipient_id == null)) {
      const envelope = await getEnvelope(row.envelope_id);
      if (envelope) {
        await reconcileRecipients(db, row.signing_recipients, envelope.recipients);
        row = (await loadRequest(db, requestId)) ?? row;
        const ids = new Set(recipients.map((recipient) => recipient.id));
        recipients = (row.signing_recipients || []).filter((recipient) => ids.has(recipient.id));
      }
    }
    const documensoIds = recipients.map((recipient) => recipient.documenso_recipient_id).filter((id) => id != null);
    if (!documensoIds.length || !(await redistributeEnvelope(row.envelope_id, documensoIds))) {
      return { error: fail(502, "Documenso couldn't send the reminder. Try again.", "documenso_failed") };
    }
    return { ok: true };
  } catch (e) {
    return failure("remind", e);
  }
}

export const MISSING_ENVELOPE_ERROR = "The signing request no longer exists in Documenso.";
export const FORCED_CLOSE_ERROR = "Closed without Documenso.";

// Closes an open request as cancelled on our side only (unlocking the document) and notifies. -> the row, or null if already closed.
async function closeLocally(db, row, error, { actorId } = {}) {
  const moved = await transitionRequest(db, row, "cancelled", error ? { error } : {});
  if (moved) after(() => sendNotes(moved, [{ type: "cancelled" }], { actorId }));
  return moved;
}

// Stamps who is cancelling before Documenso is asked, so a DOCUMENT_CANCELLED webhook that wins the race leaves them out.
async function recordCanceller(db, row, actorId) {
  if (!actorId) return;
  check(
    await db
      .from("signing_requests")
      .update({ metadata: { ...(row.metadata || {}), cancelledBy: actorId } })
      .eq("id", row.id),
    "record canceller",
  );
}

// POST /api/signing/requests/[id]/cancel: pending -> Documenso cancel; sending -> closed here (its draft envelope discarded).
// An envelope Documenso no longer has closes locally. force (owner only, Documenso optional) always closes locally.
export async function cancelSigning({ requestId, reason, actorId, force = false, access }) {
  const db = docsDb();
  if (!db) return { error: signingNotConfigured() };
  if (force && access !== "owner") return { error: forbidden() };
  if (!force && !isDocumensoConfigured()) return { error: signingNotConfigured() };
  try {
    const row = await loadRequest(db, requestId);
    if (!row) return { error: notFound("Signing request not found.") };
    if (!isOpenStatus(row.status)) {
      return { error: fail(409, `This request is already ${row.status}.`, "signing_request_closed") };
    }
    await recordCanceller(db, row, actorId);
    const reload = async () => ({ request: normalizeSigningRequest(await loadRequest(db, requestId)) });

    if (force) {
      // Best effort: a confirmed Documenso cancel is a normal cancel; otherwise the error says Documenso wasn't told.
      let confirmed = false;
      if (row.envelope_id && isDocumensoConfigured()) {
        confirmed =
          row.status === "pending"
            ? await cancelEnvelope(row.envelope_id, text(reason))
            : await deleteEnvelope(row.envelope_id);
      }
      await closeLocally(db, row, confirmed ? null : FORCED_CLOSE_ERROR, { actorId });
      return reload();
    }

    if (row.status === "pending" && row.envelope_id) {
      if (!(await cancelEnvelope(row.envelope_id, text(reason)))) {
        const { envelope, missing } = await lookupEnvelope(row.envelope_id);
        if (missing) {
          await closeLocally(db, row, MISSING_ENVELOPE_ERROR, { actorId });
          return reload();
        }
        // Documenso refuses once the envelope has moved on (signed, declined…): catch up and report that instead.
        if (envelope?.status && envelope.status !== "pending") {
          const result = await reconcileRequest(db, row, envelope);
          scheduleFollowUp(result, { actorId });
          return { error: fail(409, `This request is already ${result.row.status}.`, "signing_request_closed") };
        }
        return { error: fail(502, "Documenso couldn't cancel the request. Try again.", "documenso_failed") };
      }
      await closeLocally(db, row, null, { actorId });
    } else {
      const moved = await closeLocally(db, row, null, { actorId });
      if (moved && row.envelope_id) await deleteEnvelope(row.envelope_id);
    }
    return reload();
  } catch (e) {
    return failure("cancel", e);
  }
}

// Stores missing files of a completed request and sends the notifications for what just changed, after the response.
function scheduleFollowUp(result, { event, envelope, actorId } = {}) {
  const { row } = result;
  const cancelledBy = row.metadata?.cancelledBy;
  const notes = signingNotes({ event, status: row.status, transitioned: result.transitioned, flips: result.flips, envelope }).map(
    (note) => (note.type === "cancelled" && cancelledBy ? { ...note, skipUserId: cancelledBy } : note),
  );
  const needsFiles = row.status === "completed" && missingFiles(row);
  if (!notes.length && !needsFiles) return;
  after(async () => {
    if (needsFiles) await storeCompletedFiles(row);
    await sendNotes(row, notes, { actorId });
  });
}

// POST /api/signing/requests/[id]/sync: reconcile with Documenso; a completed request also gets its missing files stored,
// an open one whose envelope Documenso no longer has is closed, and documents.metadata.signing is always rewritten.
export async function syncSigningRequest({ requestId, actorId }) {
  const db = docsDb();
  if (!db || !isDocumensoConfigured()) return { error: signingNotConfigured() };
  try {
    const row = await loadRequest(db, requestId);
    if (!row) return { error: notFound("Signing request not found.") };
    const respond = async (current) => {
      await refreshDocumentSigning(db, current.document_id);
      return { request: normalizeSigningRequest(current) };
    };
    // Nothing to ask Documenso: never created, or closed on our side (its envelope may be gone).
    if (!row.envelope_id || row.status === "cancelled" || row.status === "failed") return respond(row);
    const { envelope, missing } = await lookupEnvelope(row.envelope_id);
    if (missing) {
      // Gone from Documenso: an open request can never finish, so close it; a closed one keeps its outcome.
      await closeLocally(db, row, MISSING_ENVELOPE_ERROR, { actorId });
      return respond((await loadRequest(db, requestId)) ?? row);
    }
    if (!envelope) {
      await refreshDocumentSigning(db, row.document_id);
      return { error: fail(502, "Couldn't reach Documenso. Try again.", "documenso_failed") };
    }
    const result = await reconcileRequest(db, row, envelope);
    let current = result.row;
    if (current.status === "completed" && missingFiles(current)) {
      const stored = await storeCompletedFiles(current);
      if (stored) current = (await loadRequest(db, requestId)) ?? current;
    }
    const notes = signingNotes({ status: current.status, transitioned: result.transitioned, flips: result.flips, envelope });
    if (notes.length) after(() => sendNotes(current, notes, { actorId }));
    return respond(current);
  } catch (e) {
    return failure("sync", e);
  }
}

// Request a webhook envelope belongs to: externalId (our request id) first, then the envelope id; null when it isn't ours.
async function findRequestForEnvelope(db, envelope) {
  if (isUuid(envelope.externalId)) {
    const row = await loadRequest(db, envelope.externalId);
    if (row && (!row.envelope_id || row.envelope_id === envelope.envelopeId)) return row;
  }
  return check(
    await db
      .from("signing_requests")
      .select("*, signing_recipients(*)")
      .eq("envelope_id", envelope.envelopeId)
      .is("deleted_at", null)
      .maybeSingle(),
    "find request",
  );
}

// POST /api/signing/webhook (secret already verified): log once per dedupe key, reconcile, then files + notifications after.
export async function applyWebhookEvent(body) {
  const db = docsDb();
  if (!db) return signingNotConfigured();
  const event = typeof body?.event === "string" ? body.event : "";
  const envelope = normalizeEnvelope(body?.payload);
  if (!event || !envelope?.envelopeId) return fail(400, "Unrecognised webhook payload.", "invalid_payload");
  if (!HANDLED_WEBHOOK_EVENTS.has(event)) return ok({ ok: true, ignored: true });

  let logged = null;
  try {
    const row = await findRequestForEnvelope(db, envelope);
    const inserted = check(
      await db
        .from("signing_events")
        .upsert(
          {
            request_id: row?.id ?? null,
            envelope_id: envelope.envelopeId,
            event,
            dedupe_key: webhookDedupeKey(body),
            payload: redactWebhookBody(body),
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        )
        .select("id"),
      "log event",
    );
    if (!inserted?.length) return ok({ ok: true, duplicate: true });
    logged = inserted[0].id;
    if (!row) return ok({ ok: true, matched: false });

    const result = await reconcileRequest(db, row, envelope, { event });
    scheduleFollowUp(result, { event, envelope });
    return ok({ ok: true });
  } catch (e) {
    console.error("[docs.signing.webhook]", e?.message || e);
    // Forget the event so Documenso's retry is processed rather than skipped as a duplicate.
    if (logged) {
      const { error } = await db.from("signing_events").delete().eq("id", logged);
      if (error) console.error("[docs.signing.webhook] unlog", error.message);
    }
    return fail(500, "Couldn't process the webhook.", "webhook_failed");
  }
}

// POST /api/signing/preview: the saved document rendered with the given recipients. -> { pdf } or { error }.
export async function renderSigningPreview({ document, recipients: input }) {
  const recipients = readRecipients(input);
  const recipientsError = validateRecipients(recipients);
  if (recipientsError) return { error: fail(400, recipientsError, "invalid_recipients") };
  try {
    return { pdf: await renderPdf({ title: document.title, body: document.body, recipients }) };
  } catch (e) {
    console.error("[docs.signing.preview]", e?.message || e);
    return { error: fail(500, "Couldn't render the PDF.", "pdf_failed") };
  }
}

const downloadName = (title, label) =>
  `${String(title || "Document").replace(/[^\p{L}\p{N} ._-]+/gu, "").trim().slice(0, 120) || "Document"} (${label}).pdf`;

// GET /api/signing/requests/[id]/files/[kind]: a 60-second signed URL to a stored file. -> { url } or { error }.
export async function signingFileUrl({ requestId, kind }) {
  const file = Object.hasOwn(FILES, kind) ? FILES[kind] : null;
  if (!file) return { error: notFound("File not found.") };
  const admin = adminClient();
  if (!admin || !isDocumensoConfigured()) return { error: signingNotConfigured() };
  try {
    const row = check(
      await admin
        .schema("docs")
        .from("signing_requests")
        .select(`id, title, ${file.column}`)
        .eq("id", requestId)
        .is("deleted_at", null)
        .maybeSingle(),
      "load file",
    );
    const path = row?.[file.column];
    if (!path) return { error: notFound("This file isn't available yet.") };
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: downloadName(row.title, file.label) });
    if (error || !data?.signedUrl) {
      console.error("[docs.signing.files] sign", error?.message || "no URL");
      return { error: fail(500, "Couldn't open this file. Try again.", "file_url_failed") };
    }
    return { url: data.signedUrl };
  } catch (e) {
    return failure("files", e);
  }
}
