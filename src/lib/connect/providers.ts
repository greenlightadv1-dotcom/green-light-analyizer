/**
 * Account connections for Twitch, Kick and TikTok (migration 0042).
 *
 * A creator signs in to the platform through its own OAuth. That proves the
 * creator owns the account, and the account's public counts are then read
 * from the official API instead of typed by hand. None of these platforms
 * gives third parties audience geography, so nothing here ever writes
 * verified_top_countries: geography for these platforms stays self-reported
 * (§7.2/§7.3).
 *
 * This file is pure (no fetch, no env, no server-only) so the URL building and
 * response parsing are unit-tested directly (providers.test.ts). The network
 * half is server.ts.
 *
 * Sources, read 2026-11-23:
 * - Twitch: dev.twitch.tv/docs/authentication (authorization code flow) and
 *   the Helix reference. Get Channel Followers returns only `total` unless the
 *   caller is the broadcaster with moderator:read:followers, which we never
 *   ask for: the total is all we use.
 * - Kick: docs.kick.com, OAuth 2.1 with PKCE (S256) at id.kick.com, and
 *   GET /public/v1/channels with no parameters returning the token owner's
 *   channel (scope channel:read). The public API exposes no follower count.
 * - TikTok: developers.tiktok.com Login Kit for Web (no PKCE for web apps),
 *   /v2/oauth/token/, /v2/user/info/ and /v2/video/list/.
 */

export type ConnectPlatform = "twitch" | "kick" | "tiktok";

export const CONNECT_PLATFORMS: readonly ConnectPlatform[] = ["twitch", "kick", "tiktok"];

export function isConnectPlatform(value: string): value is ConnectPlatform {
  return (CONNECT_PLATFORMS as readonly string[]).includes(value);
}

export type ProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  /** Joined with `scopeSeparator` in the authorization URL. */
  scopes: readonly string[];
  scopeSeparator: " " | ",";
  /** The authorization URL's name for the client id (TikTok says client_key). */
  clientIdParam: "client_id" | "client_key";
  /** OAuth 2.1 PKCE, S256. Kick requires it; TikTok web and Twitch do not. */
  pkce: boolean;
  /** Environment variable names. */
  clientIdEnv: string;
  clientSecretEnv: string;
};

export const PROVIDERS: Record<ConnectPlatform, ProviderConfig> = {
  twitch: {
    authorizeUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    // No scope at all: identifying the token's own user and reading the
    // follower total need none. Asking for nothing is the point.
    scopes: [],
    scopeSeparator: " ",
    clientIdParam: "client_id",
    pkce: false,
    clientIdEnv: "TWITCH_CLIENT_ID",
    clientSecretEnv: "TWITCH_CLIENT_SECRET",
  },
  kick: {
    authorizeUrl: "https://id.kick.com/oauth/authorize",
    tokenUrl: "https://id.kick.com/oauth/token",
    scopes: ["user:read", "channel:read"],
    scopeSeparator: " ",
    clientIdParam: "client_id",
    pkce: true,
    clientIdEnv: "KICK_CLIENT_ID",
    clientSecretEnv: "KICK_CLIENT_SECRET",
  },
  tiktok: {
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "user.info.profile", "user.info.stats", "video.list"],
    scopeSeparator: ",",
    clientIdParam: "client_key",
    pkce: false,
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
  },
};

export function callbackPath(platform: ConnectPlatform): string {
  return `/api/connect/${platform}/callback`;
}

export function buildAuthorizeUrl(
  platform: ConnectPlatform,
  input: { clientId: string; redirectUri: string; state: string; codeChallenge?: string },
): string {
  const config = PROVIDERS[platform];
  const params = new URLSearchParams({
    [config.clientIdParam]: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: config.scopes.join(config.scopeSeparator),
    state: input.state,
  });
  if (config.pkce) {
    if (!input.codeChallenge) throw new Error(`${platform} requires a PKCE code challenge.`);
    params.set("code_challenge", input.codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  // Always show the consent screen, so the creator sees which account and
  // which permissions they are granting, even when the platform remembers
  // an earlier grant.
  if (platform === "twitch") params.set("force_verify", "true");
  if (platform === "tiktok") params.set("disable_auto_auth", "1");
  return `${config.authorizeUrl}?${params.toString()}`;
}

/** The form body for the authorization-code exchange. */
export function tokenRequestBody(
  platform: ConnectPlatform,
  input: { clientId: string; clientSecret: string; code: string; redirectUri: string; codeVerifier?: string },
): URLSearchParams {
  const config = PROVIDERS[platform];
  const body = new URLSearchParams({
    [config.clientIdParam]: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
  });
  if (config.pkce) {
    if (!input.codeVerifier) throw new Error(`${platform} requires a PKCE code verifier.`);
    body.set("code_verifier", input.codeVerifier);
  }
  return body;
}

export function refreshRequestBody(
  platform: ConnectPlatform,
  input: { clientId: string; clientSecret: string; refreshToken: string },
): URLSearchParams {
  const config = PROVIDERS[platform];
  return new URLSearchParams({
    [config.clientIdParam]: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
}

export type ParsedToken = {
  accessToken: string;
  refreshToken: string | null;
  /** Seconds; null when the provider did not say. */
  expiresIn: number | null;
  scope: string | null;
  /** TikTok returns the user id with the token. */
  openId: string | null;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** A count: a finite, non-negative integer, or null. */
function count(value: unknown): number | null {
  const n = num(value);
  return n !== null && n >= 0 ? Math.round(n) : null;
}

/** Twitch returns scope as an array, Kick and TikTok as a string. */
export function parseTokenResponse(body: unknown): ParsedToken | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  // TikTok has wrapped this in `data` in some versions; accept both.
  const t = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;
  const accessToken = str(t.access_token);
  if (!accessToken) return null;
  const scope = Array.isArray(t.scope)
    ? t.scope.filter((s): s is string => typeof s === "string").join(" ")
    : str(t.scope);
  return {
    accessToken,
    refreshToken: str(t.refresh_token),
    expiresIn: num(t.expires_in),
    scope: scope || null,
    openId: str(t.open_id),
  };
}

/** What a connected account contributes to its media kit. */
export type AccountStats = {
  /** The platform's own id for the account; unique per platform. */
  externalId: string;
  /** The handle as the platform spells it, which replaces whatever was typed. */
  handle: string;
  /** Followers. Null when the platform does not expose it (Kick). */
  followers: number | null;
  /** Total posted videos. Null when not exposed. */
  mediaCount: number | null;
  /** Median views of the recent videos, and how many were sampled. */
  recentViews: { median: number; sample: number } | null;
};

export function median(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function recentViews(views: number[]): AccountStats["recentViews"] {
  const m = median(views);
  return m === null ? null : { median: m, sample: views.length };
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object")
    : [];
}

/** GET /helix/users with the user's token: the token owner. */
export function parseTwitchUser(body: unknown): { id: string; login: string } | null {
  const user = list((body as { data?: unknown })?.data)[0];
  const id = str(user?.id);
  const login = str(user?.login);
  return id && login ? { id, login } : null;
}

/** GET /helix/channels/followers: only `total` is ever used. */
export function parseTwitchFollowerTotal(body: unknown): number | null {
  return count((body as { total?: unknown })?.total);
}

/** GET /helix/videos?type=archive: view counts of past broadcasts. */
export function parseTwitchVideoViews(body: unknown): number[] {
  return list((body as { data?: unknown })?.data)
    .map((v) => count(v.view_count))
    .filter((v): v is number => v !== null);
}

export function twitchStats(
  user: { id: string; login: string },
  followers: number | null,
  videoViews: number[],
): AccountStats {
  return {
    externalId: user.id,
    handle: user.login,
    followers,
    mediaCount: null,
    recentViews: recentViews(videoViews),
  };
}

/** GET /public/v1/channels with no parameters: the token owner's channel. */
export function parseKickChannel(body: unknown): AccountStats | null {
  const channel = list((body as { data?: unknown })?.data)[0];
  const id = count(channel?.broadcaster_user_id);
  const slug = str(channel?.slug);
  if (id === null || !slug) return null;
  return {
    externalId: String(id),
    handle: slug,
    // Kick's public API exposes no follower count. active_subscribers_count is
    // paid subscribers, a different number, so it is deliberately not stored
    // as followers.
    followers: null,
    mediaCount: null,
    recentViews: null,
  };
}

/** GET /v2/user/info/: TikTok answers 200 with error.code "ok" on success. */
export function parseTikTokUser(body: unknown): {
  openId: string;
  username: string | null;
  followers: number | null;
  videoCount: number | null;
} | null {
  const root = body as { data?: { user?: Record<string, unknown> }; error?: { code?: unknown } };
  if (root?.error && root.error.code !== "ok") return null;
  const user = root?.data?.user;
  const openId = str(user?.open_id);
  if (!openId) return null;
  return {
    openId,
    username: str(user?.username),
    followers: count(user?.follower_count),
    videoCount: count(user?.video_count),
  };
}

/** POST /v2/video/list/: view counts of the most recent videos. */
export function parseTikTokVideoViews(body: unknown): number[] {
  const root = body as { data?: { videos?: unknown }; error?: { code?: unknown } };
  if (root?.error && root.error.code !== "ok") return [];
  return list(root?.data?.videos)
    .map((v) => count(v.view_count))
    .filter((v): v is number => v !== null);
}

export function tiktokStats(
  user: NonNullable<ReturnType<typeof parseTikTokUser>>,
  videoViews: number[],
): AccountStats | null {
  // Without user.info.profile there is no username, and a TikTok kit with no
  // handle would show sponsors nothing they can check.
  if (!user.username) return null;
  return {
    externalId: user.openId,
    handle: user.username,
    followers: user.followers,
    mediaCount: user.videoCount,
    recentViews: recentViews(videoViews),
  };
}

/** Token lifetime as an ISO instant; a provider that says nothing gets one hour. */
export function expiresAtIso(expiresIn: number | null, now = Date.now()): string {
  const seconds = expiresIn !== null && expiresIn > 0 ? expiresIn : 3600;
  return new Date(now + seconds * 1000).toISOString();
}
