"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NotificationBell, defaultNavigate, safeHref } from "@geiger/notify/react";
import { createClient } from "@/lib/supabase/client";
import { confirmNavigation } from "@/lib/hooks/use-workspace-url";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

function announce(notification) {
  toast(notification.title, { description: notification.body || undefined });
}

function reportError(error, scope) {
  if (scope !== "realtime") toast.error(error.message);
}

// Docs' own links (under the base path; any Docs link when there is none, as in local dev).
function inAppPath(url, notification) {
  const target = safeHref(url);
  if (!target || target.origin !== window.location.origin) return null;
  const inApp = BASE_PATH
    ? target.pathname === BASE_PATH || target.pathname.startsWith(`${BASE_PATH}/`)
    : notification?.app === "docs";
  if (!inApp) return null;
  return `${target.pathname.slice(BASE_PATH.length) || "/"}${target.search}${target.hash}`;
}

// Suite notification bell (all Geiger apps) on this app's session client.
export function NotificationsBell() {
  const router = useRouter();
  const [supabase] = useState(createClient);

  // Links inside Docs stay client-side (behind the unsaved-edits guard); other suite apps load through the shared origin.
  const navigate = (url, notification) => {
    const path = inAppPath(url, notification);
    if (!path) defaultNavigate(url);
    else if (confirmNavigation()) router.push(path);
  };

  return (
    <NotificationBell
      supabase={supabase}
      app="docs"
      className="hidden sm:inline-flex"
      onReceive={announce}
      onError={reportError}
      onNavigate={navigate}
    />
  );
}
