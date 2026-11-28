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

test("a message notification opens its deal room", () => {
  assert.equal(notificationHref({ collaboration_id: null, brief_id: null, chat_id: C }, "company"), `/inbox/${C}`);
  assert.equal(notificationHref({ collaboration_id: null, brief_id: null, chat_id: "../x" }, "creator"), "/opportunities");
});

test("targets are built from ids only, never from arbitrary strings", () => {
  assert.equal(notificationHref({ collaboration_id: "//evil.example", brief_id: null }, "creator"), "/opportunities");
  assert.equal(notificationHref({ collaboration_id: null, brief_id: "../../x" }, "company"), "/notifications");
});

test("preferences accept only known categories", () => {
  assert.deepEqual(parseMuted(["terms", "marketing", "terms", "status"]), ["terms", "status"]);
  assert.deepEqual(mutedFromEnabled(["invitations", "deliverables"]), ["terms", "status", "messages"]);
  assert.deepEqual(mutedFromEnabled([]), ["invitations", "terms", "deliverables", "status", "messages"]);
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

test("nav badges: each category lands on its own link, per role", async () => {
  const { navBadgesFromUnread } = await import("./rules.ts");
  const rows = [{ category: "messages" }, { category: "messages" }, { category: "invitations" }, { category: "terms" }, { category: "deliverables" }, { category: "unknown" }];
  assert.deepEqual(navBadgesFromUnread(rows, "creator"), { "/inbox": 2, "/opportunities": 1, "/collaborations": 2 });
  assert.deepEqual(navBadgesFromUnread(rows, "company"), { "/inbox": 2, "/briefs": 1, "/collaborations": 2 });
  assert.deepEqual(navBadgesFromUnread([], "creator"), {});
});

test("unread chat ids: only message notifications with a valid room id", async () => {
  const { unreadChatIds } = await import("./rules.ts");
  const id = "11111111-1111-4111-8111-111111111111";
  const ids = unreadChatIds([
    { kind: "message_received", chat_id: id },
    { kind: "message_received", chat_id: "not-a-uuid" },
    { kind: "terms_proposed", chat_id: id.replace("1111-4", "2222-4") },
    { kind: "message_received", chat_id: null },
  ]);
  assert.deepEqual([...ids], [id]);
});
