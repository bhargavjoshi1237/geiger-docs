"use client";

import React, { useMemo, useRef, useState } from "react";
import { Copy, Eye, Lock, PenLine, Plus, Signature } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Kbd,
  KbdGroup,
  Textarea,
} from "@geiger/ui";
import { EditorSectionHeader, SegmentedTabs } from "@/components/internal/shared/screen_kit";
import { MarkdownView } from "@/components/internal/shared/markdown_view";
import { FIELD_TYPE_ICONS, wordCount } from "@/components/internal/screens/documents/constants";
import { MAX_RECIPIENTS } from "@/lib/signing/model";
import { FIELD_TYPES, buildFieldToken, parseFieldTokens } from "@/lib/signing/fields";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "write", label: "Write", icon: PenLine },
  { value: "preview", label: "Preview", icon: Eye },
];

// Recipients offered per field type: at least 3, one past the highest rN already used, never above MAX_RECIPIENTS.
const DEFAULT_RECIPIENT_SLOTS = 3;

const LOCK_COPY = {
  open: {
    text: "Out for signature. Editing is locked until signing finishes or is cancelled.",
    tone: "border-amber-500/20 bg-amber-500/10",
    icon: "text-amber-700 dark:text-amber-400",
  },
  completed: {
    text: "Signed. This document is read-only; duplicate it to make changes.",
    tone: "border-emerald-500/20 bg-emerald-500/10",
    icon: "text-emerald-700 dark:text-emerald-400",
  },
};

// Markdown body editor; the draft and its save live in the parent so the header can show dirty state.
export function ContentTab({ draft, onDraftChange, editable, lock = null, onOpenSigning, onDuplicate }) {
  const [mode, setMode] = useState("write");
  const textareaRef = useRef(null);
  const caretRef = useRef(null);
  const writable = editable && !lock;
  const preview = !writable || mode === "preview";
  const words = wordCount(draft);

  const recipientSlots = useMemo(() => {
    const highest = parseFieldTokens(draft).reduce((max, token) => Math.max(max, token.position), 0);
    return Math.min(MAX_RECIPIENTS, Math.max(DEFAULT_RECIPIENT_SLOTS, highest + 1));
  }, [draft]);

  // Splices the token over the current selection; focus and caret are restored once the menu closes.
  const insertField = (type, position) => {
    const token = buildFieldToken(type, position);
    const el = textareaRef.current;
    const start = el ? el.selectionStart : draft.length;
    const end = el ? el.selectionEnd : draft.length;
    onDraftChange(`${draft.slice(0, start)}${token}${draft.slice(end)}`);
    caretRef.current = start + token.length;
  };

  const restoreCaret = (event) => {
    const caret = caretRef.current;
    if (caret === null) return;
    event.preventDefault();
    caretRef.current = null;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const lockCopy = lock ? LOCK_COPY[lock === "completed" ? "completed" : "open"] : null;

  const description = lock
    ? lock === "completed"
      ? "Signed documents are read-only."
      : "Read-only while this document is out for signature."
    : editable
      ? "Write in Markdown. Preview shows exactly what readers will see."
      : "You can read this document but not edit it.";

  const insertMenu =
    writable && mode === "write" ? (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="border-border bg-transparent">
            <Plus className="h-4 w-4" />
            Insert field
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-52 border-border bg-surface-subtle"
          onCloseAutoFocus={restoreCaret}
        >
          <DropdownMenuLabel className="text-xs font-medium text-text-secondary">
            Signing field
          </DropdownMenuLabel>
          {FIELD_TYPES.map((field) => {
            const Icon = FIELD_TYPE_ICONS[field.value] || PenLine;
            return (
              <DropdownMenuSub key={field.value}>
                <DropdownMenuSubTrigger>
                  <Icon />
                  {field.label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48 border-border bg-surface-subtle">
                  {Array.from({ length: recipientSlots }, (_, index) => index + 1).map((position) => (
                    <DropdownMenuItem key={position} onSelect={() => insertField(field.value, position)}>
                      Recipient {position}
                      <span className="ml-auto font-mono text-xs text-text-tertiary">r{position}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <div className="space-y-4">
      <EditorSectionHeader
        title="Content"
        description={description}
        action={
          writable ? (
            <>
              {insertMenu}
              <SegmentedTabs tabs={MODES} value={mode} onChange={setMode} />
            </>
          ) : null
        }
      />

      {lockCopy ? (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
            lockCopy.tone,
          )}
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <Lock className={cn("mt-0.5 h-4 w-4 shrink-0", lockCopy.icon)} />
            <p className="text-sm text-foreground">{lockCopy.text}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {lock === "completed" && onDuplicate ? (
              <Button variant="outline" size="sm" onClick={onDuplicate}>
                <Copy className="h-4 w-4" />
                Duplicate
              </Button>
            ) : null}
            {onOpenSigning ? (
              <Button variant="outline" size="sm" onClick={onOpenSigning}>
                <Signature className="h-4 w-4" />
                View signing
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

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
          ref={textareaRef}
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
        {writable ? (
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
      {writable && mode === "write" ? (
        <p className="text-xs text-text-tertiary">
          Signing fields like <code className="font-mono">{"{{signature, r1}}"}</code> are filled
          by recipients; <code className="font-mono">rN</code> matches Recipient N in the send dialog.
        </p>
      ) : null}
    </div>
  );
}

export default ContentTab;
