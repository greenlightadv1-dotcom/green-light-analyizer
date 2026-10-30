import { strict as assert } from "node:assert";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";

// Loaded through ./register.mjs (see the "test" script): the real callback
// route, youtube.ts and youtube-scopes.ts, with the session, signed state,
// token store and service-role client replaced by the recording fakes in
// ./fakes.mjs, and Google/Meta replaced by a stubbed fetch. No network.
import { GET } from "../../../app/api/oauth/[platform]/callback/route.ts";
import { PROFILE_ID, reset, state } from "./fakes.mjs";

/** §7.3 YouTube OAuth callback: granted scopes are checked before anything is stored (D2b). */

const YT = "https://www.googleapis.com/auth/youtube.readonly";
const YTA = "https://www.googleapis.com/auth/yt-analytics.readonly";

let fetchCalls: string[] = [];
let tokenBody: Record<string, unknown> = {};
let logs: string[] = [];
const realFetch = globalThis.fetch;
const realWarn = console.warn;

beforeEach(() => {
  reset();
  fetchCalls = [];
  logs = [];
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-client-secret";
  process.env.META_APP_ID = "test-meta-id";
  process.env.META_APP_SECRET = "test-meta-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  tokenBody = { access_token: "at", refresh_token: "rt", expires_in: 3600, scope: `${YT} ${YTA}` };
  console.warn = (...args: unknown[]) => void logs.push(args.map(String).join(" "));

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    fetchCalls.push(url);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (url === "https://oauth2.googleapis.com/token") return json(tokenBody);
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels")) return json({ items: [{ id: "UC123" }] });
    if (url.startsWith("https://graph.facebook.com/v19.0/oauth/access_token")) return json({ access_token: "ig-at" });
    if (url.startsWith("https://graph.facebook.com/v19.0/me/accounts"))
      return json({ data: [{ instagram_business_account: { id: "IG1" } }] });
    throw new Error(`unexpected fetch in test: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
});

async function callback(platform: string, query = "code=c&state=s") {
  const request = new NextRequest(`https://app.test/api/oauth/${platform}/callback?${query}`);
  const response = await GET(request, { params: Promise.resolve({ platform }) });
  return { status: response.status, location: new URL(response.headers.get("location") ?? "", "https://app.test") };
}

function assertRejectedWithoutWrites(result: { status: number; location: URL }) {
  assert.equal(result.status, 307);
  assert.equal(result.location.pathname, "/media-kit");
  assert.equal(result.location.searchParams.get("oauth_error"), "youtube");
  assert.equal(result.location.searchParams.get("oauth_connected"), null);
  assert.deepEqual(state.saved, [], "no token may be saved");
  assert.deepEqual(state.upserts, [], "the kit may not be marked connected");
  assert.ok(
    !fetchCalls.some((u) => u.includes("youtube/v3/channels")),
    "no YouTube API call is made with an under-scoped token",
  );
}

test("both scopes granted: the token is saved and the kit marked connected", async () => {
  const result = await callback("youtube");
  assert.equal(result.location.searchParams.get("oauth_connected"), "youtube");
  assert.equal(result.location.searchParams.get("oauth_error"), null);
  assert.equal(state.saved.length, 1);
  const saved = state.saved[0] as { creatorId: string; platform: string; tokens: Record<string, unknown> };
  assert.equal(saved.creatorId, PROFILE_ID);
  assert.equal(saved.platform, "youtube");
  assert.equal(saved.tokens.externalAccountId, "UC123");
  assert.equal(saved.tokens.scope, `${YT} ${YTA}`);
  assert.equal(state.upserts.length, 1);
  assert.equal(state.upserts[0].table, "media_kits");
  assert.deepEqual(
    { ...(state.upserts[0].row as Record<string, unknown>), last_synced_at: "x" },
    { creator_id: PROFILE_ID, platform: "youtube", analytics_oauth_connected: true, last_synced_at: "x" },
  );
});

test("extra scopes (include_granted_scopes) are accepted", async () => {
  tokenBody.scope = `openid ${YTA} https://www.googleapis.com/auth/userinfo.email ${YT}`;
  const result = await callback("youtube");
  assert.equal(result.location.searchParams.get("oauth_connected"), "youtube");
  assert.equal(state.saved.length, 1);
  assert.equal(state.upserts.length, 1);
});

for (const [name, scope] of [
  ["only yt-analytics.readonly (the old request)", YTA],
  ["only youtube.readonly", YT],
  ["an empty scope string", ""],
  ["whitespace only", "   "],
  ["a comma-delimited pair", `${YT},${YTA}`],
  ["a near-miss URL", `${YT}/ ${YTA}`],
  ["a non-string scope", ["youtube.readonly", "yt-analytics.readonly"]],
] as const) {
  test(`rejected without writes: ${name}`, async () => {
    tokenBody.scope = scope;
    assertRejectedWithoutWrites(await callback("youtube"));
    assert.ok(logs.some((l) => l.includes("youtube_oauth.scopes_missing")));
  });
}

test("rejected without writes: no scope field at all", async () => {
  delete tokenBody.scope;
  assertRejectedWithoutWrites(await callback("youtube"));
});

test("the log names the missing scopes, never the token", async () => {
  tokenBody.scope = YTA;
  await callback("youtube");
  const line = logs.find((l) => l.includes("youtube_oauth.scopes_missing"))!;
  assert.ok(line.includes(YT));
  assert.ok(!line.includes(YTA));
  assert.ok(!line.includes('"at"') && !line.includes("rt"));
});

test("Instagram is unchanged: no scope check, connects as before", async () => {
  const result = await callback("instagram");
  assert.equal(result.location.searchParams.get("oauth_connected"), "instagram");
  assert.equal(state.saved.length, 1);
  const saved = state.saved[0] as { tokens: Record<string, unknown> };
  assert.equal(saved.tokens.scope, null);
  assert.equal(saved.tokens.externalAccountId, "IG1");
  assert.equal(state.upserts.length, 1);
});

test("an invalid state still fails before any token exchange", async () => {
  state.stateValid = false;
  const result = await callback("youtube");
  assert.equal(result.location.searchParams.get("oauth_error"), "youtube");
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(state.saved, []);
  assert.deepEqual(state.upserts, []);
});
