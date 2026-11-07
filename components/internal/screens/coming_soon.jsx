"use client";

import React from "react";
import { Hammer } from "lucide-react";
import { EmptyState, ScreenHeader } from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";

// Fallback for nav titles that have no entry in the screen registry yet.
export function ComingSoonScreen({ title = "Screen", description }) {
  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={title}
        description={description || `The ${title} screen is part of the Geiger Docs roadmap.`}
      />
      <EmptyState
        icon={Hammer}
        title={`${title} is on the way`}
        description="This area is in the navigation and will be built out next."
        className="rounded-2xl border border-dashed border-border py-20"
      />
    </MainScreenWrapper>
  );
}

export default ComingSoonScreen;
