"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { tabToSlug, slugToTab } from "@/lib/workspace/tabs";

export const DEFAULT_TAB = "Overview";
export const DEFAULT_SECTION = "content";

const CLEARED = { doc: null, section: null, collection: null };

// URL is the workspace state: /project/<projectId>/<tabSlug>?doc=&section=&collection=
export function useWorkspaceUrl() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = params?.projectId || null;
  const rest = params?.rest;
  const tabSlug = Array.isArray(rest) ? rest[0] : rest || null;
  const tab = (tabSlug && slugToTab(tabSlug)) || DEFAULT_TAB;

  const docId = searchParams.get("doc") || null;
  const section = searchParams.get("section") || DEFAULT_SECTION;
  const collectionId = searchParams.get("collection") || null;

  const buildUrl = useCallback(
    (next) => {
      const pid = next.project !== undefined ? next.project : projectId;
      const nextTab = next.tab !== undefined ? next.tab : tab;
      const slug = nextTab && nextTab !== DEFAULT_TAB ? tabToSlug(nextTab) : "";
      let path = `/project/${pid}`;
      if (slug) path += `/${slug}`;

      const qp = new URLSearchParams();
      const doc = next.doc !== undefined ? next.doc : docId;
      const sec = next.section !== undefined ? next.section : section;
      const col = next.collection !== undefined ? next.collection : collectionId;
      if (doc) qp.set("doc", doc);
      if (doc && sec && sec !== DEFAULT_SECTION) qp.set("section", sec);
      if (col) qp.set("collection", col);

      const qs = qp.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [projectId, tab, docId, section, collectionId],
  );

  const apply = useCallback(
    (next, { replace = false } = {}) => {
      const url = buildUrl(next);
      const movesPath =
        next.project !== undefined || next.tab !== undefined || !projectId;
      if (movesPath) {
        router.push(url, { scroll: false });
        return;
      }
      // Query-only changes skip the router so the screen keeps its state.
      const at = url.indexOf("?");
      const href = `${window.location.pathname}${at === -1 ? "" : url.slice(at)}`;
      if (replace) window.history.replaceState(null, "", href);
      else window.history.pushState(null, "", href);
    },
    [router, buildUrl, projectId],
  );

  const setProject = useCallback((id) => apply({ project: id, ...CLEARED }), [apply]);
  const setTab = useCallback((next) => apply({ tab: next, ...CLEARED }), [apply]);
  const openDoc = useCallback((id) => apply({ doc: id, section: null }), [apply]);
  const openDocInTab = useCallback(
    (id, nextTab) => apply({ tab: nextTab, doc: id, section: null, collection: null }),
    [apply],
  );
  const closeDoc = useCallback(() => apply({ doc: null, section: null }), [apply]);
  const setSection = useCallback(
    (next) => apply({ section: next }, { replace: true }),
    [apply],
  );
  const openCollection = useCallback((id) => apply({ collection: id }), [apply]);
  const closeCollection = useCallback(() => apply({ collection: null }), [apply]);

  return {
    projectId,
    tab,
    docId,
    section,
    collectionId,
    setProject,
    setTab,
    openDoc,
    openDocInTab,
    closeDoc,
    setSection,
    openCollection,
    closeCollection,
  };
}
