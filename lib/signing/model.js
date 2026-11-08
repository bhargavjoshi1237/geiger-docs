// Signing vocabulary shared by the server, the data layer and the UI (isomorphic: no imports, no side effects).

export const SIGNING_STATUSES = ["sending", "pending", "completed", "declined", "cancelled", "failed"];
// Still in flight; at most one open request per document (enforced by a partial unique index).
export const OPEN_SIGNING_STATUSES = ["sending", "pending"];
// Title and body are read-only while a request is open and after it completes (enforced by a DB trigger).
export const LOCKING_SIGNING_STATUSES = [...OPEN_SIGNING_STATUSES, "completed"];

export const SIGNING_ORDERS = ["parallel", "sequential"];
export const RECIPIENT_ROLES = ["signer", "approver", "cc"];
export const READ_STATUSES = ["not_opened", "opened"];
export const RECIPIENT_SIGNING_STATUSES = ["not_signed", "signed", "declined"];
export const MAX_RECIPIENTS = 10;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isOpenStatus = (status) => OPEN_SIGNING_STATUSES.includes(status);
export const isLockingStatus = (status) => LOCKING_SIGNING_STATUSES.includes(status);
export const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

// Recipients in position order ([{ name, email, role }]) -> first problem as a user-facing message, or null.
export function validateRecipients(recipients) {
  const list = Array.isArray(recipients) ? recipients : [];
  if (list.length === 0) return "Add at least one recipient.";
  if (list.length > MAX_RECIPIENTS) return `You can add up to ${MAX_RECIPIENTS} recipients.`;
  const seen = new Set();
  for (const [index, recipient] of list.entries()) {
    const label = `Recipient ${index + 1}`;
    const email = normalizeEmail(recipient?.email);
    if (!String(recipient?.name || "").trim()) return `${label} needs a name.`;
    if (!EMAIL_PATTERN.test(email)) return `${label} needs a valid email address.`;
    if (!RECIPIENT_ROLES.includes(recipient?.role)) return `${label} needs a role.`;
    if (seen.has(email)) return `${email} is added more than once.`;
    seen.add(email);
  }
  if (!list.some((recipient) => recipient.role === "signer")) return "Add at least one signer.";
  return null;
}
