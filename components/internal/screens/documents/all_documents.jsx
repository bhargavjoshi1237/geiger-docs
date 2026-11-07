"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, FilePlus, FileText, FileX, Plus, SearchX, Trash2 } from "lucide-react";
import {
  ActionMenu,
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
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { FilterDropdown } from "@/components/internal/shared/filter_dropdown";
import { DocumentDetailScreen } from "@/components/internal/screens/documents/document_detail";
import {
  CreateDocumentDialog,
  buildNewDocument,
} from "@/components/internal/screens/documents/create_document_dialog";
import {
  DOCUMENT_STATUS_MAP,
  SHARE_FILTER_OPTIONS,
  SHARE_MODE_MAP,
  STATUS_FILTER_OPTIONS,
  formatRelative,
  wordCount,
} from "@/components/internal/screens/documents/constants";
import {
  createDocument,
  listDocuments,
  softDeleteDocument,
} from "@/lib/supabase/documents";
import { listCollections } from "@/lib/supabase/collections";
import { listTemplates } from "@/lib/supabase/templates";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/supabase/settings";
import { getUser } from "@/lib/supabase/user";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";

const PRIMARY_BUTTON = "bg-primary text-primary-foreground hover:bg-primary/90";

const formatWords = (n) => `${n.toLocaleString()} ${n === 1 ? "word" : "words"}`;

function ShareBadge({ mode }) {
  const meta = SHARE_MODE_MAP[mode] || SHARE_MODE_MAP.workspace;
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon />
      {meta.label}
    </Badge>
  );
}

export function DocumentsScreen() {
  const { projectId } = useProject();
  const { docId, openDoc, closeDoc } = useWorkspaceUrl();
  const [documents, setDocuments] = useState([]);
  const [collections, setCollections] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [collection, setCollection] = useState("all");
  const [share, setShare] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listDocuments(projectId),
      listCollections(projectId),
      listTemplates(projectId),
      getSettings(projectId),
    ]).then(([docs, cols, tpls, cfg]) => {
      if (!alive) return;
      if (docs === null) toast.error("Couldn't load your documents.");
      setDocuments(docs ?? []);
      setCollections(cols ?? []);
      setTemplates(tpls ?? []);
      setSettings(cfg ?? { ...DEFAULT_SETTINGS, projectId });
      setLoading(false);
    });
    getUser()
      .then((u) => alive && setUserId(u?.id ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);

  const collectionNames = useMemo(
    () => new Map(collections.map((c) => [c.id, c.name || "Untitled collection"])),
    [collections],
  );

  const collectionOptions = useMemo(
    () => [
      { value: "all", label: "All collections" },
      { value: "none", label: "No collection" },
      ...collections.map((c) => ({ value: c.id, label: c.name || "Untitled collection" })),
    ],
    [collections],
  );

  const selected = useMemo(
    () => (docId ? documents.find((d) => d.id === docId) || null : null),
    [docId, documents],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (status !== "all" && d.status !== status) return false;
      if (share !== "all" && d.shareMode !== share) return false;
      if (collection === "none" && d.collectionId) return false;
      if (collection !== "all" && collection !== "none" && d.collectionId !== collection) return false;
      if (!query) return true;
      const haystack = `${d.title} ${collectionNames.get(d.collectionId) || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [documents, search, status, share, collection, collectionNames]);

  const stats = useMemo(() => {
    const count = (s) => documents.filter((d) => d.status === s).length;
    const value = (n) => (loading ? undefined : String(n));
    return [
      { label: "Total", value: value(documents.length), footer: `${collections.length} collections` },
      { label: "Drafts", value: value(count("Draft")), footer: "Still being written" },
      { label: "In review", value: value(count("In review")), footer: "Awaiting sign-off" },
      { label: "Published", value: value(count("Published")), footer: `${count("Archived")} archived` },
    ];
  }, [documents, collections.length, loading]);

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setCollection("all");
    setShare("all");
  };

  // Optimistic insert shared by create and duplicate; rolls back and toasts when the write fails.
  const insertDocument = async (input, failure) => {
    setDocuments((prev) => [input, ...prev]);
    const created = await createDocument(input);
    if (!created) {
      setDocuments((prev) => prev.filter((d) => d.id !== input.id));
      toast.error(failure);
      return null;
    }
    setDocuments((prev) => prev.map((d) => (d.id === created.id ? created : d)));
    return created;
  };

  const handleCreate = async ({ title, collectionId, body }) => {
    const input = buildNewDocument({ projectId, title, collectionId, body, settings, createdBy: userId });
    const created = await insertDocument(input, "Couldn't create the document.");
    if (created) {
      toast.success(`"${created.title}" created as a draft.`);
      openDoc(created.id);
    }
    return created;
  };

  const handleDuplicate = async (doc) => {
    const now = new Date().toISOString();
    const copy = {
      id: crypto.randomUUID(),
      projectId,
      collectionId: doc.collectionId,
      title: `${doc.title || "Untitled"} (copy)`,
      body: doc.body,
      status: "Draft",
      shareMode: doc.shareMode,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    const created = await insertDocument(copy, "Couldn't duplicate the document.");
    if (created) toast.success(`Duplicated "${doc.title || "Untitled"}".`);
  };

  // Detail edits are already persisted by the editor; mirror them into the list.
  const handleChange = (next) => {
    setDocuments((prev) => prev.map((d) => (d.id === next.id ? { ...d, ...next } : d)));
  };

  const handleDelete = async (id) => {
    const index = documents.findIndex((d) => d.id === id);
    if (index === -1) return;
    const doc = documents[index];
    setDeleteTarget(null);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (docId === id) closeDoc();
    const ok = await softDeleteDocument(id);
    if (!ok) {
      setDocuments((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, doc);
        return next;
      });
      toast.error(`Couldn't delete "${doc.title || "Untitled"}".`);
      return;
    }
    toast.success(`Deleted "${doc.title || "Untitled"}".`);
  };

  if (docId) {
    if (loading) {
      return (
        <MainScreenWrapper>
          <LoadingArea label="Loading document" />
        </MainScreenWrapper>
      );
    }
    if (selected) {
      return (
        <DocumentDetailScreen
          document={selected}
          collections={collections}
          settings={settings}
          onBack={closeDoc}
          onChange={handleChange}
          onDelete={handleDelete}
        />
      );
    }
    return (
      <MainScreenWrapper>
        <EmptyState
          icon={FileX}
          title="Document not found"
          description="It may have been deleted, or the link points to another project."
          className="rounded-xl border border-border bg-surface-subtle"
          action={
            <Button variant="outline" onClick={closeDoc}>
              <ArrowLeft className="h-4 w-4" /> Back to documents
            </Button>
          }
        />
      </MainScreenWrapper>
    );
  }

  const columns = [
    {
      key: "title",
      header: "Document",
      render: (d) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="block max-w-md truncate font-medium text-foreground">
            {d.title || "Untitled"}
          </span>
          <span className="text-xs text-text-secondary">
            {(d.collectionId && collectionNames.get(d.collectionId)) || "No collection"} ·{" "}
            {formatWords(wordCount(d.body))}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (d) => <StatusPill status={d.status} map={DOCUMENT_STATUS_MAP} />,
    },
    {
      key: "sharing",
      header: "Sharing",
      render: (d) => <ShareBadge mode={d.shareMode} />,
    },
    {
      key: "updated",
      header: "Updated",
      className: "whitespace-nowrap text-text-secondary tabular-nums",
      render: (d) => formatRelative(d.updatedAt),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12",
      render: (d) => (
        <ActionMenu
          label={`Actions for ${d.title || "Untitled"}`}
          className="flex justify-end"
          items={[
            { icon: FileText, label: "Open", onSelect: () => openDoc(d.id) },
            { icon: Copy, label: "Duplicate", onSelect: () => handleDuplicate(d) },
            { separator: true },
            {
              icon: Trash2,
              label: "Delete",
              variant: "destructive",
              onSelect: () => setDeleteTarget(d),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Documents"
        description="Every document in this project. Search, filter by status, collection or sharing, and open one to edit."
        actions={
          <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New document
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={status} onValueChange={setStatus} options={STATUS_FILTER_OPTIONS} />
          <FilterDropdown value={collection} onValueChange={setCollection} options={collectionOptions} />
          <FilterDropdown value={share} onValueChange={setShare} options={SHARE_FILTER_OPTIONS} />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search documents…" />
      </Toolbar>

      {loading ? (
        <LoadingArea panel label="Loading documents" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(d) => d.id}
          onRowClick={(d) => openDoc(d.id)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              {documents.length ? (
                <EmptyState
                  icon={SearchX}
                  title="No documents match your filters"
                  description="Try a different search, or clear the filters to see everything."
                  action={
                    <Button variant="outline" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={FilePlus}
                  title="No documents yet"
                  description="Write your first document, or start from a template."
                  action={
                    <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> New document
                    </Button>
                  }
                />
              )}
            </div>
          }
        />
      )}

      <CreateDocumentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        collections={collections}
        templates={templates}
        onCreate={handleCreate}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete document</DialogTitle>
            <DialogDescription>
              Delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.title || "Untitled"}
              </span>
              ? It will disappear from this project and its public link will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => handleDelete(deleteTarget?.id)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

export default DocumentsScreen;
