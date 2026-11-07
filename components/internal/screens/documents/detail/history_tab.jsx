"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { History, Loader2, RotateCcw } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingArea,
} from "@geiger/ui";
import { EmptyState, SectionCard } from "@/components/internal/shared/screen_kit";
import { MarkdownView } from "@/components/internal/shared/markdown_view";
import { formatDate, formatRelative } from "@/components/internal/screens/documents/constants";
import { listDocumentVersions } from "@/lib/supabase/document_versions";
import { cn } from "@/lib/utils";

// Saved versions, newest first; restore reuses the editor's save path so it lands as a new version.
export function HistoryTab({ document, editable, dirty, versionKey, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Refetch whenever the parent records a save (versionKey bumps).
  useEffect(() => {
    let cancelled = false;
    listDocumentVersions(document.id).then((rows) => {
      if (cancelled) return;
      setVersions(rows ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [document.id, versionKey]);

  const selected = versions.find((v) => v.id === selectedId) ?? versions[0] ?? null;
  const latestNumber = versions[0]?.versionNumber;
  const matchesCurrent =
    !dirty && selected && selected.body === document.body && selected.title === document.title;

  const restore = async (version) => {
    setConfirmOpen(false);
    setRestoringId(version.id);
    const ok = await onRestore(version);
    setRestoringId(null);
    if (!ok) return;
    setSelectedId(null);
    toast.success(`Restored version ${version.versionNumber}`);
  };

  // Restoring over unsaved edits would silently drop them, so confirm first.
  const requestRestore = (version) => {
    if (!dirty) return restore(version);
    setConfirming(version);
    setConfirmOpen(true);
  };

  if (loading) return <LoadingArea panel label="Loading history" />;

  if (!versions.length) {
    return (
      <EmptyState
        icon={History}
        title="No versions yet"
        description="Saving creates one"
        className="rounded-xl border border-border bg-surface-subtle"
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <SectionCard
        title="Versions"
        description={`${versions.length} saved ${versions.length === 1 ? "version" : "versions"}`}
        bodyPadding={false}
        className="self-start"
      >
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {versions.map((version) => {
            const active = selected?.id === version.id;
            return (
              <li key={version.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(version.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover",
                    active && "bg-surface-active hover:bg-surface-active",
                  )}
                >
                  <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-card px-1.5 text-xs font-semibold tabular-nums text-foreground">
                    v{version.versionNumber}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {version.title || "Untitled"}
                      </span>
                      {version.versionNumber === latestNumber ? (
                        <Badge variant="success" className="shrink-0">
                          Latest
                        </Badge>
                      ) : null}
                    </span>
                    <span
                      className="mt-0.5 block text-xs text-text-tertiary"
                      title={formatDate(version.createdAt)}
                    >
                      {formatRelative(version.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      {selected ? (
        <SectionCard
          title={`Version ${selected.versionNumber}`}
          description={`${selected.title || "Untitled"} · saved ${formatRelative(selected.createdAt)}`}
          action={
            editable ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => requestRestore(selected)}
                disabled={Boolean(restoringId) || matchesCurrent}
                title={matchesCurrent ? "This is the current content" : undefined}
              >
                {restoringId === selected.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {matchesCurrent ? "Current" : "Restore"}
              </Button>
            ) : null
          }
          contentClassName="min-h-[40vh] md:px-8 md:py-6"
        >
          {selected.body.trim() ? (
            <MarkdownView source={selected.body} />
          ) : (
            <p className="text-sm text-text-tertiary">This version is empty.</p>
          )}
        </SectionCard>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              Restoring version {confirming?.versionNumber} replaces the edits you haven&apos;t saved.
              Everything you have saved stays in history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => confirming && restore(confirming)}
            >
              <RotateCcw className="h-4 w-4" />
              Restore version {confirming?.versionNumber}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default HistoryTab;
