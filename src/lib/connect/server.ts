import "server-only";

import { log } from "@/lib/log";
import { getOAuthConnection, saveOAuthTokens } from "@/lib/oauth/tokens";
import {
  PROVIDERS,
  callbackPath,
  expiresAtIso,
  parseKickChannel,
  parseTikTokUser,
  parseTikTokVideoViews,
  parseTokenResponse,
  parseTwitchFollowerTotal,
  parseTwitchUser,
  parseTwitchVideoViews,
  refreshRequestBody,
  tiktokStats,
  tokenRequestBody,
  twitchStats,
  type AccountStats,
  type ConnectPlatform,
  type ParsedToken,
} from "./providers";

/**
 * The network half of account connections (providers.ts is the pure half).
 *
 * Every call here has a 10s timeout and fails closed: a provider that cannot
 * be reached produces null, never a guessed number. No response body is ever
 * logged, since a token response is a credential.
 */

const TIMEOUT_MS = 10_000;

export type Credentials = { clientId: string; clientSecret: string; redirectUri: string };

/** Null when this platform's app is not registered on this environment. */
export function credentials(platform: ConnectPlatform): Credentials | null {
  const config = PROVIDERS[platform];
  const clientId = process.env[config.clientIdEnv]?.trim();
  const clientSecret = process.env[config.clientSecretEnv]?.trim();
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (!clientId || !clientSecret || !base) return null;
  return { clientId, clientSecret, redirectUri: `${base}${callbackPath(platform)}` };
}

async function postForm(url: string, body: URLSearchParams): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn("connect.token_request_failed", { host: new URL(url).host, status: response.status });
      return null;
    }
    return await response.json();
  } catch (error) {
    log.warn("connect.token_request_failed", { host: new URL(url).host, error });
    return null;
  }
}

export async function exchangeCode(
  platform: ConnectPlatform,
  creds: Credentials,
  code: string,
  codeVerifier?: string,
): Promise<ParsedToken | null> {
  const body = tokenRequestBody(platform, { ...creds, code, codeVerifier });
  return parseTokenResponse(await postForm(PROVIDERS[platform].tokenUrl, body));
}

async function getJson(
  platform: ConnectPlatform,
  url: string,
  headers: Record<string, string>,
  init?: { method?: string; body?: string },
): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: { accept: "application/json", ...headers },
      body: init?.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn("connect.api_failed", { platform, path: new URL(url).pathname, status: response.status });
      return null;
    }
    return await response.json();
  } catch (error) {
    log.warn("connect.api_failed", { platform, path: new URL(url).pathname, error });
    return null;
  }
}

/**
 * The connected account's identity and public counts, read with the user's
 * own token. Null when the account itself cannot be read; a missing count is
 * null inside the result rather than failing the whole call.
 */
export async function fetchAccountStats(
  platform: ConnectPlatform,
  accessToken: string,
  creds: Credentials,
): Promise<AccountStats | null> {
  const auth = { authorization: `Bearer ${accessToken}` };

  if (platform === "twitch") {
    const headers = { ...auth, "client-id": creds.clientId };
    const user = parseTwitchUser(await getJson(platform, "https://api.twitch.tv/helix/users", headers));
    if (!user) return null;
    const id = encodeURIComponent(user.id);
    const [followers, videos] = await Promise.all([
      getJson(platform, `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${id}&first=1`, headers),
      getJson(platform, `https://api.twitch.tv/helix/videos?user_id=${id}&type=archive&first=20`, headers),
    ]);
    return twitchStats(user, parseTwitchFollowerTotal(followers), parseTwitchVideoViews(videos));
  }

  if (platform === "kick") {
    return parseKickChannel(await getJson(platform, "https://api.kick.com/public/v1/channels", auth));
  }

  const fields = "open_id,username,display_name,follower_count,video_count";
  const user = parseTikTokUser(
    await getJson(platform, `https://open.tiktokapis.com/v2/user/info/?fields=${fields}`, auth),
  );
  if (!user) return null;
  const videos = await getJson(
    platform,
    "https://open.tiktokapis.com/v2/video/list/?fields=id,view_count",
    { ...auth, "content-type": "application/json" },
    { method: "POST", body: JSON.stringify({ max_count: 20 }) },
  );
  return tiktokStats(user, parseTikTokVideoViews(videos));
}

/**
 * A usable access token for a stored connection, refreshing it when it is
 * within a minute of expiry. Refresh tokens rotate on Kick and TikTok, so the
 * new pair is saved before it is used. Null means the creator must reconnect.
 */
export async function validAccessToken(
  creatorId: string,
  platform: ConnectPlatform,
  creds: Credentials,
): Promise<{ token: string; externalId: string | null } | null> {
  const connection = await getOAuthConnection(creatorId, platform);
  if (!connection) return null;

  if (new Date(connection.expires_at).getTime() - Date.now() > 60_000) {
    return { token: connection.access_token, externalId: connection.external_account_id };
  }
  if (!connection.refresh_token) return null;

  const refreshed = parseTokenResponse(
    await postForm(
      PROVIDERS[platform].tokenUrl,
      refreshRequestBody(platform, { ...creds, refreshToken: connection.refresh_token }),
    ),
  );
  if (!refreshed) return null;

  await saveOAuthTokens(creatorId, platform, {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? connection.refresh_token,
    expiresAt: expiresAtIso(refreshed.expiresIn),
    externalAccountId: connection.external_account_id,
    scope: refreshed.scope ?? connection.scope,
  });
  return { token: refreshed.accessToken, externalId: connection.external_account_id };
}
