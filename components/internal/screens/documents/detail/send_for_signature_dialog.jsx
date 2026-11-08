"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, Loader2, Send, UserPlus, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@geiger/ui";
import { Field, SettingRow } from "@/components/internal/shared/screen_kit";
import { RECIPIENT_ROLE_MAP } from "@/components/internal/screens/documents/constants";
import { MAX_RECIPIENTS, RECIPIENT_ROLES, validateRecipients } from "@/lib/signing/model";
import { parseFieldTokens, validateFieldTokens } from "@/lib/signing/fields";
import { apiRequest, apiUrl } from "@/lib/client/api";

const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";
const CONFLICT_MESSAGE = "This document already has an open signing request.";
const NOT_CONFIGURED_MESSAGE = "Signing isn't set up yet. Ask an admin to connect Documenso and its webhook.";

// One empty signer row per rN the body already uses (at least one); later rows get random keys from handlers.
function initialRecipients(body) {
  const highest = parseFieldTokens(body).reduce((max, token) => Math.max(max, token.position), 0);
  const count = Math.min(MAX_RECIPIENTS, Math.max(1, highest));
  return Array.from({ length: count }, (_, index) => ({
    key: `initial-${index}`,
    name: "",
    email: "",
    role: "signer",
  }));
}

// Trimmed { name, email, role } rows in position order, as the API and validators expect them.
const toPayload = (rows) =>
  rows.map(({ name, email, role }) => ({ name: name.trim(), email: email.trim(), role }));

// Remount per open (key) so every send starts fresh from the saved body and title.
export function SendForSignatureDialog({ open, onOpenChange, document, onSent, onFailed }) {
  const [recipients, setRecipients] = useState(() => initialRecipients(document.body));
  const [sequential, setSequential] = useState(false);
  const [subject, setSubject] = useState(document.title || "");
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState(null);
  const [pending, setPending] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const fieldSummary = useMemo(() => {
    const tokens = parseFieldTokens(document.body);
    const page = "A signature page with a block for each signer is added at the end.";
    if (!tokens.length) return `${page} Add inline fields from Insert field in the Content tab.`;
    const positions = [...new Set(tokens.map((token) => token.position))].sort((a, b) => a - b);
    const fields = tokens.length === 1 ? "1 inline field" : `${tokens.length} inline fields`;
    return `${fields} for ${positions.map((p) => `r${p}`).join(", ")}. ${page}`;
  }, [document.body]);

  const handleOpenChange = (next) => {
    if (pending) return;
    onOpenChange(next);
  };

  const update = (key, field) => (value) => {
    setRecipients((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setProblem(null);
  };

  const addRecipient = () => {
    setRecipients((prev) =>
      prev.length >= MAX_RECIPIENTS
        ? prev
        : [...prev, { key: crypto.randomUUID(), name: "", email: "", role: "signer" }],
    );
    setProblem(null);
  };

  const removeRecipient = (key) => {
    setRecipients((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
    setProblem(null);
  };

  const moveRecipient = (index, delta) => {
    setRecipients((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setProblem(null);
  };

  // Renders the saved body server-side; the tab opens synchronously so pop-up blockers allow it.
  const previewPdf = async () => {
    if (previewing) return;
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setPreviewing(true);
    let res = null;
    try {
      res = await fetch(apiUrl("/api/signing/preview"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/pdf" },
        body: JSON.stringify({
          documentId: document.id,
          recipients: toPayload(recipients).map((r, index) => ({ ...r, position: index + 1 })),
        }),
      });
    } catch {
      res = null;
    }
    if (!res?.ok) {
      tab?.close();
      const json = res ? await res.json().catch(() => null) : null;
      const fallback = res ? "Couldn't build the preview." : "Network error. Check your connection and try again.";
      toast.error(json?.message || fallback);
      setPreviewing(false);
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setPreviewing(false);
  };

  const submit = async () => {
    if (pending) return;
    const list = toPayload(recipients);
    const issue = validateRecipients(list) || validateFieldTokens(document.body, list);
    if (issue) {
      setProblem(issue);
      toast.error(issue);
      return;
    }
    setProblem(null);
    setPending(true);
    const { data, error, status, code } = await apiRequest("/api/signing/requests", {
      method: "POST",
      body: {
        documentId: document.id,
        subject: subject.trim() || document.title || "Untitled",
        message: message.trim(),
        signingOrder: sequential ? "sequential" : "parallel",
        recipients: list,
      },
    });
    setPending(false);
    if (error) {
      // The server's message wins (409 has several causes); ours only fill in when it's empty.
      const fallback =
        status === 409
          ? CONFLICT_MESSAGE
          : code === "signing_not_configured"
            ? NOT_CONFIGURED_MESSAGE
            : "Couldn't send the document for signature.";
      const text = error || fallback;
      setProblem(text);
      toast.error(text);
      onFailed?.({ status, code });
      return;
    }
    toast.success(`Sent for signature to ${list.length === 1 ? "1 recipient" : `${list.length} recipients`}`);
    onSent?.(data?.request ?? null);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-background sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send for signature</DialogTitle>
          <DialogDescription>
            Recipients get an email with a link to sign the saved version of &ldquo;
            {document.title || "Untitled"}&rdquo;. Title and content stay locked until signing
            finishes or you cancel.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <section className="grid gap-3" aria-labelledby="signing-recipients-heading">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 id="signing-recipients-heading" className="text-sm font-medium text-foreground">
                  Recipients
                </h3>
                <p className="text-xs text-text-secondary">
                  {recipients.length} of {MAX_RECIPIENTS} · rN in the document matches Recipient N
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addRecipient}
                disabled={pending || recipients.length >= MAX_RECIPIENTS}
              >
                <UserPlus className="h-4 w-4" />
                Add recipient
              </Button>
            </div>

            <ol className="grid gap-2">
              {recipients.map((recipient, index) => {
                const n = index + 1;
                return (
                  <li key={recipient.key} className="rounded-lg border border-border bg-surface-subtle p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-text-secondary">
                        Recipient {n} <span className="font-mono text-text-tertiary">(r{n})</span>
                      </span>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => moveRecipient(index, -1)}
                          disabled={pending || index === 0}
                          aria-label={`Move recipient ${n} up`}
                          className="text-text-secondary"
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => moveRecipient(index, 1)}
                          disabled={pending || index === recipients.length - 1}
                          aria-label={`Move recipient ${n} down`}
                          className="text-text-secondary"
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => removeRecipient(recipient.key)}
                          disabled={pending || recipients.length === 1}
                          aria-label={`Remove recipient ${n}`}
                          className="text-text-secondary hover:bg-red-500/10 hover:text-red-400"
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_8.5rem]">
                      <Input
                        value={recipient.name}
                        onChange={(e) => update(recipient.key, "name")(e.target.value)}
                        placeholder="Full name"
                        aria-label={`Recipient ${n} name`}
                        autoComplete="off"
                        maxLength={120}
                        disabled={pending}
                      />
                      <Input
                        type="email"
                        value={recipient.email}
                        onChange={(e) => update(recipient.key, "email")(e.target.value)}
                        placeholder="name@company.com"
                        aria-label={`Recipient ${n} email`}
                        autoComplete="off"
                        maxLength={254}
                        disabled={pending}
                      />
                      <Select
                        value={recipient.role}
                        onValueChange={update(recipient.key, "role")}
                        disabled={pending}
                      >
                        <SelectTrigger aria-label={`Recipient ${n} role`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RECIPIENT_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {RECIPIENT_ROLE_MAP[role]?.label || role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="rounded-lg border border-border bg-surface-subtle p-3">
            <SettingRow
              title="Sign in order"
              description={
                sequential
                  ? "Each recipient is emailed after the one above them finishes."
                  : "Everyone is emailed at once and can sign in any order."
              }
              control={
                <Switch
                  checked={sequential}
                  onCheckedChange={setSequential}
                  disabled={pending}
                  aria-label="Sign in order"
                />
              }
            />
          </div>

          <Field label="Subject" htmlFor="signing-subject">
            <Input
              id="signing-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={document.title || "Untitled"}
              maxLength={200}
              disabled={pending}
            />
          </Field>

          <Field label="Message" htmlFor="signing-message" hint="Optional. Included in the signing email.">
            <Textarea
              id="signing-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a note for your recipients…"
              rows={3}
              maxLength={2000}
              disabled={pending}
            />
          </Field>

          <p className="text-xs text-text-tertiary">{fieldSummary}</p>

          {problem ? (
            <p
              role="alert"
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
            >
              {problem}
            </p>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={previewPdf} disabled={previewing || pending}>
            {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Preview PDF
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button className={PRIMARY} onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send for signature
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SendForSignatureDialog;
