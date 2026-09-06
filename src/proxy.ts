import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, image files, and inbound webhooks.
     *
     * api/webhooks/ MUST stay excluded. A webhook carries no session, so the
     * guard would redirect it to /login — and because the caller follows
     * redirects, the provider sees a cheerful 200 for a delivery that was
     * never processed. Silent data loss that looks like success.
     *
     * Auth route handlers are intentionally NOT excluded: the guard treats
     * /auth/* as public itself, so the session still refreshes on those.
     */
    "/((?!_next/static|_next/image|favicon.ico|branding/|api/webhooks/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
