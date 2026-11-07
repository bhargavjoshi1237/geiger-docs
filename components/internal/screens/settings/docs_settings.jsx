"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Database, Globe, RefreshCw, Share2 } from "lucide-react";
import {
  Button,
  LoadingArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import {
  EmptyState,
  ScreenHeader,
  SectionCard,
  SettingRow,
  SettingsList,
} from "@/components/internal/shared/screen_kit";
import { SecondaryScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { SHARE_MODES, SHARE_MODE_MAP } from "@/components/internal/screens/documents/constants";
import { useProject } from "@/context/project-context";
import { getSettings, saveSettings } from "@/lib/supabase/settings";

export function SettingsScreen() {
  const { projectId } = useProject();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getSettings(projectId).then((prefs) => {
      if (!alive) return;
      setSettings(prefs);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const retry = async () => {
    setLoading(true);
    setSettings(await getSettings(projectId));
    setLoading(false);
  };

  // Optimistic save: apply the patch now, roll back just those keys if the upsert fails.
  const persist = async (patch, successMessage) => {
    const previous = Object.fromEntries(Object.keys(patch).map((key) => [key, settings[key]]));
    setSettings((s) => ({ ...s, ...patch }));
    const saved = await saveSettings(projectId, patch);
    if (saved) {
      toast.success(successMessage);
    } else {
      setSettings((s) => ({ ...s, ...previous }));
      toast.error("Couldn't save your settings.");
    }
  };

  const changeDefaultMode = (mode) => {
    if (mode === settings.defaultShareMode) return;
    persist({ defaultShareMode: mode }, `New documents will default to ${SHARE_MODE_MAP[mode].label}.`);
  };

  // Turning public links off while they're the default also falls back to workspace in the same save.
  const togglePublicLinks = (allow) => {
    if (!allow && settings.defaultShareMode === "public") {
      persist(
        { allowPublicLinks: false, defaultShareMode: "workspace" },
        "Public links turned off. New documents now default to Workspace.",
      );
      return;
    }
    persist({ allowPublicLinks: allow }, allow ? "Public links turned on." : "Public links turned off.");
  };

  return (
    <SecondaryScreenWrapper>
      <ScreenHeader title="Settings" description="Defaults for documents in this project." />

      {loading ? (
        <LoadingArea panel label="Loading settings" />
      ) : !settings ? (
        <EmptyState
          icon={Database}
          title="Settings need the database"
          description="Project settings are stored in Supabase. Connect the database, or try again if it's unreachable."
          className="rounded-xl border border-border bg-surface-subtle"
          action={
            <Button variant="outline" onClick={retry}>
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
          }
        />
      ) : (
        <SectionCard
          title="Sharing"
          description="How new documents are shared, and whether public links can be used at all."
        >
          <SettingsList>
            <SettingRow
              icon={Share2}
              title="Default sharing for new documents"
              description="Applied when a document is created. Each document can change it in its Sharing tab."
              control={
                <Select value={settings.defaultShareMode} onValueChange={changeDefaultMode}>
                  <SelectTrigger className="w-40 sm:w-44" aria-label="Default sharing for new documents">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {SHARE_MODES.map((mode) => (
                      <SelectItem
                        key={mode}
                        value={mode}
                        disabled={mode === "public" && !settings.allowPublicLinks}
                      >
                        {SHARE_MODE_MAP[mode].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <SettingRow
              icon={Globe}
              title="Allow public links"
              description="Lets documents publish a read-only page anyone with the link can open. Turning this off stops every public link from opening."
              checked={settings.allowPublicLinks}
              onCheckedChange={togglePublicLinks}
            />
          </SettingsList>
        </SectionCard>
      )}
    </SecondaryScreenWrapper>
  );
}

export default SettingsScreen;
