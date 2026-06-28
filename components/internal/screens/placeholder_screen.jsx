"use client";

import React from "react";
import { Hammer, Sparkles } from "lucide-react";

export function PlaceholderScreen({ title = "Screen", description }) {
  return (
    <div className="space-y-8 w-full px-2 lg:px-0 lg:max-w-[85%] mx-auto py-4">
      <div className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm font-medium text-muted-foreground">
            {description ||
              `The ${title} screen is part of the Geiger Events roadmap and will be built out next.`}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-background px-6 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-subtle text-muted-foreground">
          <Hammer className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-foreground">
            {title} is on the way
          </p>
          <p className="mx-auto max-w-md text-sm text-text-secondary">
            This area is scaffolded into the navigation. Its dedicated tools,
            tables, and dialogs are being implemented one area at a time to keep
            the experience consistent across the suite.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Coming soon
        </span>
      </div>
    </div>
  );
}
