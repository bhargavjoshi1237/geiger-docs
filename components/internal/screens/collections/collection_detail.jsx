"use client";

import React, { useMemo, useState } from "react";
import { ArrowLeft, FileText, FolderX, Pencil } from "lucide-react";
import { Button } from "@geiger/ui";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DOCUMENT_STATUS_MAP,
  formatDate,
  formatRelative,
  wordCount,
} from "@/components/internal/screens/documents/constants";

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

function BackButton({ onClick }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="-ml-2 mb-2 text-text-secondary hover:bg-transparent hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Collections
    </Button>
  );
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// One collection and its documents; rows open the document in the Documents tab.
export function CollectionDetailScreen({
  collection,
  documents = [],
  onBack,
  onRename,
  onOpenDocument,
  onBrowseDocuments,
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter((d) => `${d.title} ${d.status}`.toLowerCase().includes(query));
  }, [documents, search]);

  if (!collection) {
    return (
      <MainScreenWrapper>
        <div>
          <BackButton onClick={onBack} />
          <ScreenHeader
            title="Collection not found"
            description="It may have been deleted, or the link points to a collection in another project."
          />
        </div>
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={FolderX}
            title="This collection isn't available"
            description="Head back to your collections to pick another one."
            action={
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" /> Back to collections
              </Button>
            }
          />
        </div>
      </MainScreenWrapper>
    );
  }

  const columns = [
    {
      key: "title",
      header: "Document",
      render: (d) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium text-foreground">{d.title || "Untitled"}</span>
          <span className="text-xs text-text-secondary">{plural(wordCount(d.body), "word")}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (d) => <StatusPill status={d.status} map={DOCUMENT_STATUS_MAP} />,
    },
    {
      key: "updated",
      header: "Updated",
      render: (d) => (
        <span className="text-sm text-text-secondary" title={formatDate(d.updatedAt)}>
          {formatRelative(d.updatedAt)}
        </span>
      ),
    },
  ];

  const emptyState = documents.length ? (
    <EmptyState
      icon={FileText}
      title="No documents match your search"
      description="Try a different title or status."
      action={
        <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setSearch("")}>
          Clear search
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={FileText}
      title="No documents in this collection yet"
      description="Open a document in the Documents tab and set its collection on the Details tab."
      action={
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onBrowseDocuments}
        >
          <FileText className="h-4 w-4" /> Go to Documents
        </Button>
      }
    />
  );

  return (
    <MainScreenWrapper>
      <div>
        <BackButton onClick={onBack} />
        <ScreenHeader
          title={collection.name || "Untitled collection"}
          description={collection.description || "No description yet."}
          actions={
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={onRename}>
              <Pencil className="h-4 w-4" /> Rename
            </Button>
          }
        />
      </div>

      <Toolbar>
        <p className="text-sm text-text-secondary">
          {search.trim()
            ? `${filtered.length} of ${plural(documents.length, "document")}`
            : plural(documents.length, "document")}
        </p>
        <SearchInput value={search} onChange={setSearch} placeholder="Search this collection…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(d) => d.id}
        onRowClick={onOpenDocument}
        empty={<div className="rounded-xl border border-border bg-surface-subtle">{emptyState}</div>}
      />
    </MainScreenWrapper>
  );
}

export default CollectionDetailScreen;
