import "server-only";

import { getOAuthConnection } from "./tokens";
import type { CountryShare } from "@/lib/types/database";

/**
 * Instagram Graph API OAuth (§7.3) — needs a Business/Creator account linked
 * to a Facebook Page, plus Meta App Review for `instagram_manage_insights`.
 * Nothing here has been verified against a live call: outbound access to
 * Meta's API is blocked from the sandbox this was built in, and the app
 * itself isn't registered yet. Written from Meta's published Graph API
 * reference — confirm each shape against one real connection before relying
 * on it.
 */

const AUTH_URL = "https://www.facebook.com/v19.0/dialog/oauth";
const TOKEN_URL = "https://graph.facebook.com/v19.0/oauth/access_token";
const SCOPE = "instagram_basic,instagram_manage_insights,pages_show_list";

function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not set.");
  return `${base}/api/oauth/instagram/callback`;
}

/** null when META_APP_ID or NEXT_PUBLIC_APP_URL is unset. */
export function buildAuthorizationUrl(state: string): string | null {
  const appId = process.env.META_APP_ID;
  if (!appId || !process.env.NEXT_PUBLIC_APP_URL) return null;

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type MetaTokenResponse = { access_token: string; expires_in?: number };

export async function exchangeCodeForTokens(
  code: string,
): Promise<MetaTokenResponse | null> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;

  try {
    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri(),
      code,
    });
    const response = await fetch(`${TOKEN_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Resolves the Instagram Business Account behind this token. The Graph API
 * has no direct "my Instagram account" call — it's reached through whichever
 * Facebook Page the account manages.
 */
export async function resolveInstagramBusinessAccountId(
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=instagram_business_account&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) return null;

    const body: {
      data?: { instagram_business_account?: { id?: string } }[];
    } = await response.json();

    return (
      body.data?.find((page) => page.instagram_business_account?.id)
        ?.instagram_business_account?.id ?? null
    );
  } catch {
    return null;
  }
}

/**
 * A currently-valid access token for this creator's Instagram connection.
 *
 * Unlike Google's, a Meta long-lived user token carries no separate
 * refresh_token — it would need re-exchanging via its own long-lived-token
 * endpoint before expiry, which is not implemented here. An expired
 * connection with no refresh path simply asks the creator to reconnect,
 * rather than this module guessing at an unverified refresh flow.
 */
export async function getValidAccessToken(creatorId: string): Promise<string | null> {
  const connection = await getOAuthConnection(creatorId, "instagram");
  if (!connection) return null;
  if (new Date(connection.expires_at) > new Date()) {
    return connection.access_token;
  }
  return null;
}

export type InstagramBasicMetrics = {
  followersCount: number | null;
  mediaCount: number | null;
};

/** Follower/media counts via the Instagram Business Account's own fields. */
export async function fetchBasicMetrics(
  accessToken: string,
  igUserId: string,
): Promise<InstagramBasicMetrics | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}?fields=followers_count,media_count&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) return null;

    const body: { followers_count?: number; media_count?: number } =
      await response.json();

    return {
      followersCount: body.followers_count ?? null,
      mediaCount: body.media_count ?? null,
    };
  } catch {
    return null;
  }
}

export type InstagramRecentPost = {
  caption: string;
};

/**
 * Captions of the most recent posts, for AI niche detection
 * (src/lib/ai/niche.ts). Instagram has no separate "title" field the way a
 * YouTube video does — the caption is the only text a post carries.
 */
export async function fetchRecentCaptions(
  accessToken: string,
  igUserId: string,
): Promise<InstagramRecentPost[] | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}/media?fields=caption&limit=10&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) return null;

    const body: { data?: { caption?: string }[] } = await response.json();
    const captions = (body.data ?? [])
      .map((post) => post.caption)
      .filter((caption): caption is string => Boolean(caption?.trim()));

    return captions.length > 0 ? captions.map((caption) => ({ caption })) : null;
  } catch {
    return null;
  }
}

/** Audience country breakdown via Instagram Graph API insights. */
export async function fetchAudienceCountries(
  accessToken: string,
  igUserId: string,
): Promise<CountryShare[] | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}/insights?metric=audience_country&period=lifetime&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) return null;

    const body: {
      data?: { values?: { value?: Record<string, number> }[] }[];
    } = await response.json();
    const countryCounts = body.data?.[0]?.values?.[0]?.value;
    if (!countryCounts) return null;

    const total = Object.values(countryCounts).reduce((sum, n) => sum + n, 0);
    if (total === 0) return null;

    return Object.entries(countryCounts)
      .map(([country, count]) => ({
        country,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 10);
  } catch {
    return null;
  }
}
