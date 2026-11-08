import { defineNotificationTypes } from "@geiger/notify";

// Isomorphic: shared by the browser sender (./client.js) and the server sender (lib/server/notifications.js).

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

const ROLE_PHRASES = {
  viewer: "You can view it.",
  commenter: "You can view and comment.",
  editor: "You can view, comment and edit.",
};

// Deep link to a document tab: <base>/project/<projectId>/documents?doc=<id>&section=<section>.
export function documentUrl({ projectId, documentId } = {}, section) {
  if (!projectId || !documentId) return undefined;
  const query = new URLSearchParams({ doc: documentId, section });
  return `${BASE_PATH}/project/${projectId}/documents?${query}`;
}

const linkTo = (section) => (d) => documentUrl(d, section);
const titleOf = (d) => d.documentTitle || "a document";
const signerOf = (d) => d.recipientName || "A recipient";
const signingThread = (d) => `document:${d.documentId}:signing`;

// Every notification Docs sends, declared once; send by key via ./client.js or lib/server/notifications.js.
export const DOCS_NOTIFICATION_TYPES = defineNotificationTypes({
  "docs.comment.created": {
    category: "comment",
    icon: "MessageSquare",
    tone: "info",
    title: (d) => `New comment on ${titleOf(d)}`,
    body: (d) => d.excerpt,
    url: linkTo("comments"),
    groupKey: (d) => `document:${d.documentId}:comments`,
  },
  "docs.document.shared": {
    category: "invite",
    icon: "UserPlus",
    tone: "info",
    title: (d) => (d.documentTitle ? `${d.documentTitle} was shared with you` : "A document was shared with you"),
    body: (d) => ROLE_PHRASES[d.role],
    url: linkTo("sharing"),
  },
  "docs.signing.signed": {
    category: "update",
    icon: "Signature",
    tone: "info",
    title: (d) => `${signerOf(d)} signed ${titleOf(d)}`,
    url: linkTo("signing"),
    groupKey: signingThread,
  },
  "docs.signing.completed": {
    category: "update",
    icon: "FileCheck2",
    tone: "success",
    title: (d) => `${d.documentTitle || "A document"} is fully signed`,
    body: "Everyone has signed. The signed PDF is ready to download.",
    url: linkTo("signing"),
    groupKey: signingThread,
  },
  "docs.signing.declined": {
    category: "alert",
    icon: "FileX2",
    tone: "danger",
    priority: "high",
    title: (d) => `${signerOf(d)} declined to sign ${titleOf(d)}`,
    body: "The request is closed and the document can be edited again.",
    url: linkTo("signing"),
    groupKey: signingThread,
  },
  "docs.signing.cancelled": {
    category: "update",
    icon: "Ban",
    tone: "warning",
    title: (d) => `Signing was cancelled for ${titleOf(d)}`,
    body: "The document can be edited again.",
    url: linkTo("signing"),
    groupKey: signingThread,
  },
  "docs.signing.expired": {
    category: "alert",
    icon: "TimerOff",
    tone: "warning",
    title: (d) => `Signing expired for ${titleOf(d)}`,
    body: (d) => `${signerOf(d)} can no longer sign. Send a new request if you still need it.`,
    url: linkTo("signing"),
    groupKey: signingThread,
  },
});
