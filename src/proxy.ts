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
     * /preview is excluded too: it is the configuration-free UI preview, which
     * renders mock data outside the auth gate and must not be redirected into
     * a login it has no credentials for.
     *
     * api/dev/ is the local-only harness (see api/dev/send-test): curl has no
     * session cookie, so the guard would bounce it to /login and the harness
     * would report a cheerful 200 for a request that never ran. The routes
     * under it 404 outright when NODE_ENV is production, so nothing is
     * reachable there in a deployment.
     *
     * Auth route handlers are intentionally NOT excluded: the guard treats
     * /auth/* as public itself, so the session still refreshes on those.
     */
    "/((?!_next/static|_next/image|favicon.ico|branding/|api/webhooks/|api/dev/|preview|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
