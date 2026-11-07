import { notFound } from "next/navigation";
import { StatusPill } from "@geiger/ui/screen-kit";
import { MarkdownView } from "@/components/internal/shared/markdown_view";
import {
  DOCUMENT_STATUS_MAP,
  formatDate,
} from "@/components/internal/screens/documents/constants";
import { fetchPublicDocument } from "@/lib/docs/fetch_public_document";
import { PublicDocumentShell } from "./public_document_shell";

// ISR: each public document renders on its first visit, then refreshes in the background on the same window as the read.
export const revalidate = 10;

export async function generateStaticParams() {
  return [];
}

// Plain-text preview of the Markdown body for link unfurls.
function excerpt(body) {
  const text = String(body || "")
    .replace(/[#>*_`~|[\]()!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

// Link-shared documents stay out of search indexes.
const ROBOTS = { index: false, follow: false };

export async function generateMetadata({ params }) {
  const { id } = await params;
  const doc = await fetchPublicDocument(id);
  if (!doc) return { title: "Document not found", robots: ROBOTS };
  return {
    title: `${doc.title} - Geiger Docs`,
    description: excerpt(doc.body),
    robots: ROBOTS,
  };
}

export default async function PublicDocumentPage({ params }) {
  const { id } = await params;
  const doc = await fetchPublicDocument(id);
  if (!doc) notFound();

  return (
    <PublicDocumentShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8 border-b border-border pb-6">
          <h1 className="break-words text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {doc.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <StatusPill status={doc.status} map={DOCUMENT_STATUS_MAP} />
            <span>Updated {formatDate(doc.updatedAt)}</span>
          </div>
        </header>

        {doc.body.trim() ? (
          <MarkdownView source={doc.body} className="text-base" />
        ) : (
          <p className="text-sm text-text-tertiary">This document doesn&apos;t have any content yet.</p>
        )}
      </article>
    </PublicDocumentShell>
  );
}
