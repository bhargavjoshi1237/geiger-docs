"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";

// Select sentinels; Radix Select items can't carry an empty-string value.
const NO_COLLECTION = "none";
const BLANK_TEMPLATE = "blank";

const EMPTY_DRAFT = { title: "", collectionId: NO_COLLECTION, templateId: BLANK_TEMPLATE };

// New Draft document view model; honors the project's default sharing mode (public only when allowed).
export function buildNewDocument({ projectId, title, collectionId, body, settings, createdBy }) {
  const now = new Date().toISOString();
  const preferred = settings?.defaultShareMode || "workspace";
  const shareMode =
    preferred === "public" && settings?.allowPublicLinks === false ? "workspace" : preferred;
  return {
    id: crypto.randomUUID(),
    projectId,
    collectionId: collectionId || null,
    title,
    body: body || "",
    status: "Draft",
    shareMode,
    createdBy: createdBy || null,
    createdAt: now,
    updatedAt: now,
  };
}

// Create dialog: title (required), optional collection, optional template whose body is copied in.
export function CreateDocumentDialog({
  open,
  onOpenChange,
  collections = [],
  templates = [],
  onCreate,
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [pending, setPending] = useState(false);

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const handleOpenChange = (next) => {
    if (pending) return;
    if (!next) setDraft(EMPTY_DRAFT);
    onOpenChange(next);
  };

  const submit = async () => {
    if (pending) return;
    const title = draft.title.trim();
    if (!title) {
      toast.error("Give your document a title first.");
      return;
    }
    const template = templates.find((t) => t.id === draft.templateId);
    setPending(true);
    let created = null;
    try {
      created = await onCreate({
        title,
        collectionId: draft.collectionId === NO_COLLECTION ? null : draft.collectionId,
        body: template?.body || "",
      });
    } finally {
      setPending(false);
    }
    // The screen toasts the failure; keep the draft so the user can retry.
    if (!created) return;
    setDraft(EMPTY_DRAFT);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg bg-background">
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>
            Give it a title now. You can write, share and organize it in the editor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field label="Title" htmlFor="doc-title">
            <Input
              id="doc-title"
              value={draft.title}
              onChange={(e) => set("title")(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. Q4 product brief"
              disabled={pending}
              autoFocus
            />
          </Field>

          <Field label="Collection">
            <Select
              value={draft.collectionId}
              onValueChange={set("collectionId")}
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COLLECTION}>No collection</SelectItem>
                {collections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name || "Untitled collection"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Start from template"
            hint={
              templates.length
                ? "The template's content is copied into the new document."
                : "No templates yet. Create one in Templates to reuse it here."
            }
          >
            <Select
              value={draft.templateId}
              onValueChange={set("templateId")}
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BLANK_TEMPLATE}>Blank document</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name || "Untitled template"}
                    {t.category ? ` · ${t.category}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={submit}
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateDocumentDialog;
