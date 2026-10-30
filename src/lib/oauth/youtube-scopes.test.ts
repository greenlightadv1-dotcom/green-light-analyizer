import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  MISSING_SCOPE_MESSAGE,
  REQUIRED_YOUTUBE_SCOPES,
  YOUTUBE_READONLY_SCOPE,
  YT_ANALYTICS_READONLY_SCOPE,
  buildYouTubeAuthorizationParams,
  hasRequiredYouTubeScopes,
  missingYouTubeScopes,
  parseGrantedScopes,
  youtubeSyncScopeError,
} from "./youtube-scopes.ts";

/** §7.3 YouTube OAuth scopes (Stage 1, D2b). No network. */

const YT = "https://www.googleapis.com/auth/youtube.readonly";
const YTA = "https://www.googleapis.com/auth/yt-analytics.readonly";

test("the two required scopes are the exact documented URLs", () => {
  assert.equal(YOUTUBE_READONLY_SCOPE, YT);
  assert.equal(YT_ANALYTICS_READONLY_SCOPE, YTA);
  assert.deepEqual([...REQUIRED_YOUTUBE_SCOPES], [YT, YTA]);
});

// --- parsing ------------------------------------------------------------------

test("parses a space-delimited scope string, tolerating extra whitespace", () => {
  assert.deepEqual([...parseGrantedScopes(`${YT} ${YTA}`)], [YT, YTA]);
  assert.deepEqual([...parseGrantedScopes(`  ${YT}\t\n${YTA}  `)], [YT, YTA]);
  assert.deepEqual([...parseGrantedScopes(`${YT} ${YT}`)], [YT]);
});

test("anything but a non-empty string parses to no scopes", () => {
  for (const value of [undefined, null, "", "   ", 42, {}, [YT, YTA], true]) {
    assert.equal(parseGrantedScopes(value).size, 0, JSON.stringify(value));
  }
});

// --- the check ------------------------------------------------------------------

test("both scopes, in either order, pass; extra scopes are accepted", () => {
  assert.ok(hasRequiredYouTubeScopes(`${YT} ${YTA}`));
  assert.ok(hasRequiredYouTubeScopes(`${YTA} ${YT}`));
  assert.ok(hasRequiredYouTubeScopes(`openid ${YTA} https://www.googleapis.com/auth/userinfo.email ${YT}`));
  assert.deepEqual(missingYouTubeScopes(`${YT} ${YTA}`), []);
});

test("missing, partial, empty or malformed grants fail and name what is missing", () => {
  assert.deepEqual(missingYouTubeScopes(YTA), [YT]);
  assert.deepEqual(missingYouTubeScopes(YT), [YTA]);
  for (const value of [undefined, null, "", " ", [YT, YTA], `${YT},${YTA}`]) {
    assert.deepEqual(missingYouTubeScopes(value), [YT, YTA], JSON.stringify(value));
    assert.equal(hasRequiredYouTubeScopes(value), false);
  }
});

test("matching is exact on the full URL — no prefixes, suffixes, case or short forms", () => {
  for (const near of [
    "youtube.readonly yt-analytics.readonly",
    `${YT}/ ${YTA}`,
    `${YT.toUpperCase()} ${YTA}`,
    `http://www.googleapis.com/auth/youtube.readonly ${YTA}`,
    `https://www.googleapis.com/auth/youtube ${YTA}`, // broader scope, not the one requested
    `${YT}x ${YTA}`,
  ]) {
    assert.equal(hasRequiredYouTubeScopes(near), false, near);
  }
});

// --- authorization URL ----------------------------------------------------------

test("authorization parameters request both scopes and incremental consent", () => {
  const p = buildYouTubeAuthorizationParams({
    clientId: "cid",
    redirectUri: "https://app.test/api/oauth/youtube/callback",
    state: "signed-state",
  });
  assert.equal(p.get("scope"), `${YT} ${YTA}`);
  assert.deepEqual(p.get("scope")!.split(" "), [...REQUIRED_YOUTUBE_SCOPES]);
  assert.equal(p.get("include_granted_scopes"), "true");
  // Unchanged from before D2b.
  assert.equal(p.get("access_type"), "offline");
  assert.equal(p.get("prompt"), "consent");
  assert.equal(p.get("response_type"), "code");
  assert.equal(p.get("client_id"), "cid");
  assert.equal(p.get("redirect_uri"), "https://app.test/api/oauth/youtube/callback");
  assert.equal(p.get("state"), "signed-state");
  assert.deepEqual(
    [...p.keys()].sort(),
    ["access_type", "client_id", "include_granted_scopes", "prompt", "redirect_uri", "response_type", "scope", "state"],
  );
  // Space-delimited on the wire (URLSearchParams encodes the space as "+").
  assert.ok(p.toString().includes(`scope=${encodeURIComponent(YT)}+${encodeURIComponent(YTA)}`));
});

// --- defensive pre-sync check -----------------------------------------------------

test("a stored connection with both scopes may sync", () => {
  assert.equal(youtubeSyncScopeError(`${YT} ${YTA}`), null);
  assert.equal(youtubeSyncScopeError(`${YTA} openid ${YT}`), null);
});

test("a stored connection missing a scope, or with none recorded, must reconnect", () => {
  for (const stored of [YTA, YT, "", null, undefined]) {
    const error = youtubeSyncScopeError(stored);
    assert.equal(error, MISSING_SCOPE_MESSAGE, String(stored));
    assert.match(error!, /reconnect/);
  }
});
