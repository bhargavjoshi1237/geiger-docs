"use client";

import React from "react";
import { Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui";
import { Field, SectionCard } from "@/components/internal/shared/screen_kit";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_MAP,
  SHARE_MODE_MAP,
  formatDate,
  formatRelative,
  wordCount,
} from "@/components/internal/screens/documents/constants";
import { ACCESS_LABELS } from "@/components/internal/screens/documents/access";
import { cn } from "@/lib/utils";

// Radix Select can't hold an empty value, so "no collection" gets a sentinel.
const NO_COLLECTION = "none";

function InfoRow({ label, children, title }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium text-foreground" title={title}>
        {children}
      </dd>
    </div>
  );
}

// Status + collection persist immediately; dates and counts are read-only.
export function DetailsTab({ document, collections = [], editable, access, onPersist }) {
  const collectionValue = collections.some((c) => c.id === document.collectionId)
    ? document.collectionId
    : NO_COLLECTION;
  const share = SHARE_MODE_MAP[document.shareMode] || SHARE_MODE_MAP.workspace;
  const words = wordCount(document.body);

  const changeStatus = (status) => {
    if (status === document.status) return;
    onPersist({ status }, { success: `Status set to ${status}`, error: "Couldn't change the status." });
  };

  const changeCollection = (value) => {
    const collectionId = value === NO_COLLECTION ? null : value;
    if (collectionId === (document.collectionId ?? null)) return;
    const name = collections.find((c) => c.id === collectionId)?.name;
    onPersist(
      { collectionId },
      {
        success: name ? `Moved to ${name}` : "Removed from its collection",
        error: "Couldn't change the collection.",
      },
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <SectionCard
        title="Properties"
        description={
          editable ? "Changes save as soon as you make them." : "Only editors can change these."
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="document-status">
            <Select value={document.status} onValueChange={changeStatus} disabled={!editable}>
              <SelectTrigger id="document-status">
                <SelectValue placeholder="Choose a status" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full", DOCUMENT_STATUS_MAP[status]?.dotClass)}
                    />
                    {DOCUMENT_STATUS_MAP[status]?.label || status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Collection"
            htmlFor="document-collection"
            hint={collections.length ? null : "Create a collection to group related documents."}
          >
            <Select value={collectionValue} onValueChange={changeCollection} disabled={!editable}>
              <SelectTrigger id="document-collection">
                <SelectValue placeholder="No collection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COLLECTION}>No collection</SelectItem>
                {collections.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name || "Untitled collection"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Information">
        <dl className="divide-y divide-border">
          <InfoRow label="Created" title={formatRelative(document.createdAt)}>
            {formatDate(document.createdAt)}
          </InfoRow>
          <InfoRow label="Last updated" title={formatDate(document.updatedAt)}>
            {formatRelative(document.updatedAt)}
          </InfoRow>
          <InfoRow label="Words">{words.toLocaleString()}</InfoRow>
          <InfoRow label="Sharing">
            <Badge variant={share.variant}>{share.label}</Badge>
          </InfoRow>
          <InfoRow label="Your access">{ACCESS_LABELS[access] || "—"}</InfoRow>
        </dl>
      </SectionCard>
    </div>
  );
}

export default DetailsTab;
