"use client";

import React from "react";
import { Bell } from "lucide-react";
import { Button, SidebarTrigger, Topbar as SuiteTopbar } from "@geiger/ui";
import { NotificationsDropdown } from "./dialogue/notifications_dropdown";
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
        notifications={
          <NotificationsDropdown>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Notifications"
              className="w-8 h-8 rounded-full hover:bg-surface-hover hidden sm:flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <Bell className="w-[18px] h-[18px]" strokeWidth={2} />
            </Button>
          </NotificationsDropdown>
        }
        profile={<ProfileDropdown />}
        activity={<SupabaseActivityLine />}
      />
    </div>
  );
}
