"use client";

import {
  isSupabaseConfigured,
  schemaClient,
} from "@/supabase/components/docs-client";

// Data-access layer for Documents: the only place that talks to docs.documents.
// Pure: validate, console.error on failure, return null / false / [] (never throw, never toast).

const TABLE = "documents";

// DB row -> camelCase view model the screens render directly.
export function normalizeDocument(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    collectionId: row.collection_id ?? null,
    title: row.title ?? "Untitled",
    body: row.body ?? "",
    status: row.status ?? "Draft",
    shareMode: row.share_mode ?? "workspace",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    // Expansion-bag keys surface as first-class fields on the view model.
    ...meta,
  };
}

// camelCase patch -> snake_case columns, emitting only keys present in `input` (full save or inline edit).
function toRow(input) {
  const row = {};
  const map = { status: "status", shareMode: "share_mode" };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("title" in input) row.title = input.title ?? "";
  if ("body" in input) row.body = input.body ?? "";
  // Empty-string uuids -> null so the uuid columns stay valid.
  const ids = {
    projectId: "project_id",
    collectionId: "collection_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(ids)) {
    if (key in input) row[col] = input[key] || null;
  }
  return row;
}

// Live documents in a project, most recently updated first.
export async function listDocuments(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[docs.documents.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeDocument);
  } catch (e) {
    console.error("[docs.documents.list]", e);
    return null;
  }
}

export async function getDocument(id) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[docs.documents.get]", error.message);
      return null;
    }
    return normalizeDocument(data);
  } catch (e) {
    console.error("[docs.documents.get]", e);
    return null;
  }
}

// Insert, honoring a caller-supplied `id` so the optimistic row and the DB row share a UUID.
export async function createDocument(input) {
  if (!input?.projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const payload = toRow(input);
    if (input.id) payload.id = input.id;
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[docs.documents.create]", error.message);
      return null;
    }
    return normalizeDocument(data);
  } catch (e) {
    console.error("[docs.documents.create]", e);
    return null;
  }
}

export async function updateDocument(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .update(toRow(patch ?? {}))
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[docs.documents.update]", error.message);
      return null;
    }
    return normalizeDocument(data);
  } catch (e) {
    console.error("[docs.documents.update]", e);
    return null;
  }
}

// Soft delete: sets deleted_at; lists filter it out.
export async function softDeleteDocument(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = schemaClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[docs.documents.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[docs.documents.delete]", e);
    return false;
  }
}
