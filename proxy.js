import { NextResponse } from "next/server";

// The shared suite session written by @supabase/ssr (split into .0, .1… chunks when large).
const AUTH_COOKIE = /^sb-.+-auth-token(?:\.\d+)?$/;
// Suite sign-in lives on the hub (geiger-dash); unset means the hub serves this app on its own origin.
const DASH_ORIGIN = (process.env.NEXT_PUBLIC_DASH_ORIGIN || "").replace(/\/+$/, "");

// Optimistic gate: a cookie check, not a Supabase round-trip, so the static workspace shell stays fast; RLS is the real boundary.
export function proxy(request) {
  if (request.cookies.getAll().some(({ name, value }) => value && AUTH_COOKIE.test(name))) return NextResponse.next();
  // An absolute "/login" resolves to the origin root, outside the /docs base path, where the hub serves sign-in.
  const login = new URL(`${DASH_ORIGIN}/login`, request.url);
  login.searchParams.set("next", "docs");
  return NextResponse.redirect(login);
}

export const config = {
  // Workspace pages only (never /, /d/*, /api/*, /pallet* or assets); Next prepends basePath ("/docs" in production) to each matcher.
  matcher: ["/project/:path*", "/home", "/org"],
};
