"use client";

import React, { Suspense, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ProjectSidebar } from "@/components/internal/sidebar/projects/project_sidebar";
import { ProjectTopbar } from "@/components/internal/topbar/projects/topbar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { PlaceholderScreen } from "@/components/internal/screens/placeholder_screen";
import { projectNav } from "@/components/internal/sidebar/projects/sidebar_data";

function HomeLayoutContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const screenParamKeys = [];
  searchParams.forEach((_, key) => { screenParamKeys.push(key); });
  const currentTab = screenParamKeys[0] || projectNav[0].title;

  const setCurrentTab = useCallback(
    (tab) => {
      if (tab === projectNav[0].title) {
        router.push(pathname, { scroll: false });
      } else {
        router.push(`${pathname}?${encodeURIComponent(tab)}`, { scroll: false });
      }
    },
    [router, pathname],
  );

  const activeItem =
    projectNav.find((item) => item.title === currentTab) || projectNav[0];

  return (
    <div className="flex-col h-[100dvh] w-full bg-background text-foreground font-sans overflow-hidden selection:bg-surface-strong flex">
      <SidebarProvider
        className="flex-col !flex h-full min-w-0"
        style={{ flexDirection: "column" }}
      >
        <ProjectTopbar name="Docs" />
        <div className="flex flex-1 overflow-hidden relative">
          <ProjectSidebar activeTab={currentTab} onTabChange={setCurrentTab} />
          <SidebarInset className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative border-none">
            <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-white/[0.02] blur-[120px] pointer-events-none rounded-full" />
            <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 w-full min-w-0">
              <PlaceholderScreen title={activeItem.title} icon={activeItem.icon} />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-[100dvh] w-full bg-background items-center justify-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-border-strong border-t-[#e7e7e7] animate-spin" />
          <span className="text-text-tertiary text-sm">Loading...</span>
        </div>
      }
    >
      <HomeLayoutContent />
    </Suspense>
  );
}
