"use client";

import React, { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { PanelLeft } from "lucide-react";
import { SidebarOption } from "../sidebar_option";
import { projectNav, settingsNav } from "./sidebar_data";
import { Button } from "@/components/ui/button";

function MobileSidebarHeader() {
  const { isMobile } = useSidebar();

  if (!isMobile) {
    return null;
  }

  return (
    <SidebarHeader className="p-0 border-b border-sidebar-border">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded flex items-center justify-center shrink-0">
            <img
              src="/logo1.svg"
              alt=""
              className="w-5 h-5"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.parentElement.innerHTML =
                  '<div class="w-2 h-2 bg-foreground rounded-full"></div>';
              }}
            />
          </div>
          <span className="text-foreground font-semibold text-sm truncate max-w-full">
            Docs
          </span>
        </div>
      </div>
    </SidebarHeader>
  );
}

export function ProjectSidebar({ activeTab = "Overview", onTabChange = () => {} }) {
  const { toggleSidebar } = useSidebar();
  const [expandedItems, setExpandedItems] = useState({});
  const visibleProjectNav = projectNav.filter((item) => item.title !== "Data");

  const toggleExpand = (title) => {
    setExpandedItems((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  return (
    <Sidebar
      collapsible="icon"
      className="bg-sidebar border-r border-sidebar-border text-sidebar-foreground"
    >
      <MobileSidebarHeader />
      <SidebarContent className="space-y-2 relative flex-1 overflow-hidden bg-sidebar">
        <div className="absolute inset-0 w-full h-full bg-sidebar translate-x-0">
          <div className="h-full overflow-y-auto overflow-x-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleProjectNav.map((item) => (
                    <SidebarOption
                      key={item.title}
                      title={item.title}
                      icon={item.icon}
                      isActive={activeTab === item.title}
                      subItems={item.hasSubmenu ? settingsNav : item.subItems || null}
                      isExpanded={
                        expandedItems[item.title] !== undefined
                          ? expandedItems[item.title]
                          : !!(item.hasSubmenu
                              ? settingsNav
                              : item.subItems
                            )?.find((s) => s.title === activeTab)
                      }
                      onToggle={() => toggleExpand(item.title)}
                      activeSubTab={activeTab}
                      onClick={(tabTitle) => {
                        if (tabTitle && typeof tabTitle === "string") {
                          onTabChange(tabTitle);
                        } else if (item.hasSubmenu || item.subItems) {
                          toggleExpand(item.title);
                        } else {
                          setExpandedItems({});
                          onTabChange(item.title);
                        }
                      }}
                      badge={item.badge}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        </div>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t border-sidebar-border mt-auto z-10 bg-sidebar">
        <Button
          type="button"
          variant="ghost"
          onClick={toggleSidebar}
          className="flex items-center gap-3 p-2 w-full rounded-lg hover:bg-sidebar-accent transition-all text-sidebar-foreground hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
        >
          <PanelLeft className="w-5 h-5 shrink-0" />
        </Button>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
