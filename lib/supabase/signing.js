"use client";

import {
  isSupabaseConfigured,
  schemaClient,
} from "@/supabase/components/docs-client";

// Read-only data layer for signing: docs.signing_requests with embedded docs.signing_recipients.
// Writes go through the /api/signing/* route handlers (no client write policies); this file never inserts or updates.
// Pure: console.error on failure, return null / [] (never throw, never toast).

const TABLE = "signing_requests";

// DB recipient row -> camelCase view model; signing tokens/URLs are never stored, so none are exposed.
export function normalizeSigningRecipient(row) {
  if (!row) return null;
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

// DB request row (+ signing_recipients embed) -> the `request` view model the API routes also return.
export function normalizeSigningRequest(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const recipients = (Array.isArray(row.signing_recipients) ? row.signing_recipients : [])
    .filter((recipient) => recipient && !recipient.deleted_at)
    .map(normalizeSigningRecipient)
    .sort((a, b) => a.position - b.position);
  return {
    // Expansion-bag keys first so the contract fields below always win.
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

// A document's live signing requests, newest first, each with its recipients in position order.
export async function listSigningRequests(documentId) {
  if (!documentId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*, signing_recipients(*)")
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("position", { referencedTable: "signing_recipients", ascending: true });
    if (error) {
      console.error("[docs.signing.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeSigningRequest);
  } catch (e) {
    console.error("[docs.signing.list]", e);
    return null;
  }
}
