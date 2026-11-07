"use client";

import React, { useState } from "react";
import { Eye, PenLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "@geiger/ui";
import { Field, SegmentedTabs } from "@/components/internal/shared/screen_kit";
import { MarkdownView } from "@/components/internal/shared/markdown_view";

export const DEFAULT_TEMPLATE_CATEGORY = "General";

const BODY_TABS = [
  { label: "Write", value: "write", icon: PenLine },
  { label: "Preview", value: "preview", icon: Eye },
];

// Lives inside DialogContent so its draft resets every time the dialog opens.
function TemplateForm({ template, onCancel, onSave }) {
  const editing = Boolean(template);
  const [draft, setDraft] = useState(() => ({
    name: template?.name ?? "",
    category: template?.category || DEFAULT_TEMPLATE_CATEGORY,
    description: template?.description ?? "",
    body: template?.body ?? "",
  }));
  const [mode, setMode] = useState("write");

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = () => {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Give the template a name.");
      return;
    }
    onSave({
      name,
      category: draft.category.trim() || DEFAULT_TEMPLATE_CATEGORY,
      description: draft.description.trim(),
      body: draft.body,
    });
  };

  const submitOnEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
        <DialogDescription>
          A reusable Markdown starting point. Using it creates a new draft document with this body.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="template-name">
            <Input
              id="template-name"
              value={draft.name}
              onChange={(e) => set("name")(e.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="e.g. Meeting notes"
              autoFocus
            />
          </Field>
          <Field label="Category" htmlFor="template-category">
            <Input
              id="template-category"
              value={draft.category}
              onChange={(e) => set("category")(e.target.value)}
              onKeyDown={submitOnEnter}
              placeholder={DEFAULT_TEMPLATE_CATEGORY}
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="template-description">
          <Input
            id="template-description"
            value={draft.description}
            onChange={(e) => set("description")(e.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="When should someone use this template?"
          />
        </Field>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="template-body" className="text-sm font-medium text-muted-foreground">
              Body
            </label>
            <SegmentedTabs tabs={BODY_TABS} value={mode} onChange={setMode} className="w-auto" />
          </div>
          {mode === "write" ? (
            <Textarea
              id="template-body"
              value={draft.body}
              onChange={(e) => set("body")(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={"# Title\n\nWrite the template in Markdown…"}
              spellCheck={false}
              className="h-72 resize-none font-mono text-[13px] leading-6"
            />
          ) : (
            <div className="h-72 overflow-y-auto rounded-md border border-border bg-surface-card px-4 py-3">
              {draft.body.trim() ? (
                <MarkdownView source={draft.body} />
              ) : (
                <p className="text-sm text-text-tertiary">Nothing to preview yet.</p>
              )}
            </div>
          )}
          <p className="text-xs text-text-secondary">
            Markdown with tables, task lists and links. Ctrl/Cmd + Enter saves.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={submit}>
          {editing ? "Save changes" : "Create template"}
        </Button>
      </DialogFooter>
    </>
  );
}

// Create (no `template`) and edit (with `template`) share this dialog.
export function TemplateDialog({ open, onOpenChange, template = null, onSave }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-background sm:max-w-3xl">
        <TemplateForm
          template={template}
          onCancel={() => onOpenChange(false)}
          onSave={(values) => {
            onSave(values);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

// Confirms a template delete; documents already created from it are untouched.
export function DeleteTemplateDialog({ open, onOpenChange, template, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete template</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{template?.name}</span>? Documents
            already created from it are not affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            <Trash2 className="h-4 w-4" /> Delete template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TemplateDialog;
