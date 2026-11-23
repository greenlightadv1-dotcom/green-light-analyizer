import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  INTEGRATION_PLATFORMS,
  INTEGRATION_STATUS,
  MAX_CONNECTIONS,
  PLATFORMS,
  VERIFICATION_SUPPORT,
  canAddConnection,
  integrationStatusFor,
  liveConnections,
  verificationAvailability,
} from "./platforms.ts";

/** §7.3 verification matrix, the unified Creator Plan's connection ceiling, and integration status. */

test("§7.3: only YouTube and Instagram can ever be verified", () => {
  assert.equal(VERIFICATION_SUPPORT.youtube.supported, true);
  assert.equal(VERIFICATION_SUPPORT.instagram.supported, true);
  assert.equal(VERIFICATION_SUPPORT.twitch.supported, false);
  assert.equal(VERIFICATION_SUPPORT.kick.supported, false);
  assert.equal(VERIFICATION_SUPPORT.tiktok.supported, false);
});

test("every platform in the schema has a matrix entry", () => {
  for (const p of PLATFORMS) {
    assert.ok(VERIFICATION_SUPPORT[p], `${p} missing from the matrix`);
    assert.ok(VERIFICATION_SUPPORT[p].note.length > 0, `${p} has no note`);
  }
});

test("Creator Plan: one five-platform ceiling for every creator, not unlimited", () => {
  assert.equal(MAX_CONNECTIONS, 5);
  assert.equal(MAX_CONNECTIONS, PLATFORMS.length);
  assert.equal(Number.isFinite(MAX_CONNECTIONS), true);
});

test("the connection ceiling is inclusive at the boundary", () => {
  assert.equal(canAddConnection(0), true);
  assert.equal(canAddConnection(4), true, "the fifth connection is allowed");
  assert.equal(canAddConnection(5), false, "a sixth connection is refused");
  assert.equal(canAddConnection(6), false);
});

test("integration status with nothing switched on: YouTube available, Instagram in development, the rest manual, X planned", () => {
  assert.deepEqual(INTEGRATION_STATUS, {
    youtube: "available",
    instagram: "in_development",
    twitch: "manual",
    kick: "manual",
    tiktok: "manual",
    x: "planned",
  });
  for (const p of PLATFORMS) assert.ok(INTEGRATION_PLATFORMS.includes(p), `${p} has no status`);
});

test("only YouTube is presented as operational", () => {
  const available = INTEGRATION_PLATFORMS.filter((p) => INTEGRATION_STATUS[p] === "available");
  assert.deepEqual(available, ["youtube"]);
});

test("verification availability depends on the platform, never on a plan", () => {
  assert.equal(verificationAvailability("youtube"), "available");
  // Instagram could support it, but its integration is not operational.
  assert.equal(verificationAvailability("instagram"), "in-development");
  // No API exists: no plan, and no upgrade, could deliver it.
  assert.equal(verificationAvailability("twitch"), "unsupported");
  assert.equal(verificationAvailability("kick"), "unsupported");
});

test("NEXT_PUBLIC_LIVE_CONNECTIONS switches on only known connectable platforms", () => {
  assert.deepEqual([...liveConnections(" Twitch, kick ,x,youtube,bogus,")].sort(), ["kick", "twitch"]);
  assert.equal(liveConnections(undefined).size, 0);
  const status = integrationStatusFor(liveConnections("instagram,twitch,kick,tiktok"));
  assert.deepEqual(status, {
    youtube: "available",
    instagram: "available",
    twitch: "available",
    kick: "available",
    tiktok: "available",
    x: "planned",
  });
});
