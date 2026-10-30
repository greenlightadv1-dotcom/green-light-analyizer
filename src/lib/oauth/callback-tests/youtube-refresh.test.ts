import { strict as assert } from "node:assert";
import { afterEach, beforeEach, test } from "node:test";

// Loaded through ./register.mjs: the real youtube.ts and youtube-freshness.ts,
// with the token store and service-role client replaced by the recording
// fakes in ./fakes.mjs, and Google replaced by a stubbed fetch. No network.
import { getValidAccessToken } from "../youtube.ts";
import { reset, state } from "./fakes.mjs";

/** G1: a revoked grant deletes the creator's YouTube token and verified geography — nothing else. */

let tokenResponse: { status: number; body: unknown } = { status: 200, body: {} };
let fetchCalls: string[] = [];
const realFetch = globalThis.fetch;
const realLog = { info: console.info, warn: console.warn, error: console.error };

beforeEach(() => {
  reset();
  fetchCalls = [];
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  for (const level of ["info", "warn", "error"] as const) console[level] = () => {};
  state.connection = {
    access_token: "old",
    refresh_token: "rt",
    expires_at: new Date(Date.now() - 60_000).toISOString(), // expired: forces a refresh
    external_account_id: "UC123",
    scope: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    fetchCalls.push(url);
    if (url !== "https://oauth2.googleapis.com/token") throw new Error(`unexpected fetch: ${url}`);
    return new Response(JSON.stringify(tokenResponse.body), {
      status: tokenResponse.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(console, realLog);
});

test("invalid_grant deletes the token and clears only YouTube verified geography", async () => {
  tokenResponse = { status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } };
  assert.equal(await getValidAccessToken("creator-1"), null);

  assert.deepEqual(state.deleted, [{ creatorId: "creator-1", platform: "youtube" }]);
  assert.equal(state.updates.length, 1);
  const [update] = state.updates;
  assert.equal(update.table, "media_kits");
  assert.deepEqual(update.filters, [["creator_id", "creator-1"], ["platform", "youtube"]]);
  assert.deepEqual(update.row, {
    audience_verified: false,
    verified_top_countries: null,
    verified_geo_synced_at: null,
    analytics_oauth_connected: false,
  });
  assert.deepEqual(state.saved, [], "no token is saved");
});

for (const [name, response] of [
  ["a Google outage (503)", { status: 503, body: { error: "backendError" } }],
  ["a client misconfiguration (invalid_client)", { status: 401, body: { error: "invalid_client" } }],
  ["an unreadable error body", { status: 400, body: "not json" }],
] as const) {
  test(`${name} deletes nothing`, async () => {
    tokenResponse = response;
    assert.equal(await getValidAccessToken("creator-1"), null);
    assert.deepEqual(state.deleted, []);
    assert.deepEqual(state.updates, []);
  });
}

test("a network failure deletes nothing", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  assert.equal(await getValidAccessToken("creator-1"), null);
  assert.deepEqual(state.deleted, []);
  assert.deepEqual(state.updates, []);
});

test("a successful refresh saves the new token and deletes nothing", async () => {
  tokenResponse = { status: 200, body: { access_token: "new", expires_in: 3600, scope: (state.connection as { scope: string }).scope } };
  assert.equal(await getValidAccessToken("creator-1"), "new");
  assert.equal(state.saved.length, 1);
  assert.deepEqual(state.deleted, []);
});

test("an unexpired token is returned without calling Google", async () => {
  (state.connection as Record<string, unknown>).expires_at = new Date(Date.now() + 3_600_000).toISOString();
  assert.equal(await getValidAccessToken("creator-1"), "old");
  assert.deepEqual(fetchCalls, []);
});
