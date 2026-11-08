"use client";

import React from "react";
import { SidebarTrigger, Topbar as SuiteTopbar } from "@geiger/ui";
import { NotificationsBell } from "./dialogue/notifications_bell";
import { ProfileDropdown } from "./dialogue/profile_dropdown";
import { SupabaseActivityLine } from "./supabase_activity_line";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useVisibleNav } from "@/lib/hooks/use-visible-nav";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function Topbar() {
  const { setTab } = useWorkspaceUrl();
  const visibleNav = useVisibleNav();

  return (
    <div className="relative z-20 w-full shrink-0">
      <SuiteTopbar
        label="Docs"
        logoSrc={`${BASE_PATH}/logo1.svg`}
        homeHref={BASE_PATH || "/"}
        searchPlaceholder="Search Docs..."
        searchNav={visibleNav}
        searchRecentsKey="geiger:docs:search-recents"
        onSearchSelect={(item) => setTab(item.title)}
        sidebarTrigger={<SidebarTrigger className="md:hidden -ml-2 text-foreground" />}
        notifications={<NotificationsBell />}
        profile={<ProfileDropdown />}
        activity={<SupabaseActivityLine />}
      />
    </div>
  );
}
