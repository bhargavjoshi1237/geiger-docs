"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, FilePlus2, LayoutTemplate, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { ActionMenu, Badge, Button, LoadingArea } from "@geiger/ui";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { FilterDropdown } from "@/components/internal/shared/filter_dropdown";
import { formatDate, formatRelative } from "@/components/internal/screens/documents/constants";
import { buildNewDocument } from "@/components/internal/screens/documents/create_document_dialog";
import {
  DEFAULT_TEMPLATE_CATEGORY,
  DeleteTemplateDialog,
  TemplateDialog,
} from "@/components/internal/screens/templates/template_dialog";
import { useProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getUser } from "@/lib/supabase/user";
import { getSettings } from "@/lib/supabase/settings";
import { createDocument } from "@/lib/supabase/documents";
import {
  createTemplate,
  listTemplates,
  softDeleteTemplate,
  updateTemplate,
} from "@/lib/supabase/templates";

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const compareText = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });

// Same order as listTemplates (name asc) so optimistic rows land where a refetch would put them.
const byName = (a, b) => compareText(a.name, b.name);

const EDITABLE_KEYS = ["name", "category", "description", "body"];

export function TemplatesScreen() {
  const { projectId } = useProject();
  const { openDocInTab } = useWorkspaceUrl();
  const [templates, setTemplates] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [editor, setEditor] = useState({ open: false, template: null });
  const [removal, setRemoval] = useState({ open: false, template: null });
  const [usingId, setUsingId] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listTemplates(projectId), getSettings(projectId)]).then(([rows, config]) => {
      if (!alive) return;
      setTemplates(rows ?? []);
      setSettings(config);
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

  // Category filter built from the loaded templates, "all" sentinel first.
  const categoryOptions = useMemo(() => {
    const categories = [...new Set(templates.map((t) => t.category || DEFAULT_TEMPLATE_CATEGORY))];
    return [
      { value: "all", label: "All categories" },
      ...categories.sort(compareText).map((c) => ({ value: c, label: c })),
    ];
  }, [templates]);

  // Falls back to "all" once the selected category no longer exists.
  const activeCategory = categoryOptions.some((o) => o.value === category) ? category : "all";

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (activeCategory !== "all" && (t.category || DEFAULT_TEMPLATE_CATEGORY) !== activeCategory) {
        return false;
      }
      if (query && !`${t.name} ${t.description} ${t.category}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [templates, search, activeCategory]);

  const openCreate = () => setEditor({ open: true, template: null });
  const openEdit = (template) => setEditor({ open: true, template });
  const openDelete = (template) => setRemoval({ open: true, template });

  const clearFilters = () => {
    setSearch("");
    setCategory("all");
  };

  // Optimistic insert shared by create and duplicate.
  const insertTemplate = async (values, successMessage) => {
    const now = new Date().toISOString();
    const optimistic = {
      id: crypto.randomUUID(),
      projectId,
      ...values,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    setTemplates((prev) => [...prev, optimistic].sort(byName));
    const created = await createTemplate(optimistic);
    if (created) {
      setTemplates((prev) => prev.map((t) => (t.id === created.id ? created : t)));
      toast.success(successMessage);
    } else {
      setTemplates((prev) => prev.filter((t) => t.id !== optimistic.id));
      toast.error("Couldn't save the template.");
    }
  };

  const handleUpdate = async (template, values) => {
    if (EDITABLE_KEYS.every((key) => values[key] === template[key])) return;
    setTemplates((prev) =>
      prev
        .map((t) => (t.id === template.id ? { ...t, ...values, updatedAt: new Date().toISOString() } : t))
        .sort(byName),
    );
    const saved = await updateTemplate(template.id, values);
    if (saved) {
      setTemplates((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      toast.success("Template saved.");
    } else {
      setTemplates((prev) => prev.map((t) => (t.id === template.id ? template : t)).sort(byName));
      toast.error("Couldn't save the template.");
    }
  };

  const handleSave = (values) => {
    if (editor.template) handleUpdate(editor.template, values);
    else insertTemplate(values, `Created "${values.name}".`);
  };

  const handleDuplicate = (template) =>
    insertTemplate(
      {
        name: `${template.name} (copy)`,
        category: template.category,
        description: template.description,
        body: template.body,
      },
      `Duplicated "${template.name}".`,
    );

  const handleDelete = async () => {
    const template = removal.template;
    if (!template) return;
    setRemoval((prev) => ({ ...prev, open: false }));
    setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    const ok = await softDeleteTemplate(template.id);
    if (ok) {
      toast.success(`Deleted "${template.name}".`);
    } else {
      setTemplates((prev) => [...prev, template].sort(byName));
      toast.error("Couldn't delete the template.");
    }
  };

  // Creates a Draft document from the template, then opens it in the Documents editor.
  const handleUse = async (template) => {
    if (usingId) return;
    setUsingId(template.id);
    const created = await createDocument(
      buildNewDocument({
        projectId,
        title: template.name,
        body: template.body,
        settings,
        createdBy: userId,
      }),
    );
    setUsingId(null);
    if (created) {
      toast.success(`Created "${created.title}" from the template.`);
      openDocInTab(created.id, "Documents");
    } else {
      toast.error("Couldn't create a document from this template.");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Template",
      render: (t) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium text-foreground">{t.name || "Untitled template"}</span>
          <span className="max-w-md truncate text-xs text-text-secondary">
            {t.description || "No description"}
          </span>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (t) => <Badge variant="neutral">{t.category || DEFAULT_TEMPLATE_CATEGORY}</Badge>,
    },
    {
      key: "updated",
      header: "Updated",
      render: (t) => (
        <span className="text-sm text-text-secondary" title={formatDate(t.updatedAt)}>
          {formatRelative(t.updatedAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12 text-right",
      render: (t) => {
        const busy = usingId === t.id;
        return (
          <ActionMenu
            label={`Actions for ${t.name}`}
            items={[
              {
                icon: busy ? Loader2 : FilePlus2,
                spin: busy,
                label: busy ? "Creating…" : "Use template",
                disabled: Boolean(usingId),
                onSelect: () => handleUse(t),
              },
              { icon: Pencil, label: "Edit", onSelect: () => openEdit(t) },
              { icon: Copy, label: "Duplicate", onSelect: () => handleDuplicate(t) },
              { separator: true },
              { icon: Trash2, label: "Delete", destructive: true, onSelect: () => openDelete(t) },
            ]}
          />
        );
      },
    },
  ];

  const newButton = (
    <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openCreate}>
      <Plus className="h-4 w-4" /> New template
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Templates"
        description="Reusable Markdown starting points. Use one to spin up a new draft document in a click."
        actions={newButton}
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown
            value={activeCategory}
            onValueChange={setCategory}
            options={categoryOptions}
            placeholder="All categories"
          />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search templates…" />
      </Toolbar>

      {loading ? (
        <LoadingArea panel label="Loading templates" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(t) => t.id}
          onRowClick={openEdit}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              {templates.length ? (
                <EmptyState
                  icon={LayoutTemplate}
                  title="No templates match your filters"
                  description="Try clearing the search or category, or create a new template."
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                        Clear filters
                      </Button>
                      {newButton}
                    </div>
                  }
                />
              ) : (
                <EmptyState
                  icon={LayoutTemplate}
                  title="No templates yet"
                  description="Save meeting notes, briefs or policies as templates to start new documents faster."
                  action={newButton}
                />
              )}
            </div>
          }
        />
      )}

      <TemplateDialog
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        template={editor.template}
        onSave={handleSave}
      />
      <DeleteTemplateDialog
        open={removal.open}
        onOpenChange={(open) => setRemoval((prev) => ({ ...prev, open }))}
        template={removal.template}
        onConfirm={handleDelete}
      />
    </MainScreenWrapper>
  );
}

export default TemplatesScreen;
