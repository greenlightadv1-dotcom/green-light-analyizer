import { strict as assert } from "node:assert";
import { test } from "node:test";

import { isAuthorizedCron } from "../cron-auth.ts";
import {
  STALE_CLEANUP_AFTER_MS,
  VERIFIED_GEO_MAX_AGE_MS,
  clearedVerifiedGeo,
  isRevokedGrant,
  isVerifiedGeoFresh,
  staleCleanupCutoff,
} from "./youtube-freshness.ts";

/** G1: YouTube API data is fresh or gone; a revoked grant deletes only YouTube-derived data. */

const NOW = new Date("2026-10-30T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const DAY = 86_400_000;

test("verified geography is fresh only within 30 days of its own sync", () => {
  assert.ok(isVerifiedGeoFresh({ audience_verified: true, verified_geo_synced_at: ago(0) }, NOW));
  assert.ok(isVerifiedGeoFresh({ audience_verified: true, verified_geo_synced_at: ago(29 * DAY) }, NOW));
  assert.ok(isVerifiedGeoFresh({ audience_verified: true, verified_geo_synced_at: ago(VERIFIED_GEO_MAX_AGE_MS - 1) }, NOW));
  assert.equal(isVerifiedGeoFresh({ audience_verified: true, verified_geo_synced_at: ago(VERIFIED_GEO_MAX_AGE_MS) }, NOW), false);
  assert.equal(isVerifiedGeoFresh({ audience_verified: true, verified_geo_synced_at: ago(90 * DAY) }, NOW), false);
});

test("missing, unparseable or future sync times are never fresh", () => {
  for (const kit of [
    { audience_verified: true, verified_geo_synced_at: null },
    { audience_verified: true }, // pre-0023 row
    { audience_verified: true, verified_geo_synced_at: "not a date" },
    { audience_verified: true, verified_geo_synced_at: ago(-2 * DAY) },
    { audience_verified: false, verified_geo_synced_at: ago(0) },
    { audience_verified: null, verified_geo_synced_at: ago(0) },
    null,
    undefined,
  ]) {
    assert.equal(isVerifiedGeoFresh(kit, NOW), false, JSON.stringify(kit));
  }
});

test("the cleanup cutoff is a day inside the 30-day limit", () => {
  assert.equal(STALE_CLEANUP_AFTER_MS, VERIFIED_GEO_MAX_AGE_MS - DAY);
  assert.equal(staleCleanupCutoff(NOW), ago(29 * DAY));
});

test("clearing touches only verified-geography columns", () => {
  assert.deepEqual(clearedVerifiedGeo({ disconnect: false }), {
    audience_verified: false,
    verified_top_countries: null,
    verified_geo_synced_at: null,
  });
  assert.deepEqual(clearedVerifiedGeo({ disconnect: true }), {
    audience_verified: false,
    verified_top_countries: null,
    verified_geo_synced_at: null,
    analytics_oauth_connected: false,
  });
  // Never creator-entered or public-stats fields.
  for (const field of ["declared_top_countries", "avg_views", "engagement_rate", "content_category", "subscriber_count"]) {
    assert.ok(!(field in clearedVerifiedGeo({ disconnect: true })), field);
  }
});

test("only Google's invalid_grant counts as a revoked grant", () => {
  assert.ok(isRevokedGrant(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }));
  assert.ok(isRevokedGrant(401, { error: "invalid_grant" }));
  for (const [status, body] of [
    [500, { error: "invalid_grant" }],
    [503, null],
    [400, { error: "invalid_client" }], // our misconfiguration, not the creator's revocation
    [400, { error: "invalid_request" }],
    [400, null],
    [400, "invalid_grant"],
    [429, { error: "rate_limit" }],
  ] as const) {
    assert.equal(isRevokedGrant(status, body), false, `${status} ${JSON.stringify(body)}`);
  }
});

test("cron auth requires the exact bearer secret, and refuses when none is set", () => {
  const secret = "s".repeat(32);
  assert.ok(isAuthorizedCron(`Bearer ${secret}`, secret));
  for (const header of [null, "", secret, `Bearer ${secret}x`, `bearer ${secret}`, `Bearer ${"t".repeat(32)}`]) {
    assert.equal(isAuthorizedCron(header, secret), false, String(header));
  }
  assert.equal(isAuthorizedCron("Bearer ", ""), false);
  assert.equal(isAuthorizedCron("Bearer undefined", undefined), false);
  assert.equal(isAuthorizedCron("Bearer short", "short"), false, "a short secret is refused");
});
