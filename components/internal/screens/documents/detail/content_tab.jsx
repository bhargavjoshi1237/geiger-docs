"use client";

import React, { useState } from "react";
import { Eye, PenLine } from "lucide-react";
import { Kbd, KbdGroup, Textarea } from "@geiger/ui";
import { EditorSectionHeader, SegmentedTabs } from "@/components/internal/shared/screen_kit";
import { MarkdownView } from "@/components/internal/shared/markdown_view";
import { wordCount } from "@/components/internal/screens/documents/constants";

const MODES = [
  { value: "write", label: "Write", icon: PenLine },
  { value: "preview", label: "Preview", icon: Eye },
];

// Markdown body editor; the draft and its save live in the parent so the header can show dirty state.
export function ContentTab({ draft, onDraftChange, editable }) {
  const [mode, setMode] = useState("write");
  const preview = !editable || mode === "preview";
  const words = wordCount(draft);

  return (
    <div className="space-y-4">
      <EditorSectionHeader
        title="Content"
        description={
          editable
            ? "Write in Markdown. Preview shows exactly what readers will see."
            : "You can read this document but not edit it."
        }
        action={editable ? <SegmentedTabs tabs={MODES} value={mode} onChange={setMode} /> : null}
      />

      {preview ? (
        <div className="min-h-[60vh] rounded-xl border border-border bg-surface-subtle px-5 py-4 md:px-8 md:py-6">
          {draft.trim() ? (
            <MarkdownView source={draft} />
          ) : (
            <p className="text-sm text-text-tertiary">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <Textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={"# Heading\n\nStart writing in Markdown…"}
          aria-label="Document body (Markdown)"
          spellCheck
          className="field-sizing-content min-h-[60vh] resize-y px-4 py-3 font-mono text-sm leading-6 md:px-5 md:py-4"
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
        <span className="tabular-nums">
          {words.toLocaleString()} {words === 1 ? "word" : "words"} · {draft.length.toLocaleString()} characters
        </span>
        {editable ? (
          <span className="inline-flex items-center gap-1.5">
            Markdown supported ·
            <KbdGroup>
              <Kbd>Ctrl/⌘</Kbd>
              <Kbd>S</Kbd>
            </KbdGroup>
            to save
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default ContentTab;
