// Document access for the UI: "owner" | "editor" | "commenter" | "viewer" | "none"; docs.document_access() is the source of truth and this mirrors it.

const MEMBER_ACCESS = new Set(["viewer", "commenter", "editor"]);

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

export function resolveDocumentAccess(doc, user, members) {
  if (!doc) return "none";
  // The workspace is gated, so a missing session means no access.
  if (!user) return "none";
  const isCreator = Boolean(doc.createdBy) && doc.createdBy === user.id;
  if (doc.shareMode !== "restricted") return isCreator ? "owner" : "editor";
  if (isCreator) return "owner";
  const email = normalizeEmail(user.email);
  if (!email) return "none";
  const member = (members || []).find((m) => normalizeEmail(m.email) === email);
  return member && MEMBER_ACCESS.has(member.role) ? member.role : "none";
}

export function canEdit(access) {
  return access === "owner" || access === "editor";
}

export function canComment(access) {
  return canEdit(access) || access === "commenter";
}

export const ACCESS_LABELS = {
  owner: "Owner",
  editor: "Can edit",
  commenter: "Can comment",
  viewer: "View only",
  none: "No access",
};
