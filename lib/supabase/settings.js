"use client";

import {
  isSupabaseConfigured,
  schemaClient,
} from "@/supabase/components/docs-client";

// Data-access layer for workspace settings: the only place that talks to docs.settings (one row per project).
// Pure: validate, console.error on failure, return null (never throw, never toast).

const TABLE = "settings";

// What a project gets before it has ever saved settings.
export const DEFAULT_SETTINGS = {
  id: null,
  projectId: null,
  defaultShareMode: "workspace",
  allowPublicLinks: true,
};

// DB row -> camelCase view model the screens render directly.
export function normalizeSettings(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    defaultShareMode: row.default_share_mode ?? DEFAULT_SETTINGS.defaultShareMode,
    allowPublicLinks: row.allow_public_links ?? DEFAULT_SETTINGS.allowPublicLinks,
    ...meta,
  };
}

// camelCase patch -> snake_case columns, emitting only keys present in `input`.
function toRow(input) {
  const row = {};
  if ("defaultShareMode" in input) {
    row.default_share_mode =
      input.defaultShareMode || DEFAULT_SETTINGS.defaultShareMode;
  }
  if ("allowPublicLinks" in input) {
    row.allow_public_links = Boolean(input.allowPublicLinks);
  }
  // Empty-string uuids -> null so the uuid columns stay valid.
  const ids = { projectId: "project_id", createdBy: "created_by" };
  for (const [key, col] of Object.entries(ids)) {
    if (key in input) row[col] = input[key] || null;
  }
  return row;
}

// A project's settings; defaults when it has no row yet, null when unconfigured or the read fails.
export async function getSettings(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) {
      console.error("[docs.settings.get]", error.message);
      return null;
    }
    return data ? normalizeSettings(data) : { ...DEFAULT_SETTINGS, projectId };
  } catch (e) {
    console.error("[docs.settings.get]", e);
    return null;
  }
}

// Upsert the project's row on project_id and return it normalized; null on failure (RLS: project members only).
export async function saveSettings(projectId, patch) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .upsert(
        { ...toRow(patch ?? {}), project_id: projectId },
        { onConflict: "project_id" },
      )
      .select("*")
      .single();
    if (error) {
      console.error("[docs.settings.save]", error.message);
      return null;
    }
    return normalizeSettings(data);
  } catch (e) {
    console.error("[docs.settings.save]", e);
    return null;
  }
}
