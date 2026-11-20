import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { publicProfileFromDetails } from "./public-profile.ts";

test("only the main handle and the categories become public", () => {
  const r = publicProfileFromDetails({ legal_name: "Layla Hassan", date_of_birth: "1998-01-01", phone: "+201012345678", main_platform: "youtube", handle: "layla", categories: "gaming,tech" });
  assert.deepEqual(r, { socialLinks: { youtube: "@layla" }, categories: ["gaming", "tech"] });
  assert.doesNotMatch(JSON.stringify(r), /Layla Hassan|1998|2010/);
  // Kick has no social-links slot: the handle stays private rather than landing in the wrong field.
  assert.equal(publicProfileFromDetails({ main_platform: "kick", handle: "@k" }).socialLinks, null);
  assert.deepEqual(publicProfileFromDetails({}), { socialLinks: null, categories: [] });
});

test("the carry-over copies the public photo only, never an identity image", () => {
  const src = readFileSync(new URL("./carry-over.ts", import.meta.url), "utf8");
  assert.match(src, /\.eq\("doc_type", "profile_photo"\)/);
  assert.doesNotMatch(src, /"selfie"|"id_front"|"id_back"/);
  assert.match(src, /storeUpload\("avatar", userId/);
  assert.match(src, /\.eq\("profile_id", userId\)/);
});
