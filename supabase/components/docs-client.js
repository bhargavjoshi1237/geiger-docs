import { createClient } from "@/lib/supabase/client";

// Shared Supabase helpers for Geiger Docs; every data-layer file imports these instead of building its own client.

// True only when both Supabase env vars are present; guard every DB call so a missing env returns null/[]/false.
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// Pre-guarded client pinned to the docs schema (null when unconfigured); read public tables via createClient().
export function schemaClient() {
  return isSupabaseConfigured() ? createClient().schema("docs") : null;
}
