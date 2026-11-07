"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, FileText, Link2Off, Share2 } from "lucide-react";
import { Badge, Button, LoadingArea } from "@geiger/ui";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { FilterDropdown } from "@/components/internal/shared/filter_dropdown";
import {
  DOCUMENT_STATUS_MAP,
  SHARE_FILTER_OPTIONS,
  SHARE_MODE_MAP,
  formatDate,
  formatRelative,
  publicDocumentUrl,
  wordCount,
} from "@/components/internal/screens/documents/constants";
import { useProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { isSupabaseConfigured } from "@/supabase/components/docs-client";
import { listDocuments } from "@/lib/supabase/documents";
import { getSettings } from "@/lib/supabase/settings";

// Workspace-only documents never appear here, so their filter option is dropped.
const MODE_FILTER_OPTIONS = SHARE_FILTER_OPTIONS.filter((opt) => opt.value !== "workspace");

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

export function SharedScreen() {
  const { projectId } = useProject();
  const { openDocInTab, setTab } = useWorkspaceUrl();

  const [documents, setDocuments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("all");

  useEffect(() => {
    let alive = true;
    Promise.all([listDocuments(projectId), getSettings(projectId)]).then(([rows, prefs]) => {
      if (!alive) return;
      if (rows === null && isSupabaseConfigured()) toast.error("Couldn't load shared documents.");
      setDocuments(rows ?? []);
      setSettings(prefs);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const shared = useMemo(
    () => documents.filter((doc) => doc.shareMode !== "workspace"),
    [documents],
  );

  const stats = useMemo(() => {
    const publicDocs = shared.filter((doc) => doc.shareMode === "public");
    return [
      { label: "Shared documents", value: String(shared.length) },
      { label: "Public links", value: String(publicDocs.length) },
      {
        label: "Specific people",
        value: String(shared.filter((doc) => doc.shareMode === "restricted").length),
      },
      {
        label: "Published & public",
        value: String(publicDocs.filter((doc) => doc.status === "Published").length),
      },
    ];
  }, [shared]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return shared.filter((doc) => {
      if (mode !== "all" && doc.shareMode !== mode) return false;
      if (query && !String(doc.title || "").toLowerCase().includes(query)) return false;
      return true;
    });
  }, [shared, search, mode]);

  const publicLinksOff = settings?.allowPublicLinks === false;
  const hasFilters = mode !== "all" || search.trim() !== "";

  const clearFilters = () => {
    setMode("all");
    setSearch("");
  };

  const copyLink = async (doc) => {
    try {
      await navigator.clipboard.writeText(publicDocumentUrl(doc.id));
      toast.success("Public link copied");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const columns = [
    {
      key: "title",
      header: "Document",
      render: (doc) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium text-foreground">{doc.title || "Untitled"}</span>
          <span className="text-xs text-text-secondary">
            {wordCount(doc.body).toLocaleString()} words
          </span>
        </div>
      ),
    },
    {
      key: "sharing",
      header: "Sharing",
      render: (doc) => <ShareBadge mode={doc.shareMode} />,
    },
    {
      key: "status",
      header: "Status",
      render: (doc) => <StatusPill status={doc.status} map={DOCUMENT_STATUS_MAP} />,
    },
    {
      key: "updated",
      header: "Updated",
      className: "whitespace-nowrap text-text-secondary",
      render: (doc) => <span title={formatDate(doc.updatedAt)}>{formatRelative(doc.updatedAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (doc) =>
        doc.shareMode === "public" ? (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Copy public link for ${doc.title || "Untitled"}`}
              title={publicLinksOff ? "Public links are turned off in Settings" : "Copy public link"}
              disabled={publicLinksOff}
              onClick={() => copyLink(doc)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Copy />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Open public page for ${doc.title || "Untitled"}`}
              title={publicLinksOff ? "Public links are turned off in Settings" : "Open public page"}
              disabled={publicLinksOff}
              onClick={() => window.open(publicDocumentUrl(doc.id), "_blank", "noopener,noreferrer")}
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Shared"
        description="Documents shared beyond the workspace, through a public link or with specific people."
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={mode} onValueChange={setMode} options={MODE_FILTER_OPTIONS} />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search shared documents…" />
      </Toolbar>

      {publicLinksOff ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Link2Off className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
            <p className="text-sm text-text-secondary">
              Public links are turned off in Settings, so documents shared by public link won&apos;t
              open for anyone until they&apos;re turned back on.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 self-start sm:self-auto"
            onClick={() => setTab("Settings")}
          >
            Open Settings
          </Button>
        </div>
      ) : null}

      {loading ? (
        <LoadingArea panel label="Loading shared documents" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(doc) => doc.id}
          onRowClick={(doc) => openDocInTab(doc.id, "Documents")}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              {shared.length ? (
                <EmptyState
                  icon={Share2}
                  title="No shared documents match your filters"
                  description="Try clearing the search or the sharing filter."
                  action={
                    hasFilters ? (
                      <Button variant="outline" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <EmptyState
                  icon={Share2}
                  title="Nothing is shared yet"
                  description="Documents stay in the workspace until you share them. Open a document and use its Sharing tab to publish a public link or invite specific people."
                  action={
                    <Button
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => setTab("Documents")}
                    >
                      <FileText className="h-4 w-4" /> Go to Documents
                    </Button>
                  }
                />
              )}
            </div>
          }
        />
      )}
    </MainScreenWrapper>
  );
}

export default SharedScreen;
