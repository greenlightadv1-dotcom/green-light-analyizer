import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";

/** Routes reachable without a session. There is no signup route — by design (§4). */
const PUBLIC_PATHS = ["/login", "/auth"];

/** Where a user with a pending forced password change is pinned (§4.2). */
export const SET_PASSWORD_PATH = "/set-password";

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Session refresh + route guards, called from the Next proxy (src/proxy.ts).
 *
 * Two hard, server-side gates (§4, §12 — "enforce server-side, not just a UI
 * nudge"):
 *   1. No session  -> /login
 *   2. Session with app_metadata.must_change_password -> /set-password,
 *      and nothing else in the product is reachable until it is cleared.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // With no usable Supabase configuration there is no session to refresh and
  // no data to protect — the pages themselves fail on their own database
  // calls. Passing through beats throwing on every request, which would turn
  // a missing or malformed environment variable into an unreadable wall of
  // 500s. /admin/system exists to name exactly which variable is absent (once
  // it's reachable — see the same check in requireProfile()).
  if (!isSupabaseConfigured()) {
    return response;
  }

  let user: User | null;
  try {
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    // getUser() revalidates the token with Supabase Auth. Do not swap this for
    // getSession(), which trusts whatever is in the cookie.
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    // A reachability problem (project paused, DNS, TLS, transient outage) is
    // not this request's fault to fail on. Let it through unauthenticated —
    // the page's own requireProfile() call hits the same failure and decides
    // what to show, rather than every route in the product going dark because
    // Supabase had one bad moment.
    console.error("proxy: Supabase session check failed", error);
    return response;
  }

  const { pathname } = request.nextUrl;

  if (!user) {
    if (isPublic(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve the intended destination so login can return the user to it.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Authoritative flag: app_metadata is service-role-writable only, so a user
  // cannot clear it themselves the way they could with user_metadata.
  const mustChangePassword =
    user.app_metadata?.must_change_password === true;

  if (mustChangePassword && pathname !== SET_PASSWORD_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = SET_PASSWORD_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!mustChangePassword && pathname === SET_PASSWORD_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // A signed-in user has no business on the login screen.
  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
