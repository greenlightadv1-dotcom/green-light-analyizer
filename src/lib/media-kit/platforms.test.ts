import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  PLATFORMS,
  VERIFICATION_SUPPORT,
  canAddConnection,
  canVerifyAudience,
  maxConnections,
  verificationAvailability,
} from "./platforms.ts";

/** §7.3 verification matrix and §8 tier limits. */

test("§7.3: only YouTube and Instagram can ever be verified", () => {
  assert.equal(VERIFICATION_SUPPORT.youtube.supported, true);
  assert.equal(VERIFICATION_SUPPORT.instagram.supported, true);
  assert.equal(VERIFICATION_SUPPORT.twitch.supported, false);
  assert.equal(VERIFICATION_SUPPORT.kick.supported, false);
});

test("every platform in the schema has a matrix entry", () => {
  for (const p of PLATFORMS) {
    assert.ok(VERIFICATION_SUPPORT[p], `${p} missing from the matrix`);
    assert.ok(VERIFICATION_SUPPORT[p].note.length > 0, `${p} has no note`);
  }
});

test("§8: Starter gets 2 connections, paid plans get all of them", () => {
  assert.equal(maxConnections("Starter"), 2);
  assert.equal(maxConnections("Pro"), PLATFORMS.length);
  assert.equal(maxConnections("Elite"), PLATFORMS.length);
});

test("§8: verified geography is Pro and Elite only", () => {
  assert.equal(canVerifyAudience("Starter"), false);
  assert.equal(canVerifyAudience("Pro"), true);
  assert.equal(canVerifyAudience("Elite"), true);
});

test("connection limit is inclusive at the boundary", () => {
  assert.equal(canAddConnection("Starter", 1), true);
  assert.equal(canAddConnection("Starter", 2), false);
  assert.equal(canAddConnection("Starter", 3), false);
});

test("upgrading is only offered where upgrading would actually help", () => {
  // The distinction that matters: a Starter creator looking at Twitch must not
  // be told to upgrade, because no plan can deliver Twitch audience geography.
  assert.equal(verificationAvailability("twitch", "Starter"), "unsupported");
  assert.equal(verificationAvailability("twitch", "Elite"), "unsupported");
  assert.equal(verificationAvailability("kick", "Pro"), "unsupported");

  assert.equal(verificationAvailability("youtube", "Starter"), "needs-upgrade");
  assert.equal(verificationAvailability("youtube", "Pro"), "available");
  assert.equal(verificationAvailability("instagram", "Elite"), "available");
});
