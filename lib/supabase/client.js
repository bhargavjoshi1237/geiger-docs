import { createBrowserClient } from '@supabase/ssr';
import { trackSupabaseFetch } from './activity';

// Must match the hub (geiger-dash) and lib/server/supabase.js so every client shares one suite session cookie (a domain mismatch leaves a shadow cookie).
const COOKIE_OPTIONS = {
  domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined,
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: COOKIE_OPTIONS,
      global: {
        fetch: trackSupabaseFetch,
      },
    }
  );
}
