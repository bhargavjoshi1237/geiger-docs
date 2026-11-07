"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, FilePlus, Plus } from "lucide-react";
import { Button, LoadingArea } from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SectionCard,
  StatsBar,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import {
  CreateDocumentDialog,
  buildNewDocument,
} from "@/components/internal/screens/documents/create_document_dialog";
import {
  DOCUMENT_STATUS_MAP,
  formatRelative,
} from "@/components/internal/screens/documents/constants";
import { listDocuments, createDocument } from "@/lib/supabase/documents";
import { listCollections } from "@/lib/supabase/collections";
import { listTemplates } from "@/lib/supabase/templates";
import { getSettings } from "@/lib/supabase/settings";
import { getUser } from "@/lib/supabase/user";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";

const RECENT_LIMIT = 8;

const timeOf = (value) => new Date(value || 0).getTime() || 0;

export function OverviewScreen() {
  const { projectId } = useProject();
  const { openDocInTab, setTab } = useWorkspaceUrl();
  const [documents, setDocuments] = useState([]);
  const [collections, setCollections] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

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
      setSettings(cfg);
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

  const recent = useMemo(
    () =>
      [...documents]
        .sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt))
        .slice(0, RECENT_LIMIT),
    [documents],
  );

  // Values stay undefined while loading so the rolling numbers park on 0 until the fetch lands.
  const stats = useMemo(() => {
    const count = (fn) => (loading ? undefined : String(documents.filter(fn).length));
    const drafts = documents.filter((d) => d.status === "Draft").length;
    return [
      {
        label: "Documents",
        value: loading ? undefined : String(documents.length),
        footer: `${drafts} in draft`,
      },
      { label: "Published", value: count((d) => d.status === "Published"), footer: "Final and live" },
      { label: "In review", value: count((d) => d.status === "In review"), footer: "Awaiting sign-off" },
      { label: "Public links", value: count((d) => d.shareMode === "public"), footer: "Shared read-only" },
    ];
  }, [documents, loading]);

  const handleCreate = async ({ title, collectionId, body }) => {
    const input = buildNewDocument({ projectId, title, collectionId, body, settings, createdBy: userId });
    const created = await createDocument(input);
    if (!created) {
      toast.error("Couldn't create the document.");
      return null;
    }
    toast.success(`"${created.title}" created as a draft.`);
    openDocInTab(created.id, "Documents");
    return created;
  };

  const columns = [
    {
      key: "title",
      header: "Document",
      render: (d) => (
        <span className="block max-w-md truncate font-medium text-foreground">
          {d.title || "Untitled"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (d) => <StatusPill status={d.status} map={DOCUMENT_STATUS_MAP} />,
    },
    {
      key: "collection",
      header: "Collection",
      className: "text-text-secondary",
      render: (d) => (d.collectionId && collectionNames.get(d.collectionId)) || "—",
    },
    {
      key: "updated",
      header: "Updated",
      align: "right",
      className: "whitespace-nowrap text-text-secondary tabular-nums",
      render: (d) => formatRelative(d.updatedAt),
    },
  ];

  const newDocumentButton = (
    <Button
      className="bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={() => setCreateOpen(true)}
    >
      <Plus className="h-4 w-4" /> New document
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Overview"
        description="A snapshot of your project's documents: what's in review, what's published and what changed lately."
        actions={newDocumentButton}
      />

      <StatsBar stats={stats} />

      <SectionCard
        title="Recent documents"
        description="The latest edits across this project."
        bodyPadding={false}
        action={
          documents.length ? (
            <Button variant="ghost" size="sm" onClick={() => setTab("Documents")}>
              View all <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null
        }
      >
        {loading ? (
          <LoadingArea label="Loading recent documents" />
        ) : (
          <DataTable
            columns={columns}
            data={recent}
            getRowKey={(d) => d.id}
            onRowClick={(d) => openDocInTab(d.id, "Documents")}
            className="rounded-none border-0"
            empty={
              <EmptyState
                icon={FilePlus}
                title="No documents yet"
                description="Write your first document, or start from a template."
                action={newDocumentButton}
              />
            }
          />
        )}
      </SectionCard>

      <CreateDocumentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        collections={collections}
        templates={templates}
        onCreate={handleCreate}
      />
    </MainScreenWrapper>
  );
}

export default OverviewScreen;
