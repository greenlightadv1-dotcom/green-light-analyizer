import { strict as assert } from "node:assert";
import { test } from "node:test";

import { escapeLikePattern } from "./like.ts";

test("leaves an ordinary address untouched", () => {
  assert.equal(escapeLikePattern("growth@lumenapp.example"), "growth@lumenapp.example");
});

test("escapes the underscore wildcard, which is common in real addresses", () => {
  // Unescaped, this pattern also matches johnXdoe@company.com.
  assert.equal(escapeLikePattern("john_doe@company.com"), "john\\_doe@company.com");
});

test("escapes the percent wildcard", () => {
  assert.equal(escapeLikePattern("%@evil.example"), "\\%@evil.example");
});

test("escapes a literal backslash so it cannot escape the next character", () => {
  assert.equal(escapeLikePattern("a\\_b"), "a\\\\\\_b");
});

test("escapes every occurrence, not just the first", () => {
  assert.equal(escapeLikePattern("a_b_c%d"), "a\\_b\\_c\\%d");
});
