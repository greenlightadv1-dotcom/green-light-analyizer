/**
 * YouTube OAuth scopes — CLAUDE.md §7.3 (Stage 1, D2b).
 *
 * Two scopes, both required:
 *
 * - `yt-analytics.readonly` — the Analytics API's own read scope.
 * - `youtube.readonly` — needed twice over. `channels.list?mine=true` (how the
 *   callback learns the channel id) is a Data API call, and
 *   `yt-analytics.readonly` is not a Data API scope. And since 2018-06-18
 *   `reports.query` itself requires `youtube.readonly`; the Analytics scope
 *   alone is not enough. (developers.google.com/youtube/analytics/revision_history
 *   and the reports.query reference, checked 2026-10-30.)
 *
 * Google's consent screen is granular: a creator can untick a scope and still
 * complete the flow, and Google says apps "must verify which scopes were
 * actually granted". So the token response's `scope` (space-delimited) is
 * checked before anything is stored. Matching is exact on the full URL;
 * extra scopes are fine (`include_granted_scopes=true` can return scopes
 * granted earlier), anything missing, empty or unparseable is a refusal.
 *
 * Pure — no fetch, no server-only — so it is unit-tested directly
 * (youtube-scopes.test.ts).
 */

export const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export const YT_ANALYTICS_READONLY_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";

export const REQUIRED_YOUTUBE_SCOPES: readonly string[] = [
  YOUTUBE_READONLY_SCOPE,
  YT_ANALYTICS_READONLY_SCOPE,
];

/** The granted scopes in a token response's `scope`; empty for anything but a string. */
export function parseGrantedScopes(scope: unknown): Set<string> {
  if (typeof scope !== "string") return new Set();
  return new Set(scope.split(/\s+/).filter(Boolean));
}

/** Required scopes absent from `scope`, in REQUIRED_YOUTUBE_SCOPES order. */
export function missingYouTubeScopes(scope: unknown): string[] {
  const granted = parseGrantedScopes(scope);
  return REQUIRED_YOUTUBE_SCOPES.filter((s) => !granted.has(s));
}

export function hasRequiredYouTubeScopes(scope: unknown): boolean {
  return missingYouTubeScopes(scope).length === 0;
}

/**
 * Authorization request parameters. `access_type=offline` + `prompt=consent`
 * as before, so Google issues a refresh token on every connect;
 * `include_granted_scopes=true` asks for incremental authorization, so a
 * creator who connected under the old single scope keeps it on reconnect.
 */
export function buildYouTubeAuthorizationParams(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): URLSearchParams {
  return new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: REQUIRED_YOUTUBE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
}

export const MISSING_SCOPE_MESSAGE =
  "Your YouTube connection is missing a permission Green Light needs — reconnect above and allow every requested permission.";

/**
 * Defensive check before a verified-geo sync: the connection's stored scope
 * must still hold both required scopes. null when the sync may proceed;
 * otherwise the error to show, so no Google call is made with a token that
 * cannot succeed. A null stored scope (nothing recorded) is a refusal too.
 */
export function youtubeSyncScopeError(storedScope: string | null | undefined): string | null {
  return hasRequiredYouTubeScopes(storedScope) ? null : MISSING_SCOPE_MESSAGE;
}
