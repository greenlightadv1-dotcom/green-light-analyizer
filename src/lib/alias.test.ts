import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ACCEPTED_INBOUND_DOMAINS,
  INBOUND_DOMAIN,
  generateInboundAlias,
  toHandle,
} from "./alias.ts";
import { findInboundAlias } from "./email/parse.ts";

test("issues {handle}.{4}@ on the configured inbound domain", () => {
  const alias = generateInboundAlias("Ayman Khaled");
  assert.match(alias, /^aymankhaled\.[a-z2-9]{4}@analyze\.greenlightadvs\.com$/);
  assert.equal(INBOUND_DOMAIN, "analyze.greenlightadvs.com");
});

test("the suffix is four characters and actually varies", () => {
  const suffixes = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const local = generateInboundAlias("ayman").split("@")[0];
    const suffix = local.split(".")[1];
    assert.equal(suffix.length, 4, "suffix should be 4 characters");
    assert.match(suffix, /^[abcdefghijkmnpqrstuvwxyz23456789]{4}$/);
    suffixes.add(suffix);
  }
  // 200 draws from ~1.05M: a generator stuck on one value would collapse here.
  assert.ok(suffixes.size > 150, `expected varied suffixes, got ${suffixes.size}`);
});

test("look-alike glyphs stay out of the alphabet", () => {
  for (let i = 0; i < 200; i++) {
    assert.doesNotMatch(generateInboundAlias("ayman").split("@")[0], /[lo01]/);
  }
});

test("handles are normalised, and an unusable name still gets an alias", () => {
  assert.equal(toHandle("Ayman  Khaled!"), "aymankhaled");
  assert.equal(toHandle("أيمن"), "creator", "a name with no latin characters");
  assert.equal(toHandle(""), "creator");
  assert.equal(toHandle("a".repeat(40)).length, 24, "capped at 24");
});

test("a delivery to a retired domain is still recognised as ours", () => {
  const current = "ayman.k3f9@analyze.greenlightadvs.com";
  const retired = "ayman.k3f9x2@analyze.greenlight.com";

  assert.equal(findInboundAlias([current], ACCEPTED_INBOUND_DOMAINS), current);
  assert.equal(
    findInboundAlias([retired], ACCEPTED_INBOUND_DOMAINS),
    retired,
    "a forwarding rule still pointing at the old domain must keep working",
  );

  // The creator's own address rides along on a forward and must never win.
  assert.equal(
    findInboundAlias(["ayman@gmail.com", current], ACCEPTED_INBOUND_DOMAINS),
    current,
  );
});

test("a look-alike domain is not one of ours", () => {
  assert.equal(
    findInboundAlias(
      ["ayman.k3f9@analyze.greenlightadvs.com.attacker.net"],
      ACCEPTED_INBOUND_DOMAINS,
    ),
    null,
  );
  assert.equal(
    findInboundAlias(["ayman.k3f9@greenlightadvs.com"], ACCEPTED_INBOUND_DOMAINS),
    null,
    "the apex is not an inbound domain",
  );
});
