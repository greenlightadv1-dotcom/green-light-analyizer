import { strict as assert } from "node:assert";
import { test } from "node:test";

/**
 * The config report must never reveal a secret's value.
 *
 * readConfigReport() imports "server-only", which throws outside a Next server
 * context, so this asserts the property on the module source instead: that no
 * env var is ever read into a returned string. Crude, but it catches the change
 * that matters — someone adding `value: process.env.X` or a "starts with…"
 * hint to make debugging easier, which would leak part of a live key to anyone
 * who can load the page.
 */
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./config.ts", import.meta.url),
  "utf8",
);

test("env vars are only ever coerced to a boolean", () => {
  // Every process.env read must be wrapped in Boolean(...).
  const reads = source.match(/process\.env\.[A-Z_]+/g) ?? [];
  assert.ok(reads.length > 0, "expected some env reads");

  for (const read of reads) {
    const index = source.indexOf(read);
    const before = source.slice(Math.max(0, index - 10), index);
    assert.match(
      before,
      /Boolean\($/,
      `${read} is read without Boolean() — it could leak a value`,
    );
  }
});

test("the report shape carries no value field", () => {
  assert.ok(
    !/\bvalue\s*:/.test(source),
    "ConfigItem must not gain a value field",
  );
  assert.ok(
    !/slice\(0,\s*\d+\)/.test(source),
    "no truncated-secret hints — a prefix is still part of the key",
  );
});
