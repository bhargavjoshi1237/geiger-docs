"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ComingSoonScreen } from "@/components/internal/screens/coming_soon";
import { getScreen } from "@/components/internal/screens/registry";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject, pickDefaultProjectId } from "@/context/project-context";
import { LoadingArea, NoProjectsState } from "@/components/internal/workspace/workspace_states";

function ScreenArea({ activeItem, Screen }) {
  const router = useRouter();
  const { project, projects, loading } = useProject();

  // Unknown project id in the URL -> fall back to a project the user has.
  useEffect(() => {
    if (loading || project) return;
    const fallback = pickDefaultProjectId(projects);
    if (fallback) router.replace(`/project/${fallback}`);
  }, [loading, project, projects, router]);

  if (loading) return <LoadingArea />;
  if (projects.length === 0) return <NoProjectsState />;
  if (!project) return <LoadingArea />;

  return (
    <div key={project.id} className="h-full">
      {Screen ? <Screen /> : <ComingSoonScreen title={activeItem.title} icon={activeItem.icon} />}
    </div>
  );
}

export default function ProjectWorkspacePage() {
  const { tab } = useWorkspaceUrl();
  const activeItem = workspaceNav.find((item) => item.title === tab) || workspaceNav[0];

  return <ScreenArea activeItem={activeItem} Screen={getScreen(tab)} />;
}
