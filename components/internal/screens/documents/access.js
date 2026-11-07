// Document access (UI-enforced only; RLS stays demo-open): "owner" | "editor" | "commenter" | "viewer" | "none".

const MEMBER_ACCESS = new Set(["viewer", "commenter", "editor"]);

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

export function resolveDocumentAccess(doc, user, members) {
  if (!doc) return "none";
  // No signed-in user (auth not wired) keeps the workspace fully usable.
  if (!user) return "editor";
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
