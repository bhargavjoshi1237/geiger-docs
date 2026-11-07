"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button, ScreenHeader } from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";

// Placeholder editor; the tabbed editor replaces this (see the design spec's editor contract).
export function DocumentDetailScreen({ document, onBack }) {
  return (
    <MainScreenWrapper>
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <ScreenHeader title={document?.title || "Untitled"} />
    </MainScreenWrapper>
  );
}

export default DocumentDetailScreen;
