"use client";

import { OverviewScreen } from "@/components/internal/screens/overview/docs_overview";
import { DocumentsScreen } from "@/components/internal/screens/documents/all_documents";
import { CollectionsScreen } from "@/components/internal/screens/collections/all_collections";
import { TemplatesScreen } from "@/components/internal/screens/templates/all_templates";
import { SharedScreen } from "@/components/internal/screens/shared/shared_documents";
import { SettingsScreen } from "@/components/internal/screens/settings/docs_settings";

// Sidebar title -> screen; keys must match sidebar_nav.jsx exactly. Unlisted titles render ComingSoonScreen.
export const SCREEN_REGISTRY = {
  Overview: OverviewScreen,
  Documents: DocumentsScreen,
  Collections: CollectionsScreen,
  Templates: TemplatesScreen,
  Shared: SharedScreen,
  Settings: SettingsScreen,
};

export function getScreen(title) {
  return SCREEN_REGISTRY[title] || null;
}
