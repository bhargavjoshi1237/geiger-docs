import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Element styling for rendered Markdown, using semantic tokens only.
const COMPONENTS = {
  h1: (props) => <h1 className="mt-8 mb-4 text-2xl font-semibold tracking-tight text-foreground first:mt-0" {...props} />,
  h2: (props) => <h2 className="mt-8 mb-3 text-xl font-semibold tracking-tight text-foreground first:mt-0" {...props} />,
  h3: (props) => <h3 className="mt-6 mb-2 text-lg font-semibold text-foreground first:mt-0" {...props} />,
  h4: (props) => <h4 className="mt-4 mb-2 text-base font-semibold text-foreground first:mt-0" {...props} />,
  p: (props) => <p className="my-3 leading-7 text-text-secondary" {...props} />,
  a: ({ href, ...props }) => (
    <a
      href={href}
      className="text-foreground underline underline-offset-4 hover:text-muted-foreground"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    />
  ),
  ul: (props) => <ul className="my-3 ml-6 list-disc space-y-1 text-text-secondary" {...props} />,
  ol: (props) => <ol className="my-3 ml-6 list-decimal space-y-1 text-text-secondary" {...props} />,
  li: (props) => <li className="leading-7" {...props} />,
  blockquote: (props) => (
    <blockquote className="my-4 border-l-2 border-border-strong pl-4 italic text-muted-foreground" {...props} />
  ),
  hr: () => <hr className="my-6 border-border" />,
  pre: (props) => (
    <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-surface-card p-4 text-sm" {...props} />
  ),
  code: ({ className, ...props }) => (
    <code
      className={cn(
        "rounded bg-surface-card px-1.5 py-0.5 font-mono text-[0.85em] text-foreground",
        className,
      )}
      {...props}
    />
  ),
  table: (props) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  th: (props) => <th className="border-b border-border bg-surface-subtle px-3 py-2 text-left font-medium text-foreground" {...props} />,
  td: (props) => <td className="border-b border-border px-3 py-2 text-text-secondary" {...props} />,
  img: ({ alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt || ""} className="my-4 max-w-full rounded-lg border border-border" {...props} />
  ),
};

// Renders a Markdown string (GFM: tables, task lists, strikethrough); safe by default, raw HTML is not rendered.
export function MarkdownView({ source, className }) {
  return (
    <div className={cn("min-w-0 break-words text-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {source || ""}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownView;
