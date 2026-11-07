/**
 * Vercel preview deployments are read-only by default.
 *
 * A preview of an unmerged branch can carry the same environment variables as
 * production, including the production Supabase keys. A branch that expects
 * migrations production does not have yet would then write half-formed rows
 * into the live database, and could email real people from the live sender.
 * So on a preview (VERCEL_ENV=preview) every request that can change state is
 * refused, unless PREVIEW_WRITES_ENABLED=1 is set for a preview that points at
 * its own non-production database.
 *
 * Production (VERCEL_ENV=production), local development and tests have no
 * VERCEL_ENV=preview, so this never applies there.
 */
type Env = Record<string, string | undefined>;

export function previewWritesBlocked(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "preview" && env.PREVIEW_WRITES_ENABLED !== "1";
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * GET routes that write: the OAuth callback stores tokens, the resume link
 * claims an application session. Cron and webhook routes are outside the
 * proxy matcher and check previewWritesBlocked() themselves.
 */
const WRITING_GET_PATHS = [/^\/api\/oauth\/[^/]+\/callback\/?$/, /^\/apply\/continue\/?$/, /^\/api\/cron\//, /^\/api\/webhooks\//];

export function isPreviewBlockedRequest(method: string, pathname: string, env: Env = process.env): boolean {
  if (!previewWritesBlocked(env)) return false;
  if (!SAFE_METHODS.has(method.toUpperCase())) return true;
  return WRITING_GET_PATHS.some((re) => re.test(pathname));
}
