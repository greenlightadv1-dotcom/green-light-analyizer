import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { closeAccountErrorKey, closedAccountEmail, confirmWordMatches } from "./close-rules.ts";

test("database refusals map to their own messages", () => {
  assert.equal(closeAccountErrorKey("account:open_deals"), "settings.deleteAccount.errorOpenDeals");
  assert.equal(closeAccountErrorKey("account:admin"), "settings.deleteAccount.errorAdmin");
  assert.equal(closeAccountErrorKey("account:closed"), "settings.deleteAccount.errorClosed");
  assert.equal(closeAccountErrorKey("connection reset"), "ui.errors.generic");
  assert.equal(closeAccountErrorKey(null), "ui.errors.generic");
});

test("the confirmation word accepts DELETE or حذف only", () => {
  for (const ok of ["DELETE", "delete", " Delete ", "حذف"]) assert.ok(confirmWordMatches(ok), ok);
  for (const no of ["", "yes", "DELET", "احذف", null, undefined]) assert.ok(!confirmWordMatches(no), String(no));
});

test("a closed account's address is unique and undeliverable", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(closedAccountEmail(id), `deleted+${id}@invalid.greenlightadvs.com`);
});

test("closeMyAccount: session actor, password, confirmation word and rate limit before anything is closed", () => {
  const src = readFileSync(new URL("../../app/(app)/settings/actions.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function closeMyAccount"));
  const order = ["requireProfile()", 'profile.role === "admin"', "confirmWordMatches", 'consumeRateLimit("account_close"', "passwordMatches", "closeAccount(profile.id)"];
  let at = -1;
  for (const marker of order) {
    const next = body.indexOf(marker);
    assert.ok(next > at, `${marker} out of order`);
    at = next;
  }
  assert.ok(!/formData\.get\("(profile_id|id|user_id)"\)/.test(body), "the actor must never come from the form");
});
