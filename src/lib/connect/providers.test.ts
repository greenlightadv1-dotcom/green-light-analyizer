import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CONNECT_PLATFORMS,
  buildAuthorizeUrl,
  expiresAtIso,
  isConnectPlatform,
  median,
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
} from "./providers.ts";

const base = { clientId: "cid", redirectUri: "https://www.greenlightadvs.com/api/connect/x/callback", state: "st" };

test("only Twitch, Kick and TikTok are account connections", () => {
  assert.deepEqual([...CONNECT_PLATFORMS], ["twitch", "kick", "tiktok"]);
  assert.equal(isConnectPlatform("kick"), true);
  assert.equal(isConnectPlatform("youtube"), false);
  assert.equal(isConnectPlatform("instagram"), false);
});

test("Twitch asks for no scope at all and forces the account picker", () => {
  const url = new URL(buildAuthorizeUrl("twitch", base));
  assert.equal(url.origin + url.pathname, "https://id.twitch.tv/oauth2/authorize");
  assert.equal(url.searchParams.get("scope"), "");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("force_verify"), "true");
  assert.equal(url.searchParams.get("code_challenge"), null);
});

test("Kick requires PKCE S256 and read-only scopes", () => {
  assert.throws(() => buildAuthorizeUrl("kick", base), /PKCE/);
  const url = new URL(buildAuthorizeUrl("kick", { ...base, codeChallenge: "ch" }));
  assert.equal(url.searchParams.get("code_challenge"), "ch");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "user:read channel:read");
  const body = tokenRequestBody("kick", { clientId: "cid", clientSecret: "s", code: "c", redirectUri: "r", codeVerifier: "v" });
  assert.equal(body.get("code_verifier"), "v");
  assert.throws(() => tokenRequestBody("kick", { clientId: "cid", clientSecret: "s", code: "c", redirectUri: "r" }), /PKCE/);
});

test("TikTok uses client_key and comma-separated scopes, without PKCE on the web", () => {
  const url = new URL(buildAuthorizeUrl("tiktok", base));
  assert.equal(url.origin + url.pathname, "https://www.tiktok.com/v2/auth/authorize/");
  assert.equal(url.searchParams.get("client_key"), "cid");
  assert.equal(url.searchParams.get("client_id"), null);
  assert.equal(url.searchParams.get("scope"), "user.info.basic,user.info.profile,user.info.stats,video.list");
  const body = tokenRequestBody("tiktok", { clientId: "cid", clientSecret: "s", code: "c", redirectUri: "r" });
  assert.equal(body.get("client_key"), "cid");
  assert.equal(body.get("grant_type"), "authorization_code");
  const refresh = refreshRequestBody("tiktok", { clientId: "cid", clientSecret: "s", refreshToken: "rt" });
  assert.equal(refresh.get("grant_type"), "refresh_token");
  assert.equal(refresh.get("refresh_token"), "rt");
});

test("token responses: Twitch scope arrays, TikTok open_id, garbage refused", () => {
  assert.deepEqual(parseTokenResponse({ access_token: "a", refresh_token: "r", expires_in: 14000, scope: [] }), {
    accessToken: "a",
    refreshToken: "r",
    expiresIn: 14000,
    scope: null,
    openId: null,
  });
  const tiktok = parseTokenResponse({ access_token: "a", expires_in: 7200, open_id: "o1", scope: "user.info.basic,video.list" });
  assert.equal(tiktok?.openId, "o1");
  assert.equal(tiktok?.scope, "user.info.basic,video.list");
  assert.equal(parseTokenResponse({ error: "invalid_grant" }), null);
  assert.equal(parseTokenResponse(null), null);
  assert.equal(parseTokenResponse("x"), null);
});

test("Twitch: identity, follower total and the median of past-broadcast views", () => {
  const user = parseTwitchUser({ data: [{ id: "123", login: "gamer_eg", display_name: "Gamer" }] });
  assert.deepEqual(user, { id: "123", login: "gamer_eg" });
  assert.equal(parseTwitchUser({ data: [] }), null);
  assert.equal(parseTwitchFollowerTotal({ total: 5400, data: [] }), 5400);
  assert.equal(parseTwitchFollowerTotal({ data: [] }), null);
  assert.equal(parseTwitchFollowerTotal({ total: -1 }), null);
  const views = parseTwitchVideoViews({ data: [{ view_count: 100 }, { view_count: 300 }, { view_count: "x" }, { view_count: 200 }] });
  assert.deepEqual(views, [100, 300, 200]);
  assert.deepEqual(twitchStats(user!, 5400, views), {
    externalId: "123",
    handle: "gamer_eg",
    followers: 5400,
    mediaCount: null,
    recentViews: { median: 200, sample: 3 },
  });
  assert.equal(twitchStats(user!, null, []).recentViews, null);
});

test("Kick: the owner's channel, and paid subscribers are never stored as followers", () => {
  const stats = parseKickChannel({
    data: [{ broadcaster_user_id: 42, slug: "eg-streamer", active_subscribers_count: 150, stream: { viewer_count: 67 } }],
  });
  assert.deepEqual(stats, { externalId: "42", handle: "eg-streamer", followers: null, mediaCount: null, recentViews: null });
  assert.equal(parseKickChannel({ data: [{ slug: "no-id" }] }), null);
  assert.equal(parseKickChannel({}), null);
});

test("TikTok: counts from user.info.stats; an error envelope or a missing username fails closed", () => {
  const user = parseTikTokUser({
    data: { user: { open_id: "o1", username: "creator.eg", follower_count: 12000, video_count: 80 } },
    error: { code: "ok", message: "" },
  });
  assert.deepEqual(user, { openId: "o1", username: "creator.eg", followers: 12000, videoCount: 80 });
  assert.equal(parseTikTokUser({ data: { user: { open_id: "o1" } }, error: { code: "scope_not_authorized" } }), null);
  const views = parseTikTokVideoViews({ data: { videos: [{ view_count: 10 }, { view_count: 30 }] }, error: { code: "ok" } });
  assert.deepEqual(views, [10, 30]);
  assert.deepEqual(parseTikTokVideoViews({ error: { code: "access_token_invalid" } }), []);
  assert.deepEqual(tiktokStats(user!, views)?.recentViews, { median: 20, sample: 2 });
  assert.equal(tiktokStats({ ...user!, username: null }, views), null);
});

test("median handles odd, even, empty and negative input", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3);
  assert.equal(median([]), null);
  assert.equal(median([-5, 4]), 4);
});

test("token expiry defaults to an hour when the provider is silent", () => {
  const now = Date.UTC(2026, 10, 23);
  assert.equal(expiresAtIso(7200, now), new Date(now + 7_200_000).toISOString());
  assert.equal(expiresAtIso(null, now), new Date(now + 3_600_000).toISOString());
  assert.equal(expiresAtIso(0, now), new Date(now + 3_600_000).toISOString());
});
