import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { badgeText, mutedFromEnabled, notificationHref, parseMuted } from "./rules.ts";

const C = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("a notification opens its collaboration, else the right list", () => {
  assert.equal(notificationHref({ collaboration_id: C, brief_id: B }, "creator"), `/collaborations/${C}`);
  assert.equal(notificationHref({ collaboration_id: null, brief_id: B }, "company"), `/briefs/${B}`);
  assert.equal(notificationHref({ collaboration_id: null, brief_id: B }, "creator"), "/opportunities");
  assert.equal(notificationHref({ collaboration_id: null, brief_id: null }, "admin"), "/notifications");
});

test("targets are built from ids only, never from arbitrary strings", () => {
  assert.equal(notificationHref({ collaboration_id: "//evil.example", brief_id: null }, "creator"), "/opportunities");
  assert.equal(notificationHref({ collaboration_id: null, brief_id: "../../x" }, "company"), "/notifications");
});

test("preferences accept only known categories", () => {
  assert.deepEqual(parseMuted(["terms", "marketing", "terms", "status"]), ["terms", "status"]);
  assert.deepEqual(mutedFromEnabled(["invitations", "deliverables"]), ["terms", "status"]);
  assert.deepEqual(mutedFromEnabled([]), ["invitations", "terms", "deliverables", "status"]);
});

test("badge text", () => {
  assert.equal(badgeText(0), "");
  assert.equal(badgeText(3), "3");
  assert.equal(badgeText(12), "9+");
  assert.equal(badgeText(Number.NaN), "");
});

test("server actions scope every write to the session's own id", () => {
  const src = readFileSync(new URL("../../app/(app)/notifications/actions.ts", import.meta.url), "utf8");
  assert.match(src, /requireRole\("creator", "company"\)/);
  const writes = src.match(/\.from\("notifications"\)[\s\S]*?;/g) ?? [];
  assert.ok(writes.length >= 2, "expected notification writes");
  for (const w of writes) assert.match(w, /\.eq\("recipient_id", profile\.id\)/, w);
  assert.match(src, /profile_id: profile\.id/);
  assert.doesNotMatch(src, /fd\.get\("(recipient_id|profile_id|href|next)"\)/, "no target or owner from the form");
});
