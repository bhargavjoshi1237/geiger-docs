import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Server Supabase clients: the caller's cookie session (RLS applies) and the service role (bypasses RLS). Never import from client code.

// Must match lib/supabase/client.js and the hub so a server-side refresh rewrites the same suite session cookie.
const COOKIE_OPTIONS = {
  domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};

// Cookie-bound client acting as the signed-in caller, or null when Supabase isn't configured.
export async function sessionClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      // Route handlers may refresh the session; server components can't write cookies, so ignore there.
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {}
      },
    },
    cookieOptions: COOKIE_OPTIONS,
  });
}

// An auth user as { id, email, name }, named the way lib/supabase/user.js names the client-side user.
function personOf(authUser) {
  const meta = authUser.user_metadata ?? {};
  const email = authUser.email ?? "";
  return { id: authUser.id, email, name: meta.full_name || meta.name || email.split("@")[0] || "User" };
}

// Verified signed-in user ({ id, email, name }) or null; pass an existing sessionClient() to reuse its refreshed session.
export async function getSessionUser(client) {
  try {
    const sb = client ?? (await sessionClient());
    if (!sb) return null;
    const { data, error } = await sb.auth.getUser();
    if (error || !data?.user) return null;
    return personOf(data.user);
  } catch (e) {
    console.error("[docs.auth.user]", e?.message || e);
    return null;
  }
}

let admin = null;

// Service-role client (no persisted session), or null when SUPABASE_SERVICE_ROLE_KEY is missing.
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!admin) admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
