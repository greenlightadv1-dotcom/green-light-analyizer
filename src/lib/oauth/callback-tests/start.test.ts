import { strict as assert } from "node:assert";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";

// Loaded through ./register.mjs, like callback.test.ts: the real OAuth start
// and callback routes, with the session and signed state replaced by the
// fakes in ./fakes.mjs. No provider is contacted — start only builds a URL,
// and the refused callbacks below stop before any token exchange.
import { GET as start } from "../../../app/api/oauth/[platform]/start/route.ts";
import { GET as callback } from "../../../app/api/oauth/[platform]/callback/route.ts";
import { PROFILE_ID, reset, state } from "./fakes.mjs";

/**
 * Unified Creator Plan: the role, not the stored plan, decides who may start a
 * verified-geography connection. Every company account is stored as Starter,
 * so before this change the plan check was what kept companies out; these
 * tests pin the role boundary that replaced it.
 */

const realFetch = globalThis.fetch;
let fetchCalls: string[] = [];

beforeEach(() => {
  reset();
  fetchCalls = [];
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-client-secret";
  process.env.META_APP_ID = "test-meta-id";
  process.env.META_APP_SECRET = "test-meta-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  globalThis.fetch = (async (input: string | URL | Request) => {
    fetchCalls.push(String(input instanceof Request ? input.url : input));
    throw new Error("no network in start.test.ts");
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const params = (platform: string) => ({ params: Promise.resolve({ platform }) });

function asProfile(role: string, subscription_plan: string, extra: Record<string, unknown> = {}) {
  state.profile = { id: PROFILE_ID, role, subscription_plan, ...extra };
}

test("a company account is refused YouTube OAuth with 403", async () => {
  asProfile("company", "Starter");
  const res = await start(new Request("https://app.test/api/oauth/youtube/start"), params("youtube"));
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("location"), null);
});

test("a company account is refused Instagram OAuth with 403", async () => {
  asProfile("company", "Starter");
  const res = await start(new Request("https://app.test/api/oauth/instagram/start"), params("instagram"));
  assert.equal(res.status, 403);
});

test("a company account stays refused even if its stored plan says Elite", async () => {
  asProfile("company", "Elite");
  const res = await start(new Request("https://app.test/api/oauth/youtube/start"), params("youtube"));
  assert.equal(res.status, 403);
});

for (const plan of ["Starter", "Pro", "Elite"]) {
  test(`a creator stored as ${plan} is sent to Google's consent screen`, async () => {
    asProfile("creator", plan);
    const res = await start(new Request("https://app.test/api/oauth/youtube/start"), params("youtube"));
    assert.equal(res.status, 307);
    const location = new URL(res.headers.get("location") ?? "");
    assert.equal(location.hostname, "accounts.google.com");
    assert.equal(location.searchParams.get("state"), `signed-state-for-${PROFILE_ID}`);
  });
}

test("a creator whose old paid plan has expired keeps YouTube access", async () => {
  asProfile("creator", "Pro", { subscription_expires_at: "2020-01-01T00:00:00.000Z" });
  const res = await start(new Request("https://app.test/api/oauth/youtube/start"), params("youtube"));
  assert.equal(res.status, 307);
});

test("an admin keeps the access the navigation gives it", async () => {
  asProfile("admin", "Starter");
  const res = await start(new Request("https://app.test/api/oauth/youtube/start"), params("youtube"));
  assert.equal(res.status, 307);
});

test("Instagram is refused for creators too while its integration is in development", async () => {
  asProfile("creator", "Elite");
  const res = await start(new Request("https://app.test/api/oauth/instagram/start"), params("instagram"));
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /in development/);
});

test("Twitch remains a placeholder (501), not a live integration", async () => {
  asProfile("creator", "Elite");
  const res = await start(new Request("https://app.test/api/oauth/twitch/start"), params("twitch"));
  assert.equal(res.status, 501);
});

test("the callback refuses a company even with a valid signed state, storing nothing", async () => {
  asProfile("company", "Starter");
  const req = new NextRequest("https://app.test/api/oauth/youtube/callback?code=abc&state=valid");
  const res = await callback(req, params("youtube"));
  assert.equal(res.status, 307);
  assert.equal(new URL(res.headers.get("location") ?? "").searchParams.get("oauth_error"), "youtube");
  assert.deepEqual(state.saved, []);
  assert.deepEqual(state.upserts, []);
  assert.deepEqual(fetchCalls, [], "no token exchange is attempted");
});
