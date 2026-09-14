import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

/**
 * Server-side Supabase client bound to the request cookies. Use this in Server
 * Components, Route Handlers and Server Actions. RLS applies — this is the
 * caller's identity, not an escalated one.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: the middleware refreshes the
            // session cookies instead, so this is safe to ignore.
          }
        },
      },
    },
  );
}
