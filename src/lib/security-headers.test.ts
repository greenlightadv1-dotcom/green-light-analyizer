import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The Permissions-Policy header decides whether the browser lets a page use
 * the camera or microphone at all. A blanket camera=() silently broke the
 * identity capture flow, and microphone=() broke G's voice input. Guard both.
 * Neither may ever be opened to other origins.
 */
const config = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");

test("camera is same-origin only, on every page, never a wildcard", () => {
  // Site-wide on purpose: Next.js navigates client-side, so a per-page header
  // only applies to the page that was loaded first (see next.config.ts).
  assert.match(config, /camera=\(self\)/);
  assert.doesNotMatch(config, /camera=\(\)/);
  assert.doesNotMatch(config, /camera=\*/);
});

test("microphone is same-origin only (G voice), never a wildcard", () => {
  assert.match(config, /microphone=\(self\)/);
  assert.doesNotMatch(config, /microphone=\*/);
  assert.match(config, /geolocation=\(\), payment=\(\), usb=\(\)/);
});
