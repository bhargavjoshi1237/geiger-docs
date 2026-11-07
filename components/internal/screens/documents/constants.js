import { Globe, Lock, Users } from "lucide-react";

// Lookups and formatters for the documents area (config only, never row data).

export const DOCUMENT_STATUSES = ["Draft", "In review", "Published", "Archived"];

export const DOCUMENT_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-muted-foreground" },
  "In review": { label: "In review", variant: "warning", dotClass: "bg-amber-400" },
  Published: { label: "Published", variant: "success", dotClass: "bg-emerald-400" },
  Archived: { label: "Archived", variant: "outline", dotClass: "bg-text-tertiary" },
};

export const SHARE_MODES = ["workspace", "public", "restricted"];

export const SHARE_MODE_MAP = {
  workspace: {
    label: "Workspace",
    description: "Everyone in this project can view and edit.",
    icon: Users,
    variant: "neutral",
  },
  public: {
    label: "Public link",
    description: "Anyone with the link can view a read-only copy.",
    icon: Globe,
    variant: "info",
  },
  restricted: {
    label: "Specific people",
    description: "Only the people you add, with the role you give them.",
    icon: Lock,
    variant: "purple",
  },
};

export const MEMBER_ROLES = ["viewer", "commenter", "editor"];

export const MEMBER_ROLE_MAP = {
  viewer: { label: "Viewer", description: "Can read the document." },
  commenter: { label: "Commenter", description: "Can read and comment." },
  editor: { label: "Editor", description: "Can read, comment and edit." },
};

export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...DOCUMENT_STATUSES.map((status) => ({ value: status, label: status })),
];

export const SHARE_FILTER_OPTIONS = [
  { value: "all", label: "All sharing" },
  ...SHARE_MODES.map((mode) => ({ value: mode, label: SHARE_MODE_MAP[mode].label })),
];

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatRelative(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

// Absolute link to the read-only public page (honors the /docs base path in production).
export function publicDocumentUrl(id) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${base}/d/${id}`;
}

export function wordCount(body) {
  const words = String(body || "").trim().match(/\S+/g);
  return words ? words.length : 0;
}
