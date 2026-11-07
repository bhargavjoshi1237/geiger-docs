import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";

export function tabToSlug(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const SLUG_TO_TAB = new Map(
  workspaceNav.map((item) => [tabToSlug(item.title), item.title]),
);

export function slugToTab(slug) {
  if (!slug) return null;
  return SLUG_TO_TAB.get(String(slug).toLowerCase()) || null;
}
