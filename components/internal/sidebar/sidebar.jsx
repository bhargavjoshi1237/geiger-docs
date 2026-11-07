"use client";

import React from "react";
import { PanelLeft } from "lucide-react";
import {
  Button,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  useSidebar,
} from "@geiger/ui";
import { SidebarOption } from "./sidebar_option";
import { useVisibleNav } from "@/lib/hooks/use-visible-nav";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

function MobileSidebarHeader() {
  const { isMobile } = useSidebar();
  if (!isMobile) return null;

  return (
    <SidebarHeader className="p-0 border-b border-sidebar-border">
      <div className="flex items-center gap-2 px-4 h-14">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE_PATH}/logo1.svg`} alt="" className="w-5 h-5" />
        <span className="text-foreground font-semibold text-sm truncate">Docs</span>
      </div>
    </SidebarHeader>
  );
}

export function AppSidebar({ activeTab = "Overview", onTabChange = () => {} }) {
  const { toggleSidebar } = useSidebar();
  const visibleNav = useVisibleNav();

  return (
    <Sidebar
      collapsible="icon"
      className="bg-sidebar border-r border-sidebar-border text-sidebar-foreground"
    >
      <MobileSidebarHeader />
      <SidebarContent className="relative flex-1 overflow-y-auto overflow-x-hidden bg-sidebar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNav.map((item) => (
                <SidebarOption
                  key={item.title}
                  title={item.title}
                  icon={item.icon}
                  isActive={activeTab === item.title}
                  onClick={() => onTabChange(item.title)}
                  badge={item.badge}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t border-sidebar-border mt-auto z-10 bg-sidebar">
        <Button
          type="button"
          variant="ghost"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          className="flex items-center gap-3 p-2 w-full rounded-lg hover:bg-sidebar-accent transition-all text-sidebar-foreground hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
        >
          <PanelLeft className="w-5 h-5 shrink-0" />
        </Button>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
