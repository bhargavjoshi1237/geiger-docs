"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderOpen, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { ActionMenu, Button, LoadingArea } from "@geiger/ui";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatsBar,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { formatDate, formatRelative } from "@/components/internal/screens/documents/constants";
import {
  CollectionDialog,
  DeleteCollectionDialog,
} from "@/components/internal/screens/collections/collection_dialog";
import { CollectionDetailScreen } from "@/components/internal/screens/collections/collection_detail";
import { useProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getUser } from "@/lib/supabase/user";
import {
  createCollection,
  listCollections,
  softDeleteCollection,
  updateCollection,
} from "@/lib/supabase/collections";
import { listDocuments } from "@/lib/supabase/documents";

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

// Same order as listCollections (name asc) so optimistic rows land where a refetch would put them.
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function CollectionsScreen() {
  const { projectId } = useProject();
  const { collectionId, openCollection, closeCollection, openDocInTab, setTab } = useWorkspaceUrl();
  const [collections, setCollections] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState({ open: false, collection: null });
  const [removal, setRemoval] = useState({ open: false, collection: null });

  useEffect(() => {
    let alive = true;
    Promise.all([listCollections(projectId), listDocuments(projectId)]).then(([cols, docs]) => {
      if (!alive) return;
      setCollections(cols ?? []);
      setDocuments(docs ?? []);
      setLoading(false);
    });
    getUser()
      .then((user) => {
        if (alive) setUserId(user?.id ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Documents per collection id.
  const docCounts = useMemo(() => {
    const counts = new Map();
    for (const doc of documents) {
      if (doc.collectionId) counts.set(doc.collectionId, (counts.get(doc.collectionId) || 0) + 1);
    }
    return counts;
  }, [documents]);

  const stats = useMemo(() => {
    const filed = collections.reduce((sum, c) => sum + (docCounts.get(c.id) || 0), 0);
    const withDocs = collections.filter((c) => docCounts.get(c.id)).length;
    const largest = collections.reduce((best, c) => {
      const count = docCounts.get(c.id) || 0;
      return count > (best?.count ?? 0) ? { name: c.name, count } : best;
    }, null);
    return [
      { label: "Collections", value: String(collections.length), footer: `${withDocs} with documents` },
      { label: "Documents filed", value: String(filed), footer: `Of ${plural(documents.length, "document")}` },
      { label: "Unfiled documents", value: String(documents.length - filed), footer: "Not in any collection" },
      {
        label: "Largest collection",
        value: String(largest?.count ?? 0),
        footer: largest ? largest.name : "Nothing filed yet",
      },
    ];
  }, [collections, documents, docCounts]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return collections;
    return collections.filter((c) => `${c.name} ${c.description}`.toLowerCase().includes(query));
  }, [collections, search]);

  const selected = useMemo(
    () => (collectionId ? collections.find((c) => c.id === collectionId) || null : null),
    [collectionId, collections],
  );

  const selectedDocuments = useMemo(
    () => (collectionId ? documents.filter((d) => d.collectionId === collectionId) : []),
    [collectionId, documents],
  );

  const openCreate = () => setEditor({ open: true, collection: null });
  const openRename = (collection) => setEditor({ open: true, collection });
  const openDelete = (collection) => setRemoval({ open: true, collection });

  const handleCreate = async ({ name, description }) => {
    const now = new Date().toISOString();
    const optimistic = {
      id: crypto.randomUUID(),
      projectId,
      name,
      description,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    setCollections((prev) => [...prev, optimistic].sort(byName));
    const created = await createCollection(optimistic);
    if (created) {
      setCollections((prev) => prev.map((c) => (c.id === created.id ? created : c)));
      toast.success(`Created "${created.name}".`);
    } else {
      setCollections((prev) => prev.filter((c) => c.id !== optimistic.id));
      toast.error("Couldn't create the collection.");
    }
  };

  const handleRename = async (collection, { name, description }) => {
    if (name === collection.name && description === collection.description) return;
    const patch = { name, description };
    setCollections((prev) =>
      prev
        .map((c) => (c.id === collection.id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c))
        .sort(byName),
    );
    const saved = await updateCollection(collection.id, patch);
    if (saved) {
      setCollections((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      toast.success("Collection updated.");
    } else {
      setCollections((prev) => prev.map((c) => (c.id === collection.id ? collection : c)).sort(byName));
      toast.error("Couldn't save the collection.");
    }
  };

  const handleSave = (values) => {
    if (editor.collection) handleRename(editor.collection, values);
    else handleCreate(values);
  };

  const handleDelete = async () => {
    const collection = removal.collection;
    if (!collection) return;
    setRemoval((prev) => ({ ...prev, open: false }));
    setCollections((prev) => prev.filter((c) => c.id !== collection.id));
    const ok = await softDeleteCollection(collection.id);
    if (ok) {
      // The data layer detached its documents; mirror that locally.
      setDocuments((prev) =>
        prev.map((d) => (d.collectionId === collection.id ? { ...d, collectionId: null } : d)),
      );
      toast.success(`Deleted "${collection.name}".`);
    } else {
      setCollections((prev) => [...prev, collection].sort(byName));
      toast.error("Couldn't delete the collection.");
    }
  };

  const dialogs = (
    <>
      <CollectionDialog
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        collection={editor.collection}
        onSave={handleSave}
      />
      <DeleteCollectionDialog
        open={removal.open}
        onOpenChange={(open) => setRemoval((prev) => ({ ...prev, open }))}
        collection={removal.collection}
        documentCount={removal.collection ? docCounts.get(removal.collection.id) || 0 : 0}
        onConfirm={handleDelete}
      />
    </>
  );

  if (collectionId) {
    if (loading) {
      return (
        <MainScreenWrapper>
          <LoadingArea panel label="Loading collection" />
        </MainScreenWrapper>
      );
    }
    return (
      <>
        <CollectionDetailScreen
          collection={selected}
          documents={selectedDocuments}
          onBack={closeCollection}
          onRename={() => openRename(selected)}
          onOpenDocument={(doc) => openDocInTab(doc.id, "Documents")}
          onBrowseDocuments={() => setTab("Documents")}
        />
        {dialogs}
      </>
    );
  }

  const columns = [
    {
      key: "name",
      header: "Collection",
      render: (c) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium text-foreground">{c.name || "Untitled collection"}</span>
          <span className="max-w-md truncate text-xs text-text-secondary">
            {c.description || "No description"}
          </span>
        </div>
      ),
    },
    {
      key: "documents",
      header: "Documents",
      className: "tabular-nums text-foreground",
      render: (c) => docCounts.get(c.id) || 0,
    },
    {
      key: "updated",
      header: "Updated",
      render: (c) => (
        <span className="text-sm text-text-secondary" title={formatDate(c.updatedAt)}>
          {formatRelative(c.updatedAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12 text-right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { icon: FolderOpen, label: "Open", onSelect: () => openCollection(c.id) },
            { icon: Pencil, label: "Rename", onSelect: () => openRename(c) },
            { separator: true },
            { icon: Trash2, label: "Delete", destructive: true, onSelect: () => openDelete(c) },
          ]}
        />
      ),
    },
  ];

  const newButton = (
    <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openCreate}>
      <Plus className="h-4 w-4" /> New collection
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Collections"
        description="Group related documents into flat collections. Each document can sit in one collection at a time."
        actions={newButton}
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <p className="text-sm text-text-secondary">
          {search.trim()
            ? `${filtered.length} of ${plural(collections.length, "collection")}`
            : plural(collections.length, "collection")}
        </p>
        <SearchInput value={search} onChange={setSearch} placeholder="Search collections…" />
      </Toolbar>

      {loading ? (
        <LoadingArea panel label="Loading collections" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(c) => c.id}
          onRowClick={(c) => openCollection(c.id)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              {collections.length ? (
                <EmptyState
                  icon={FolderPlus}
                  title="No collections match your search"
                  description="Try a different name, or create a new collection."
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setSearch("")}>
                        Clear search
                      </Button>
                      {newButton}
                    </div>
                  }
                />
              ) : (
                <EmptyState
                  icon={FolderPlus}
                  title="No collections yet"
                  description="Create a collection to keep related documents together."
                  action={newButton}
                />
              )}
            </div>
          }
        />
      )}

      {dialogs}
    </MainScreenWrapper>
  );
}

export default CollectionsScreen;
