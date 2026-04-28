import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";

// Sidebar title -> URL slug: lowercased with non-alphanumerics dropped ("Documents" -> "documents").
export function tabToSlug(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const SLUG_TO_TAB = new Map(
  workspaceNav.map((item) => [tabToSlug(item.title), item.title]),
);

// URL slug -> exact sidebar title (the registry key), or null when no nav entry matches.
export function slugToTab(slug) {
  if (!slug) return null;
  return SLUG_TO_TAB.get(String(slug).toLowerCase()) || null;
}
