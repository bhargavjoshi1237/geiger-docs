"use client";

import React, { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BellRing,
  ChevronRight,
  CircleX,
  Download,
  FileCheck,
  Loader2,
  Plug,
  RefreshCw,
  Save,
  ScrollText,
  Send,
  Signature,
  TriangleAlert,
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
  LoadingArea,
  Progress,
  Textarea,
} from "@geiger/ui";
import {
  EditorSectionHeader,
  EmptyState,
  Field,
  SectionCard,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import {
  RECIPIENT_PROGRESS_MAP,
  RECIPIENT_ROLE_MAP,
  SIGNING_ORDER_MAP,
  SIGNING_STATUS_MAP,
  formatDateTime,
  formatRelative,
  recipientProgress,
} from "@/components/internal/screens/documents/constants";
import { isLockingStatus, isOpenStatus } from "@/lib/signing/model";
import { apiRequest, apiUrl } from "@/lib/client/api";
import { listSigningRequests } from "@/lib/supabase/signing";
import { cn } from "@/lib/utils";
import { SendForSignatureDialog } from "./send_for_signature_dialog";

const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";
const NOT_CONFIGURED_MESSAGE = "Signing isn't set up yet. Ask an admin to connect Documenso and its webhook.";
const FALLBACK_ERROR = "Something went wrong. Please try again.";

// Completed-request files served by GET /api/signing/requests/<id>/files/<kind> (302 to a short-lived URL).
const FILES = [
  { kind: "signed", flag: "hasSignedPdf", label: "Signed PDF", icon: Download },
  { kind: "certificate", flag: "hasCertificate", label: "Certificate", icon: FileCheck },
  { kind: "audit", flag: "hasAuditLog", label: "Audit log", icon: ScrollText },
];

const CLOSED_LABELS = { cancelled: "Cancelled", declined: "Declined", failed: "Failed" };

const fileUrl = (requestId, kind) => apiUrl(`/api/signing/requests/${requestId}/files/${kind}`);

// Signing requests for one document: the latest in full, earlier ones collapsed; all writes go through /api/signing/*.
export function SigningTab({ document, editable, isOwner, dirty, saving, onSave, onSigningChange }) {
  const [config, setConfig] = useState("loading");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendKey, setSendKey] = useState(0);
  const [saveFirstOpen, setSaveFirstOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  // "cancel" (via Documenso) | "failed" (Documenso refused; owners may force) | "force" (owner close without Documenso).
  const [cancelMode, setCancelMode] = useState("cancel");
  const [expandedId, setExpandedId] = useState(null);
  const loadSeq = useRef(0);
  const loadedRef = useRef(false);

  const configured = config === "ready";

  // GET /api/signing/config -> "ready" | "unconfigured" | "error".
  const checkConfig = (signal) =>
    apiRequest("/api/signing/config", { signal }).then(({ data, error, code }) => {
      if (code === "aborted") return;
      if (error) setConfig(code === "signing_not_configured" ? "unconfigured" : "error");
      else setConfig(data?.configured ? "ready" : "unconfigured");
    });

  // Mirrors the latest request's status onto the editor's doc (lock + list pill); the parent ignores no-op changes.
  const syncSigning = (request) => {
    if (request?.id) onSigningChange?.({ requestId: request.id, status: request.status });
  };

  // Rereads requests from Supabase; out-of-order responses are dropped.
  const refresh = () => {
    const seq = ++loadSeq.current;
    return listSigningRequests(document.id).then((rows) => {
      if (seq !== loadSeq.current) return;
      const firstLoad = !loadedRef.current;
      loadedRef.current = true;
      setLoading(false);
      // Only the first failure toasts; a failed background reread keeps the rows already shown.
      if (rows === null) {
        if (firstLoad) toast.error("Couldn't load signing requests.");
        return;
      }
      setRequests(rows);
      syncSigning(rows[0]);
    });
  };

  const onMount = useEffectEvent((signal) => {
    checkConfig(signal);
    refresh();
  });
  const onFocus = useEffectEvent(() => refresh());

  useEffect(() => {
    const controller = new AbortController();
    onMount(controller.signal);
    return () => controller.abort();
  }, []);

  // Webhooks update the rows server-side, so coming back to the tab rereads them.
  useEffect(() => {
    const handleFocus = () => onFocus();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const retryConfig = () => {
    setConfig("loading");
    checkConfig();
  };

  const mergeRequest = (next) => {
    if (!next?.id) return;
    setRequests((prev) => prev.map((r) => (r.id === next.id ? next : r)));
    if (requests[0]?.id === next.id) syncSigning(next);
  };

  // Shared mutation runner: spinner on the clicked button, toast either way, then reread; resolves { ok, code }.
  const runAction = async (action, request, { body, success, busyKey = action }) => {
    setBusy(`${busyKey}:${request.id}`);
    const { data, error, code } = await apiRequest(`/api/signing/requests/${request.id}/${action}`, {
      method: "POST",
      body,
    });
    setBusy(null);
    if (error) {
      if (code === "signing_not_configured") setConfig("unconfigured");
      toast.error(error || (code === "signing_not_configured" ? NOT_CONFIGURED_MESSAGE : FALLBACK_ERROR));
      refresh();
      return { ok: false, code };
    }
    mergeRequest(data?.request);
    toast.success(success);
    refresh();
    return { ok: true, code: null };
  };

  const remind = (request) =>
    runAction("remind", request, { body: {}, success: "Reminder sent to everyone who hasn't signed yet" });

  const syncStatus = (request) => runAction("sync", request, { success: "Signing status refreshed" });

  // force: owner-only close recorded locally as cancelled, for when Documenso can't cancel or isn't connected.
  const confirmCancel = async (force = false) => {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    const body = { ...(reason ? { reason } : {}), ...(force ? { force: true } : {}) };
    const result = await runAction("cancel", cancelTarget, {
      body,
      busyKey: force ? "force" : "cancel",
      success: force ? "Signing request closed" : "Signing request cancelled",
    });
    if (result.ok) closeCancel();
    else if (!force && result.code === "documenso_failed") setCancelMode("failed");
  };

  const openCancel = (request, mode = "cancel") => {
    setCancelReason("");
    setCancelMode(mode);
    setCancelTarget(request);
  };

  const closeCancel = () => {
    setCancelTarget(null);
    setCancelReason("");
    setCancelMode("cancel");
  };

  const openSendDialog = () => {
    setSendKey((key) => key + 1);
    setSendOpen(true);
  };

  // Recipients sign the saved body, so unsaved edits are saved first.
  const startSend = () => {
    if (dirty) setSaveFirstOpen(true);
    else openSendDialog();
  };

  const saveAndContinue = async () => {
    const ok = await onSave?.();
    if (!ok) return;
    setSaveFirstOpen(false);
    openSendDialog();
  };

  const handleSent = (request) => {
    setSendOpen(false);
    if (request?.id) {
      setRequests((prev) => [request, ...prev.filter((r) => r.id !== request.id)]);
      syncSigning(request);
    }
    refresh();
  };

  const handleSendFailed = ({ code }) => {
    if (code === "signing_not_configured") setConfig("unconfigured");
    refresh();
  };

  if (loading || config === "loading") return <LoadingArea panel label="Loading signing" />;

  const latest = requests[0] ?? null;
  const history = requests.slice(1);
  const canSend =
    editable &&
    configured &&
    !isLockingStatus(latest?.status) &&
    !isLockingStatus(document.signing?.status);

  // Without a working connection an open request would stay locked forever, so its owner can close it locally.
  const canForceClose = Boolean(isOwner) && !configured && isOpenStatus(latest?.status);

  const sendButton = (
    <Button className={PRIMARY} onClick={startSend} disabled={saving}>
      <Send className="h-4 w-4" />
      Send for signature
    </Button>
  );

  const header = (
    <EditorSectionHeader
      title="Signing"
      description="Send this document for e-signature and follow each recipient's progress."
      action={latest && canSend ? sendButton : null}
    />
  );

  let body;
  if (!latest && config === "unconfigured") {
    body = (
      <EmptyState
        icon={Plug}
        title="Signing isn't set up"
        description="An admin needs to connect Documenso and its webhook before documents can be sent for signature."
        className="rounded-xl border border-border bg-surface-subtle"
      />
    );
  } else if (!latest && config === "error") {
    body = (
      <EmptyState
        icon={TriangleAlert}
        title="Couldn't check signing"
        description="We couldn't reach the signing settings. Try again in a moment."
        className="rounded-xl border border-border bg-surface-subtle"
        action={
          <Button variant="outline" onClick={retryConfig}>
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        }
      />
    );
  } else if (!latest) {
    body = (
      <EmptyState
        icon={Signature}
        title="Not sent for signature yet"
        description={
          editable
            ? "Send it to the people who need to sign, approve or receive a copy."
            : "Owners and editors can send this document for signature."
        }
        className="rounded-xl border border-border bg-surface-subtle"
        action={canSend ? sendButton : null}
      />
    );
  } else {
    body = (
      <>
        {config === "unconfigured" || config === "error" ? (
          <ConnectionNotice state={config} onRetry={retryConfig} canForceClose={canForceClose} />
        ) : null}
        <RequestCard
          request={latest}
          canManage={editable && configured}
          canForceClose={canForceClose}
          busy={busy}
          onRemind={remind}
          onSync={syncStatus}
          onCancel={openCancel}
          onForceClose={(request) => openCancel(request, "force")}
        />
        {history.length ? (
          <SectionCard
            title="Earlier requests"
            description={`${history.length} past ${history.length === 1 ? "request" : "requests"}`}
            bodyPadding={false}
          >
            <ul className="divide-y divide-border">
              {history.map((request) => (
                <HistoryRow
                  key={request.id}
                  request={request}
                  expanded={expandedId === request.id}
                  onToggle={() => setExpandedId((id) => (id === request.id ? null : request.id))}
                />
              ))}
            </ul>
          </SectionCard>
        ) : null}
      </>
    );
  }

  const cancelBusy = Boolean(cancelTarget) && busy === `cancel:${cancelTarget.id}`;
  const forceBusy = Boolean(cancelTarget) && busy === `force:${cancelTarget.id}`;
  const cancelling = cancelBusy || forceBusy;

  return (
    <div className="space-y-6">
      {header}
      {body}

      <SendForSignatureDialog
        key={sendKey}
        open={sendOpen}
        onOpenChange={setSendOpen}
        document={document}
        onSent={handleSent}
        onFailed={handleSendFailed}
      />

      <Dialog open={saveFirstOpen} onOpenChange={(open) => !open && !saving && setSaveFirstOpen(false)}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save before sending?</DialogTitle>
            <DialogDescription>
              Recipients sign the saved version. Save your changes so they&apos;re included in what
              you send.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveFirstOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className={PRIMARY} onClick={saveAndContinue} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save and continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelTarget)} onOpenChange={(open) => !open && !cancelling && closeCancel()}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {cancelMode === "force" ? "Close signing request?" : "Cancel signing request?"}
            </DialogTitle>
            <DialogDescription>
              {cancelMode === "force"
                ? "Signing isn't connected, so this closes the request here without Documenso. The document unlocks for editing."
                : "Recipients can no longer sign, and the document unlocks for editing. You can send it again later."}
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason (optional)" htmlFor="signing-cancel-reason">
            <Textarea
              id="signing-cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Terms changed, sending a new version"
              rows={3}
              maxLength={500}
              disabled={cancelling}
            />
          </Field>
          {cancelMode === "failed" ? (
            <p
              role="alert"
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
            >
              Documenso couldn&apos;t cancel this request.{" "}
              {isOwner
                ? "You can try again, or close it here without Documenso. If Documenso is reachable, signers may still be able to sign there."
                : "Try again later, or ask the document owner to close it without Documenso."}
            </p>
          ) : null}
          {cancelMode === "force" ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              If Documenso is still reachable, signers may still be able to sign there.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={closeCancel} disabled={cancelling}>
              Keep request
            </Button>
            {cancelMode !== "force" ? (
              <Button
                variant={cancelMode === "failed" ? "outline" : "destructive"}
                onClick={() => confirmCancel(false)}
                disabled={cancelling}
              >
                {cancelBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleX className="h-4 w-4" />}
                {cancelMode === "failed" ? "Try again" : "Cancel request"}
              </Button>
            ) : null}
            {cancelMode !== "cancel" && isOwner ? (
              <Button variant="destructive" onClick={() => confirmCancel(true)} disabled={cancelling}>
                {forceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleX className="h-4 w-4" />}
                {cancelMode === "force" ? "Close request" : "Close without Documenso"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConnectionNotice({ state, onRetry, canForceClose }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <p className="text-sm text-foreground">
          {state === "unconfigured"
            ? "Signing isn't connected right now (an admin needs to connect Documenso and its webhook), so requests can't be sent, reminded or refreshed. Completed files can still be downloaded."
            : "We couldn't check the signing connection. Request actions are paused until it's back."}
          {canForceClose
            ? " As the owner, you can close the open request without Documenso to unlock the document."
            : null}
        </p>
      </div>
      {state === "error" ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

function MetaItem({ label, children, title }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground" title={title}>
        {children}
      </dd>
    </div>
  );
}

// Every request's timeline facts, newest-relevant first.
function requestMeta(request) {
  const order = SIGNING_ORDER_MAP[request.signingOrder] || SIGNING_ORDER_MAP.parallel;
  const items = [
    {
      label: "Sent",
      value: request.sentAt
        ? formatDateTime(request.sentAt)
        : request.status === "sending"
          ? "Sending…"
          : "Not sent",
    },
  ];
  if (request.completedAt) items.push({ label: "Completed", value: formatDateTime(request.completedAt) });
  else if (request.closedAt && CLOSED_LABELS[request.status]) {
    items.push({ label: CLOSED_LABELS[request.status], value: formatDateTime(request.closedAt) });
  }
  items.push({ label: "Signing order", value: order.label, title: order.description });
  if (request.versionNumber) items.push({ label: "Version", value: `v${request.versionNumber}` });
  return items;
}

function FileLinks({ request }) {
  const files = FILES.filter((file) => request[file.flag]);
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map(({ kind, label, icon: Icon }) => (
        <Button key={kind} variant="outline" size="sm" asChild>
          <a href={fileUrl(request.id, kind)} target="_blank" rel="noopener noreferrer">
            <Icon className="h-4 w-4" />
            {label}
          </a>
        </Button>
      ))}
    </div>
  );
}

function RequestCard({
  request,
  canManage,
  canForceClose,
  busy,
  onRemind,
  onSync,
  onCancel,
  onForceClose,
}) {
  const open = isOpenStatus(request.status);
  const recipients = request.recipients || [];
  const actors = recipients.filter((r) => r.role !== "cc");
  const done = actors.filter((r) => r.signingStatus === "signed").length;
  const percent = actors.length ? Math.round((done / actors.length) * 100) : 0;
  const isBusy = (action) => busy === `${action}:${request.id}`;
  const anyBusy = typeof busy === "string" && busy.endsWith(`:${request.id}`);
  const hasFiles = FILES.some((file) => request[file.flag]);
  const sentLabel = request.sentAt ? `Sent ${formatRelative(request.sentAt)}` : null;

  return (
    <SectionCard
      title={open ? "Current request" : "Latest request"}
      description={[`${done} of ${actors.length} signed`, sentLabel].filter(Boolean).join(" · ")}
      action={<StatusPill status={request.status} map={SIGNING_STATUS_MAP} />}
      bodyPadding={false}
    >
      <div className="space-y-4 border-b border-border px-5 py-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {requestMeta(request).map((item) => (
            <MetaItem key={item.label} label={item.label} title={item.title}>
              {item.value}
            </MetaItem>
          ))}
        </dl>
        <dl className="grid gap-3">
          <MetaItem label="Subject" title={request.subject}>
            {request.subject || request.title || "—"}
          </MetaItem>
          {request.message ? (
            <div className="min-w-0">
              <dt className="text-xs text-text-tertiary">Message</dt>
              <dd className="mt-0.5 whitespace-pre-line text-sm text-text-secondary">{request.message}</dd>
            </div>
          ) : null}
        </dl>
        {actors.length ? (
          <Progress value={percent} aria-label={`${done} of ${actors.length} signed`} className="h-1.5" />
        ) : null}
        {request.status === "failed" && request.error ? <ErrorNote text={request.error} /> : null}
      </div>

      <RecipientList recipients={recipients} open={open} />

      {canManage || canForceClose || hasFiles ? (
        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <FileLinks request={request} />
          {canForceClose ? (
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onForceClose(request)}
                disabled={anyBusy}
                className="text-red-400 hover:bg-red-500/10 hover:text-red-400"
              >
                <CircleX className="h-4 w-4" />
                Close request
              </Button>
            </div>
          ) : null}
          {canManage ? (
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {open ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancel(request)}
                  disabled={anyBusy}
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-400"
                >
                  <CircleX className="h-4 w-4" />
                  Cancel request
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => onSync(request)} disabled={anyBusy}>
                <RefreshCw className={cn("h-4 w-4", isBusy("sync") && "animate-spin")} />
                Refresh status
              </Button>
              {request.status === "pending" ? (
                <Button variant="outline" size="sm" onClick={() => onRemind(request)} disabled={anyBusy}>
                  {isBusy("remind") ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BellRing className="h-4 w-4" />
                  )}
                  Remind
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}

function ErrorNote({ text }) {
  return (
    <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
      {text}
    </p>
  );
}

function RecipientList({ recipients, open, className }) {
  if (!recipients.length) {
    return <p className={cn("px-5 py-6 text-center text-sm text-text-tertiary", className)}>No recipients.</p>;
  }
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {recipients.map((recipient) => (
        <RecipientRow key={recipient.id || recipient.position} recipient={recipient} open={open} />
      ))}
    </ul>
  );
}

// Human line under a recipient: when they signed or declined, or where an open request stands for them.
function progressDetail(recipient, progress, open) {
  const when = recipient.signedAt ? formatRelative(recipient.signedAt) : null;
  if (progress === "signed") return when ? `Signed ${when}` : "Signed";
  if (progress === "approved") return when ? `Approved ${when}` : "Approved";
  if (progress === "declined") return when ? `Declined ${when}` : "Declined";
  if (!open) return null;
  if (progress === "opened") return "Opened the request, not finished yet";
  if (progress === "not_opened") return "Hasn't opened the request yet";
  return null;
}

function RecipientRow({ recipient, open }) {
  const role = RECIPIENT_ROLE_MAP[recipient.role] || RECIPIENT_ROLE_MAP.signer;
  const RoleIcon = role.icon;
  const progress = recipientProgress(recipient);
  const detail = progressDetail(recipient, progress, open);
  const position = recipient.position;

  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span
        title={`Recipient ${position} (r${position})`}
        className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-card px-1.5 text-xs font-semibold tabular-nums text-foreground"
      >
        {position}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-foreground">
            {recipient.name || recipient.email}
          </span>
          <Badge variant={role.variant}>
            <RoleIcon />
            {role.label}
          </Badge>
        </div>
        <p className="truncate text-xs text-text-secondary">{recipient.email}</p>
        {detail ? (
          <p
            className="mt-0.5 text-xs text-text-tertiary"
            title={recipient.signedAt ? formatDateTime(recipient.signedAt) : undefined}
          >
            {detail}
          </p>
        ) : null}
        {progress === "declined" && recipient.rejectionReason ? (
          <p className="mt-1.5 rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-700 dark:text-red-400">
            &ldquo;{recipient.rejectionReason}&rdquo;
          </p>
        ) : null}
      </div>
      <StatusPill status={progress} map={RECIPIENT_PROGRESS_MAP} className="shrink-0" />
    </li>
  );
}

function HistoryRow({ request, expanded, onToggle }) {
  const when = request.sentAt || request.createdAt;
  const count = request.recipients?.length ?? 0;
  const panelId = `signing-request-${request.id}`;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover"
      >
        <ChevronRight
          className={cn("h-4 w-4 shrink-0 text-text-tertiary transition-transform", expanded && "rotate-90")}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {request.subject || request.title || "Signing request"}
          </span>
          <span className="block text-xs text-text-tertiary" title={formatDateTime(when)}>
            {formatRelative(when)} · {count === 1 ? "1 recipient" : `${count} recipients`}
            {request.versionNumber ? ` · v${request.versionNumber}` : ""}
          </span>
        </span>
        <StatusPill status={request.status} map={SIGNING_STATUS_MAP} className="shrink-0" />
      </button>
      {expanded ? (
        <div id={panelId} className="border-t border-border">
          {request.status === "failed" && request.error ? (
            <div className="px-5 pt-3">
              <ErrorNote text={request.error} />
            </div>
          ) : null}
          <RecipientList recipients={request.recipients || []} open={false} />
          {FILES.some((file) => request[file.flag]) ? (
            <div className="border-t border-border px-5 py-3">
              <FileLinks request={request} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default SigningTab;
