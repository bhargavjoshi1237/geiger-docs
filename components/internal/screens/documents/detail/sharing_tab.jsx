"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, UserPlus, X } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Input,
  LoadingArea,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import {
  MEMBER_ROLES,
  MEMBER_ROLE_MAP,
  SHARE_MODES,
  SHARE_MODE_MAP,
  publicDocumentUrl,
} from "@/components/internal/screens/documents/constants";
import { canEdit } from "@/components/internal/screens/documents/access";
import {
  removeDocumentMember,
  updateDocumentMember,
  upsertDocumentMember,
} from "@/lib/supabase/document_members";
import { cn } from "@/lib/utils";
import { copyPublicLink, initials } from "./utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lower = (value) => String(value || "").trim().toLowerCase();

// Sharing mode + public link + named people; members state lives in the parent so access stays in sync.
export function SharingTab({
  document,
  settings,
  access,
  user,
  members,
  membersReady,
  setMembers,
  onPersist,
}) {
  const manage = canEdit(access);
  const isPublic = document.shareMode === "public";
  const publicAllowed = settings?.allowPublicLinks !== false;
  const modes = SHARE_MODES.filter((mode) => mode !== "public" || publicAllowed || isPublic);
  const isCreator = Boolean(user) && document.createdBy === user.id;

  const [changingMode, setChangingMode] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");

  const changeMode = async (mode) => {
    if (!manage || mode === document.shareMode) return;
    setChangingMode(true);
    // A non-creator restricting the doc is added as an editor so they don't lock themselves out.
    const self = lower(user?.email);
    if (mode === "restricted" && self && !isCreator && !members.some((m) => lower(m.email) === self)) {
      const added = await upsertDocumentMember({
        documentId: document.id,
        email: self,
        role: "editor",
        createdBy: user.id,
      });
      if (!added) {
        setChangingMode(false);
        toast.error("Couldn't add you to the document, so sharing wasn't changed.");
        return;
      }
      setMembers((prev) => [...prev.filter((m) => lower(m.email) !== self), added]);
    }
    await onPersist(
      { shareMode: mode },
      { success: `Sharing set to ${SHARE_MODE_MAP[mode].label}`, error: "Couldn't change sharing." },
    );
    setChangingMode(false);
  };

  const addMember = async (event) => {
    event.preventDefault();
    const address = lower(email);
    if (!EMAIL_RE.test(address)) {
      toast.error("Enter a valid email address.");
      return;
    }
    const previous = members.find((m) => lower(m.email) === address);
    const optimistic = {
      id: previous?.id ?? crypto.randomUUID(),
      documentId: document.id,
      email: address,
      role,
      createdBy: user?.id ?? null,
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      pending: true,
    };
    setMembers((prev) =>
      previous
        ? prev.map((m) => (lower(m.email) === address ? optimistic : m))
        : [...prev, optimistic],
    );
    setEmail("");
    const saved = await upsertDocumentMember({
      documentId: document.id,
      email: address,
      role,
      createdBy: user?.id ?? null,
    });
    // The upsert ignores caller ids, so reconcile by email rather than id.
    if (!saved) {
      setMembers((prev) =>
        previous
          ? prev.map((m) => (lower(m.email) === address ? previous : m))
          : prev.filter((m) => lower(m.email) !== address),
      );
      setEmail(address);
      toast.error(`Couldn't add ${address}.`);
      return;
    }
    setMembers((prev) => prev.map((m) => (lower(m.email) === address ? saved : m)));
    toast.success(previous ? `Updated ${address}` : `Added ${address}`);
  };

  // A non-creator editing their own row would lock themselves out mid-edit.
  const isSelf = (member) => !isCreator && lower(member.email) === lower(user?.email);

  const changeRole = async (member, nextRole) => {
    if (nextRole === member.role) return;
    if (isSelf(member)) {
      toast.error("You can't change your own access. Ask the document owner.");
      return;
    }
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: nextRole } : m)));
    const saved = await updateDocumentMember(member.id, { role: nextRole });
    if (!saved) {
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: member.role } : m)));
      toast.error("Couldn't change their role.");
      return;
    }
    toast.success(`Changed ${member.email} to ${MEMBER_ROLE_MAP[nextRole].label}`);
  };

  const removeMember = async (member) => {
    if (isSelf(member)) {
      toast.error("You can't remove your own access. Ask the document owner.");
      return;
    }
    const index = members.findIndex((m) => m.id === member.id);
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    const ok = await removeDocumentMember(member.id);
    if (!ok) {
      setMembers((prev) => {
        const next = [...prev];
        next.splice(Math.max(index, 0), 0, member);
        return next;
      });
      toast.error(`Couldn't remove ${member.email}.`);
      return;
    }
    toast.success(`Removed ${member.email}`);
  };

  const url = isPublic ? publicDocumentUrl(document.id) : "";

  return (
    <div className="max-w-3xl space-y-6">
      <SectionCard
        title="General access"
        description={
          manage
            ? "Choose who can open this document."
            : "Only owners and editors can change sharing."
        }
        action={changingMode ? <Loader2 className="h-4 w-4 animate-spin text-text-secondary" /> : null}
      >
        <RadioGroup
          value={document.shareMode}
          onValueChange={changeMode}
          disabled={!manage || changingMode}
          aria-label="Sharing mode"
        >
          {modes.map((mode) => {
            const meta = SHARE_MODE_MAP[mode];
            const Icon = meta.icon;
            const selected = document.shareMode === mode;
            // Already public but public links were turned off: visible, not re-selectable.
            const locked = mode === "public" && !publicAllowed;
            const interactive = manage && !locked && !changingMode;
            return (
              <label
                key={mode}
                htmlFor={`share-mode-${mode}`}
                className={cn(
                  "flex items-start gap-3 rounded-lg border border-border bg-surface-card p-4 transition-colors",
                  interactive && "cursor-pointer hover:bg-surface-hover",
                  selected && "border-border-strong bg-surface-active hover:bg-surface-active",
                )}
              >
                <RadioGroupItem
                  id={`share-mode-${mode}`}
                  value={mode}
                  disabled={locked}
                  className="mt-2"
                />
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-subtle text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{meta.label}</span>
                  <span className="block text-xs text-text-secondary">{meta.description}</span>
                  {locked ? (
                    <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">
                      Public links are turned off in Settings. Switch to another mode to stop sharing it.
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </SectionCard>

      {isPublic ? (
        <SectionCard
          title="Public link"
          description="Anyone with this link can read the latest saved content."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={url}
              aria-label="Public link"
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs md:text-xs"
            />
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => copyPublicLink(document.id)}>
                <Copy className="h-4 w-4" />
                Copy link
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open public page">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {document.shareMode === "restricted" ? (
        <SectionCard
          title="People with access"
          description="Only these people can open the document, with the role you give them."
        >
          {manage ? (
            <form
              onSubmit={addMember}
              className="mb-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]"
            >
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                aria-label="Email address"
              />
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger aria-label="Role for the new person">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMBER_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {MEMBER_ROLE_MAP[r].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={!email.trim()}
              >
                <UserPlus className="h-4 w-4" />
                Add
              </Button>
            </form>
          ) : null}

          {!membersReady ? (
            <LoadingArea size={32} label="Loading people" className="py-8" />
          ) : (
            <ul className="divide-y divide-border">
              {isCreator ? (
                <PersonRow email={user.email || user.name} note="You">
                  <Badge variant="outline">Owner</Badge>
                </PersonRow>
              ) : null}
              {members.map((member) => (
                <PersonRow
                  key={member.id}
                  email={member.email}
                  note={lower(member.email) === lower(user?.email) ? "You" : null}
                >
                  {manage ? (
                    <>
                      <Select
                        value={member.role}
                        onValueChange={(next) => changeRole(member, next)}
                        disabled={member.pending}
                      >
                        <SelectTrigger size="sm" className="w-32" aria-label={`Role for ${member.email}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                          {MEMBER_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {MEMBER_ROLE_MAP[r].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeMember(member)}
                        disabled={member.pending}
                        aria-label={`Remove ${member.email}`}
                        className="text-text-secondary hover:bg-red-500/10 hover:text-red-400"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Badge variant="neutral">{MEMBER_ROLE_MAP[member.role]?.label || member.role}</Badge>
                  )}
                </PersonRow>
              ))}
              {!members.length && !isCreator ? (
                <li className="py-6 text-center text-sm text-text-tertiary">
                  No one has been added yet.
                </li>
              ) : null}
            </ul>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}

function PersonRow({ email, note, children }) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <Avatar size="sm">
        <AvatarFallback className="text-[10px] font-medium">{initials(email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{email}</p>
        {note ? <p className="text-xs text-text-tertiary">{note}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </li>
  );
}

export default SharingTab;
