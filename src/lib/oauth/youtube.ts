import "server-only";

import { getOAuthConnection, saveOAuthTokens } from "./tokens";
import {
  REPORTS_ENDPOINT,
  audienceGeoFromReport,
  buildCountryViewsQuery,
  type AudienceGeoResult,
} from "./youtube-geo";

/**
 * YouTube Analytics OAuth (§7.3) — `yt-analytics.readonly`, a sensitive
 * scope needing a verified Google OAuth consent screen (review, not a full
 * CASA audit). Nothing here has been verified against a live call: outbound
 * access to Google's API is blocked from the sandbox this was built in, and
 * the app itself isn't registered yet. Written from Google's published API
 * reference — confirm each shape against one real connection before relying
 * on it.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";

function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not set.");
  return `${base}/api/oauth/youtube/callback`;
}

/** null when GOOGLE_OAUTH_CLIENT_ID or NEXT_PUBLIC_APP_URL is unset. */
export function buildAuthorizationUrl(state: string): string | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId || !process.env.NEXT_PUBLIC_APP_URL) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

export async function exchangeCodeForTokens(
  code: string,
): Promise<GoogleTokenResponse | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function resolveChannelId(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
      {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) return null;
    const body: { items?: { id?: string }[] } = await response.json();
    return body.items?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * A currently-valid access token for this creator's YouTube connection,
 * refreshing it first if expired. Checked on demand, not a cron job — same
 * pattern as the subscription-expiry check in requireProfile().
 */
export async function getValidAccessToken(creatorId: string): Promise<string | null> {
  const connection = await getOAuthConnection(creatorId, "youtube");
  if (!connection) return null;

  if (new Date(connection.expires_at) > new Date()) {
    return connection.access_token;
  }
  if (!connection.refresh_token) return null;

  const refreshed = await refreshAccessToken(connection.refresh_token);
  if (!refreshed) return null;

  await saveOAuthTokens(creatorId, "youtube", {
    accessToken: refreshed.access_token,
    // Google does not always re-issue a refresh_token on refresh; keep the
    // existing one when it doesn't.
    refreshToken: refreshed.refresh_token ?? connection.refresh_token,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    externalAccountId: connection.external_account_id,
    scope: refreshed.scope ?? connection.scope,
  });

  return refreshed.access_token;
}

/**
 * Verified audience geography: the share of the channel's views by country
 * over the last AUDIENCE_GEO_WINDOW_DAYS days (youtube-geo.ts explains the
 * query, the maths and why it is views rather than viewerPercentage).
 *
 * Returns an explicit result rather than null so the caller can tell "the
 * API failed" from "the channel has no country data yet" — and so neither can
 * be mistaken for an empty-but-valid answer.
 */
export async function fetchAudienceCountries(
  accessToken: string,
  channelId: string,
  now: Date = new Date(),
): Promise<AudienceGeoResult> {
  let response: Response;
  try {
    response = await fetch(
      `${REPORTS_ENDPOINT}?${buildCountryViewsQuery(channelId, now).toString()}`,
      {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    return { ok: false, reason: "network" };
  }

  if (!response.ok) return { ok: false, reason: "http_error", status: response.status };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "malformed" };
  }
  return audienceGeoFromReport(body, now);
}
