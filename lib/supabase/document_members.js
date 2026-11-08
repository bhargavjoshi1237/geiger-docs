"use client";

import {
  isSupabaseConfigured,
  schemaClient,
} from "@/supabase/components/docs-client";
import { getUser } from "@/lib/supabase/user";

// Data-access layer for restricted-document access: the only place that talks to docs.document_members.
// Pure: validate, console.error on failure, return null / false / [] (never throw, never toast).

const TABLE = "document_members";

// DB row -> camelCase view model the screens render directly.
export function normalizeDocumentMember(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    documentId: row.document_id ?? null,
    email: row.email ?? "",
    role: row.role ?? "viewer",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

// camelCase patch -> snake_case columns, emitting only keys present in `input` (e.g. `{ role }`).
function toRow(input) {
  const row = {};
  if ("role" in input) row.role = input.role || "viewer";
  if ("email" in input) row.email = String(input.email ?? "").trim().toLowerCase();
  // Empty-string uuids -> null so the uuid columns stay valid.
  const ids = { documentId: "document_id", createdBy: "created_by" };
  for (const [key, col] of Object.entries(ids)) {
    if (key in input) row[col] = input[key] || null;
  }
  return row;
}

// A document's live members, oldest grant first.
export async function listDocumentMembers(documentId) {
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
      console.error("[docs.document_members.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeDocumentMember);
  } catch (e) {
    console.error("[docs.document_members.list]", e);
    return null;
  }
}

// Add or re-add a person by email, reviving a removed row; ignores caller ids (an upsert would rewrite the PK).
// RLS: the caller must be able to edit the document (both the insert and the on-conflict update check it).
export async function upsertDocumentMember(input) {
  const email = String(input?.email ?? "").trim().toLowerCase();
  if (!input?.documentId || !email || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const user = await getUser();
    const payload = {
      ...toRow({
        documentId: input.documentId,
        email,
        role: input.role,
        createdBy: user?.id ?? input.createdBy,
      }),
      deleted_at: null,
    };
    const { data, error } = await sb
      .from(TABLE)
      .upsert(payload, { onConflict: "document_id,email" })
      .select("*")
      .single();
    if (error) {
      console.error("[docs.document_members.upsert]", error.message);
      return null;
    }
    return normalizeDocumentMember(data);
  } catch (e) {
    console.error("[docs.document_members.upsert]", e);
    return null;
  }
}

export async function updateDocumentMember(id, patch) {
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
      console.error("[docs.document_members.update]", error.message);
      return null;
    }
    return normalizeDocumentMember(data);
  } catch (e) {
    console.error("[docs.document_members.update]", e);
    return null;
  }
}

// Soft remove: sets deleted_at; re-adding the same email revives the row via upsert. False when RLS let no row through.
export async function removeDocumentMember(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) {
      console.error("[docs.document_members.remove]", error.message);
      return false;
    }
    if (!data?.length) {
      console.error("[docs.document_members.remove]", "no row updated (missing or not allowed)");
      return false;
    }
    return true;
  } catch (e) {
    console.error("[docs.document_members.remove]", e);
    return false;
  }
}
