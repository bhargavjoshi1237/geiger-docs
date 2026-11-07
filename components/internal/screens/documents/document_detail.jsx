"use client";

import React, { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  FileText,
  History,
  Info,
  Link2,
  Loader2,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Save,
  Share2,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LoadingArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@geiger/ui";
import { EmptyState, InlineTitleInput, StatusPill } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { registerNavigationGuard, useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getUser } from "@/lib/supabase/user";
import { updateDocument } from "@/lib/supabase/documents";
import { createDocumentVersion } from "@/lib/supabase/document_versions";
import { listDocumentMembers } from "@/lib/supabase/document_members";
import {
  DOCUMENT_STATUS_MAP,
  SHARE_MODE_MAP,
  formatDate,
  formatRelative,
} from "@/components/internal/screens/documents/constants";
import {
  ACCESS_LABELS,
  canEdit,
  resolveDocumentAccess,
} from "@/components/internal/screens/documents/access";
import { ContentTab } from "@/components/internal/screens/documents/detail/content_tab";
import { DetailsTab } from "@/components/internal/screens/documents/detail/details_tab";
import { HistoryTab } from "@/components/internal/screens/documents/detail/history_tab";
import { SharingTab } from "@/components/internal/screens/documents/detail/sharing_tab";
import { CommentsTab } from "@/components/internal/screens/documents/detail/comments_tab";
import { copyPublicLink } from "@/components/internal/screens/documents/detail/utils";

const TABS = [
  { value: "content", label: "Content", icon: FileText },
  { value: "details", label: "Details", icon: Info },
  { value: "history", label: "History", icon: History },
  { value: "sharing", label: "Sharing", icon: Share2 },
  { value: "comments", label: "Comments", icon: MessageSquare },
];

const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";

// Tabbed document editor; keyed by id so all editor state resets when another document opens.
export function DocumentDetailScreen(props) {
  if (!props.document) return null;
  return <DocumentEditor key={props.document.id} {...props} />;
}

function DocumentEditor({ document, collections = [], settings, onBack, onChange, onDelete }) {
  const { section, setSection } = useWorkspaceUrl();
  const active = TABS.some((tab) => tab.value === section) ? section : "content";

  // Local copy is the editor's source of truth; every change is mirrored to the list via onChange.
  const [doc, setDoc] = useState(document);
  const docRef = useRef(document);
  const [draft, setDraft] = useState(document.body ?? "");
  const [titleDraft, setTitleDraft] = useState(null);
  const skipTitleCommit = useRef(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [versionKey, setVersionKey] = useState(0);
  const [confirm, setConfirm] = useState(null);

  const [user, setUser] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersReady, setMembersReady] = useState(false);
  const [ready, setReady] = useState(false);

  const restricted = doc.shareMode === "restricted";
  const access = resolveDocumentAccess(doc, user, members);
  const editable = canEdit(access);
  const dirty = editable && draft !== (doc.body ?? "");
  const share = SHARE_MODE_MAP[doc.shareMode] || SHARE_MODE_MAP.workspace;

  // Resolve who is looking (and, for restricted docs, who was invited) before rendering anything editable.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getUser().catch(() => null),
      restricted ? listDocumentMembers(doc.id) : Promise.resolve(null),
    ]).then(([me, rows]) => {
      if (cancelled) return;
      setUser(me);
      if (rows) setMembers(rows);
      if (restricted) setMembersReady(true);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [doc.id, restricted]);

  const apply = (next) => {
    // Switching into restricted mode refetches members; show loading instead of the stale list.
    if (next.shareMode === "restricted" && docRef.current.shareMode !== "restricted") {
      setMembersReady(false);
    }
    docRef.current = next;
    setDoc(next);
    onChange?.(next);
  };

  // Optimistic update -> persist -> roll back the touched keys and toast on failure.
  const persist = async (patch, { success, error = "Couldn't save your changes." } = {}) => {
    const previous = docRef.current;
    apply({ ...previous, ...patch });
    const saved = await updateDocument(previous.id, patch);
    if (!saved) {
      const revert = Object.fromEntries(Object.keys(patch).map((key) => [key, previous[key]]));
      apply({ ...docRef.current, ...revert });
      toast.error(error);
      return null;
    }
    apply({ ...docRef.current, updatedAt: saved.updatedAt });
    if (success) toast.success(success);
    return saved;
  };

  // Content save: persist the body (and title on restore), then snapshot it as a new version.
  const saveContent = async ({ body = draft, title, silent = false } = {}) => {
    if (!editable || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    if (body !== draft) setDraft(body);
    const patch = { body };
    if (title !== undefined && title !== docRef.current.title) patch.title = title;
    const saved = await persist(patch, { error: "Couldn't save the document." });
    if (saved) {
      const version = await createDocumentVersion({
        documentId: saved.id,
        title: saved.title,
        body: saved.body,
        createdBy: user?.id ?? null,
      });
      setVersionKey((key) => key + 1);
      if (!version) toast.error("Saved, but couldn't record this version in history.");
      else if (!silent) toast.success(`Saved as version ${version.versionNumber}`);
    }
    savingRef.current = false;
    setSaving(false);
    return Boolean(saved);
  };

  const restoreVersion = (version) =>
    saveContent({ body: version.body, title: version.title || "Untitled", silent: true });

  const onSaveShortcut = useEffectEvent(() => {
    if (dirty) saveContent();
  });

  // Ctrl/Cmd+S saves from anywhere in the editor instead of opening the browser's save dialog.
  useEffect(() => {
    if (!editable) return undefined;
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSaveShortcut();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editable]);

  // Warn before a reload or tab close drops unsaved edits.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    const releaseGuard = registerNavigationGuard(() =>
      window.confirm("You have unsaved changes. Leave without saving?"),
    );
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      releaseGuard();
    };
  }, [dirty]);

  const commitTitle = () => {
    if (skipTitleCommit.current) {
      skipTitleCommit.current = false;
      setTitleDraft(null);
      return;
    }
    if (titleDraft === null) return;
    const next = titleDraft.trim() || "Untitled";
    setTitleDraft(null);
    if (next === docRef.current.title) return;
    persist({ title: next }, { success: "Title updated", error: "Couldn't rename the document." });
  };

  const handleBack = () => (dirty ? setConfirm("discard") : onBack?.());

  const saveAndClose = async () => {
    const ok = await saveContent();
    if (!ok) return;
    setConfirm(null);
    onBack?.();
  };

  const discardAndClose = () => {
    setConfirm(null);
    onBack?.();
  };

  const confirmDelete = () => {
    setConfirm(null);
    onDelete?.(doc.id);
  };

  const backLink = (
    <button
      type="button"
      onClick={handleBack}
      className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Documents
    </button>
  );

  if (!ready) {
    return (
      <MainScreenWrapper>
        <LoadingArea label="Loading document" />
      </MainScreenWrapper>
    );
  }

  if (access === "none") {
    return (
      <MainScreenWrapper>
        <div>
          {backLink}
          <EmptyState
            icon={Lock}
            title="You don't have access to this document"
            description="It's shared with specific people. Ask its owner to add you."
            className="rounded-xl border border-border bg-surface-subtle"
            action={
              <Button variant="outline" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" /> Back to documents
              </Button>
            }
          />
        </div>
      </MainScreenWrapper>
    );
  }

  const isPublic = doc.shareMode === "public";
  const ShareIcon = share.icon;

  return (
    <MainScreenWrapper>
      <div className="border-b border-border pb-6">
        {backLink}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex min-h-9 flex-wrap items-center gap-2.5">
              {editable ? (
                <InlineTitleInput
                  value={titleDraft ?? doc.title}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      skipTitleCommit.current = true;
                      e.currentTarget.blur();
                    }
                  }}
                  maxLength={200}
                  aria-label="Document title"
                  className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
                />
              ) : (
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {doc.title || "Untitled"}
                </h1>
              )}
              <StatusPill status={doc.status} map={DOCUMENT_STATUS_MAP} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-muted-foreground">
              {editable ? (
                <SaveIndicator saving={saving} dirty={dirty} />
              ) : (
                <Badge variant="outline">{ACCESS_LABELS[access]}</Badge>
              )}
              <span title={formatDate(doc.updatedAt)}>Updated {formatRelative(doc.updatedAt)}</span>
              <span className="inline-flex items-center gap-1.5">
                <ShareIcon className="h-3.5 w-3.5" />
                {share.label}
              </span>
            </div>
          </div>

          <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2">
            {editable ? (
              <Button className={PRIMARY} onClick={() => saveContent()} disabled={!dirty || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            ) : null}
            {isPublic || editable ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Document actions"
                    className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 border-border bg-surface-subtle">
                  {isPublic ? (
                    <DropdownMenuItem onSelect={() => copyPublicLink(doc.id)}>
                      <Link2 />
                      Copy public link
                    </DropdownMenuItem>
                  ) : null}
                  {isPublic && editable ? <DropdownMenuSeparator /> : null}
                  {editable ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setConfirm("delete")}
                      className="text-red-400 focus:bg-red-500/10"
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </div>

      <Tabs value={active} onValueChange={setSection} className="gap-6">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="flex-none">
              <Icon />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="content">
          <ContentTab draft={draft} onDraftChange={setDraft} editable={editable} />
        </TabsContent>
        <TabsContent value="details">
          <DetailsTab
            document={doc}
            collections={collections}
            editable={editable}
            access={access}
            onPersist={persist}
          />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab
            document={doc}
            editable={editable}
            dirty={dirty}
            versionKey={versionKey}
            onRestore={restoreVersion}
          />
        </TabsContent>
        <TabsContent value="sharing">
          <SharingTab
            document={doc}
            settings={settings}
            access={access}
            user={user}
            members={members}
            membersReady={membersReady}
            setMembers={setMembers}
            onPersist={persist}
          />
        </TabsContent>
        <TabsContent value="comments">
          <CommentsTab document={doc} user={user} access={access} />
        </TabsContent>
      </Tabs>

      <Dialog open={confirm === "delete"} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              &ldquo;{doc.title || "Untitled"}&rdquo; will be removed from this project, along with
              its history, sharing and comments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="h-4 w-4" />
              Delete document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm === "discard"} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              You have edits that haven&apos;t been saved. Save them before leaving, or discard them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={saving}>
              Keep editing
            </Button>
            <Button variant="outline" onClick={discardAndClose} disabled={saving}>
              Discard
            </Button>
            <Button className={PRIMARY} onClick={saveAndClose} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save &amp; close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

function SaveIndicator({ saving, dirty }) {
  return (
    <span aria-live="polite" className="inline-flex items-center gap-1.5">
      {saving ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saving…
        </>
      ) : dirty ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
        </>
      ) : (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          Saved
        </>
      )}
    </span>
  );
}

export default DocumentDetailScreen;
