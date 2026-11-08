"use client";

import {
  isSupabaseConfigured,
  schemaClient,
} from "@/supabase/components/docs-client";
import { getUser } from "@/lib/supabase/user";

// Data-access layer for document history: the only place that talks to docs.document_versions.
// Pure: validate, console.error on failure, return null / false / [] (never throw, never toast).

const TABLE = "document_versions";

// DB row -> camelCase view model the screens render directly.
export function normalizeDocumentVersion(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    documentId: row.document_id ?? null,
    versionNumber: Number(row.version_number ?? 0),
    title: row.title ?? "",
    body: row.body ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

// camelCase input -> snake_case columns, emitting only keys present in `input`.
function toRow(input) {
  const row = {};
  if ("title" in input) row.title = input.title ?? "";
  if ("body" in input) row.body = input.body ?? "";
  if ("versionNumber" in input) {
    row.version_number = Number(input.versionNumber) || 0;
  }
  // Empty-string uuids -> null so the uuid columns stay valid.
  const ids = { documentId: "document_id", createdBy: "created_by" };
  for (const [key, col] of Object.entries(ids)) {
    if (key in input) row[col] = input[key] || null;
  }
  return row;
}

// A document's live versions, newest first.
export async function listDocumentVersions(documentId) {
  if (!documentId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .order("version_number", { ascending: false });
    if (error) {
      console.error("[docs.document_versions.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeDocumentVersion);
  } catch (e) {
    console.error("[docs.document_versions.list]", e);
    return null;
  }
}

// Snapshot a document as the next version_number (max over all rows, soft-deleted included, + 1).
export async function createDocumentVersion(input) {
  if (!input?.documentId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data: latest, error: readError } = await sb
      .from(TABLE)
      .select("version_number")
      .eq("document_id", input.documentId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) {
      console.error("[docs.document_versions.create]", readError.message);
      return null;
    }
    const user = await getUser();
    const payload = toRow({
      documentId: input.documentId,
      title: input.title,
      body: input.body,
      createdBy: user?.id ?? input.createdBy,
      versionNumber: Number(latest?.version_number ?? 0) + 1,
    });
    if (input.id) payload.id = input.id;
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[docs.document_versions.create]", error.message);
      return null;
    }
    return normalizeDocumentVersion(data);
  } catch (e) {
    console.error("[docs.document_versions.create]", e);
    return null;
  }
}
