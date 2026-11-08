"use client";

import {
  isSupabaseConfigured,
  schemaClient,
} from "@/supabase/components/docs-client";
import { getUser } from "@/lib/supabase/user";

// Data-access layer for Templates: the only place that talks to docs.templates.
// Pure: validate, console.error on failure, return null / false / [] (never throw, never toast).

const TABLE = "templates";

// DB row -> camelCase view model the screens render directly.
export function normalizeTemplate(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    description: row.description ?? "",
    category: row.category ?? "General",
    body: row.body ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    ...meta,
  };
}

// camelCase patch -> snake_case columns, emitting only keys present in `input` (full save or inline edit).
function toRow(input) {
  const row = {};
  if ("name" in input) row.name = input.name ?? "";
  if ("description" in input) row.description = input.description ?? "";
  if ("category" in input) row.category = input.category || "General";
  if ("body" in input) row.body = input.body ?? "";
  // Empty-string uuids -> null so the uuid columns stay valid.
  const ids = { projectId: "project_id", createdBy: "created_by" };
  for (const [key, col] of Object.entries(ids)) {
    if (key in input) row[col] = input[key] || null;
  }
  return row;
}

// Live templates in a project, alphabetical.
export async function listTemplates(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) {
      console.error("[docs.templates.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeTemplate);
  } catch (e) {
    console.error("[docs.templates.list]", e);
    return null;
  }
}

// Insert, honoring a caller-supplied `id` so the optimistic row and the DB row share a UUID.
export async function createTemplate(input) {
  if (!input?.projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const user = await getUser();
    const payload = toRow({ ...input, createdBy: user?.id ?? input.createdBy });
    if (input.id) payload.id = input.id;
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[docs.templates.create]", error.message);
      return null;
    }
    return normalizeTemplate(data);
  } catch (e) {
    console.error("[docs.templates.create]", e);
    return null;
  }
}

export async function updateTemplate(id, patch) {
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
      console.error("[docs.templates.update]", error.message);
      return null;
    }
    return normalizeTemplate(data);
  } catch (e) {
    console.error("[docs.templates.update]", e);
    return null;
  }
}

// Soft delete: sets deleted_at; lists filter it out. False when RLS let no row through.
export async function softDeleteTemplate(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) {
      console.error("[docs.templates.delete]", error.message);
      return false;
    }
    if (!data?.length) {
      console.error("[docs.templates.delete]", "no row updated (missing or not allowed)");
      return false;
    }
    return true;
  } catch (e) {
    console.error("[docs.templates.delete]", e);
    return false;
  }
}
