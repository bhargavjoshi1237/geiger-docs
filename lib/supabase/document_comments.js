"use client";

import {
  isSupabaseConfigured,
  schemaClient,
} from "@/supabase/components/docs-client";
import { getUser } from "@/lib/supabase/user";

// Data-access layer for document comments: the only place that talks to docs.document_comments.
// Pure: validate, console.error on failure, return null / false / [] (never throw, never toast).

const TABLE = "document_comments";

// DB row -> camelCase view model the screens render directly.
export function normalizeDocumentComment(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    documentId: row.document_id ?? null,
    body: row.body ?? "",
    authorName: row.author_name ?? "",
    authorEmail: row.author_email ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

// camelCase input -> snake_case columns, emitting only keys present in `input`.
function toRow(input) {
  const row = {};
  if ("body" in input) row.body = input.body ?? "";
  if ("authorName" in input) row.author_name = input.authorName ?? "";
  if ("authorEmail" in input) row.author_email = input.authorEmail ?? "";
  // Empty-string uuids -> null so the uuid columns stay valid.
  const ids = { documentId: "document_id", createdBy: "created_by" };
  for (const [key, col] of Object.entries(ids)) {
    if (key in input) row[col] = input[key] || null;
  }
  return row;
}

// A document's live comment thread, oldest first.
export async function listDocumentComments(documentId) {
  if (!documentId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[docs.document_comments.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeDocumentComment);
  } catch (e) {
    console.error("[docs.document_comments.list]", e);
    return null;
  }
}

// Post a comment (non-blank body required), honoring a caller-supplied `id` for the optimistic row.
export async function createDocumentComment(input) {
  if (!input?.documentId || !String(input.body ?? "").trim()) return null;
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    // The insert policy requires created_by = auth.uid(), so always stamp the session user.
    const user = await getUser();
    const payload = toRow({ ...input, createdBy: user?.id ?? input.createdBy });
    if (input.id) payload.id = input.id;
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[docs.document_comments.create]", error.message);
      return null;
    }
    return normalizeDocumentComment(data);
  } catch (e) {
    console.error("[docs.document_comments.create]", e);
    return null;
  }
}

// Soft delete: sets deleted_at; the thread filters it out. False when RLS let no row through (author or doc owner only).
export async function softDeleteDocumentComment(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) {
      console.error("[docs.document_comments.delete]", error.message);
      return false;
    }
    if (!data?.length) {
      console.error("[docs.document_comments.delete]", "no row updated (missing or not allowed)");
      return false;
    }
    return true;
  } catch (e) {
    console.error("[docs.document_comments.delete]", e);
    return false;
  }
}
