"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";

// Names and creates a project, then switches to it.
export function CreateProjectDialog({ open, onOpenChange }) {
  const { createProject } = useProject();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give your project a name.");
      return;
    }
    setSaving(true);
    const created = await createProject(name);
    setSaving(false);
    if (created) {
      toast.success(`Switched to "${created.name}".`);
      setName("");
      onOpenChange(false);
    } else {
      toast.error("Couldn't create the project.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            A project holds its documents, collections and templates. You&apos;ll be
            switched to it once created.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Project name" htmlFor="project-name">
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Handbook"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) submit();
              }}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={submit}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateProjectDialog;
