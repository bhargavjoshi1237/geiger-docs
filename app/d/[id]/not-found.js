"use client";

import Link from "next/link";
import { FileX } from "lucide-react";
import { Button, EmptyState } from "@geiger/ui";
import { PublicDocumentShell } from "./public_document_shell";

// Shown when the id is invalid, the document isn't public, or the project turned public links off.
export default function PublicDocumentNotFound() {
  return (
    <PublicDocumentShell>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center px-4 py-16 sm:px-6">
        <EmptyState
          icon={FileX}
          title="This document isn't available"
          description="The link may be wrong, or the document is no longer shared publicly."
          className="w-full rounded-xl border border-border bg-surface-subtle"
          action={
            <Button asChild variant="outline">
              <Link href="/">Go to Geiger Docs</Link>
            </Button>
          }
        />
      </div>
    </PublicDocumentShell>
  );
}
