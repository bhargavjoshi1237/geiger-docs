"use client";

import React, { useState } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { Button, EmptyState } from "@geiger/ui";
import { CreateProjectDialog } from "./create_project_dialog";

// Shared gate states for the /project resolver and the /project/[projectId] shell.
export { LoadingArea } from "@geiger/ui";

export function NoProjectsState() {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="flex h-full min-h-[60dvh] w-full items-center justify-center p-6">
      <EmptyState
        icon={FolderPlus}
        title="No projects yet"
        description="A project holds your documents, collections and templates. Create one to get started."
        action={
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" /> Create project
          </Button>
        }
      />
      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
