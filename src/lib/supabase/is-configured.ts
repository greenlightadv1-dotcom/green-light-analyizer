import "server-only";

/**
 * Whether there is enough Supabase configuration to attempt a real request.
 *
 * Checked at every render-path chokepoint that would otherwise construct a
 * Supabase client and let it throw (missing/blank URL or key) or hang a
 * request on a URL that was never a URL to begin with — a pasted value with
 * stray whitespace or quotes is a "set" env var by `Boolean(...)`, but not
 * one `createServerClient` can use. Treat that the same as unset rather than
 * letting it reach the client constructor.
 *
 * Kept out of config.ts deliberately: that module's own test asserts every
 * env read there is coerced straight to Boolean(), since it backs an
 * admin-facing presence report that must never leak a value. This function
 * has a different, narrower job — it needs the real string to validate with
 * `new URL()` — so it lives on its own rather than weakening that guarantee.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
