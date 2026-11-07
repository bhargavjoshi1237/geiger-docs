"use client";

import { useMemo, useSyncExternalStore } from "react";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
import {
  ROLE_STORAGE_KEY,
  mergeWorkspaceRoles,
  roleHasPermission,
  tabPermissionKey,
} from "@/lib/rbac";

const ACTIVE_ROLE_KEY = `${ROLE_STORAGE_KEY}.active`;

function readKey(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function parseRoles(raw) {
  try {
    const roles = JSON.parse(raw || "[]");
    return Array.isArray(roles) ? mergeWorkspaceRoles(roles) : [];
  } catch {
    return [];
  }
}

// Nav items the active role may see (advisory gating; everything shows when no roles are stored).
export function useVisibleNav() {
  const rawRoles = useSyncExternalStore(subscribe, () => readKey(ROLE_STORAGE_KEY), () => null);
  const roleId = useSyncExternalStore(subscribe, () => readKey(ACTIVE_ROLE_KEY), () => null);

  return useMemo(() => {
    const roles = parseRoles(rawRoles);
    return workspaceNav.filter((item) =>
      roleHasPermission(roles, roleId, tabPermissionKey(item.title)),
    );
  }, [rawRoles, roleId]);
}
