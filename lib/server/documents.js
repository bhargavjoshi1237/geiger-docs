import "server-only";
import { getSessionUser, sessionClient } from "@/lib/server/supabase";
import { fail, forbidden, notFound, unauthorized } from "@/lib/server/http";

// Route-handler guard for one document: docs.document_access() decides, and the row is read under the caller's RLS.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Access levels that satisfy each `need` ("read" is any access); an unknown need fails closed as "edit".
const ALLOWED = {
  comment: ["owner", "editor", "commenter"],
  edit: ["owner", "editor"],
};

function satisfies(access, need) {
  if (need === "read") return Boolean(access);
  return (ALLOWED[need] ?? ALLOWED.edit).includes(access);
}

// docs.documents row -> camelCase view model; mirrors normalizeDocument in lib/supabase/documents.js, which is "use client".
export function normalizeDocumentRow(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
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
    // Expansion-bag keys (e.g. signing) surface as first-class fields.
    ...meta,
  };
}

const checkFailed = () => fail(500, "Couldn't check access to this document.", "access_check_failed");

// The signed-in caller's live document: { user, document, access } or { error: Response } (401 / 404 / 403, 500 / 503 on server faults).
export async function requireDocument(id, { need = "read" } = {}) {
  const sb = await sessionClient();
  if (!sb) return { error: fail(503, "Supabase isn't configured.", "supabase_not_configured") };
  const user = await getSessionUser(sb);
  if (!user) return { error: unauthorized() };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: notFound("Document not found.") };
  try {
    const docs = sb.schema("docs");
    const [accessRes, rowRes] = await Promise.all([
      docs.rpc("document_access", { p_document: id }),
      docs.from("documents").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    ]);
    const error = accessRes.error || rowRes.error;
    if (error) {
      console.error("[docs.documents.require]", error.message);
      return { error: checkFailed() };
    }
    const access = accessRes.data ?? null;
    if (!access || !rowRes.data) return { error: notFound("Document not found.") };
    if (!satisfies(access, need)) return { error: forbidden() };
    return { user, access, document: normalizeDocumentRow(rowRes.data) };
  } catch (e) {
    console.error("[docs.documents.require]", e?.message || e);
    return { error: checkFailed() };
  }
}
