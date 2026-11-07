import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The Permissions-Policy header decides whether the browser lets a page use
 * the camera or microphone at all. A blanket camera=() silently broke the
 * identity capture flow, and microphone=() broke G's voice input. Guard both.
 */
const config = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");

test("camera is allowed only on the identity-capture pages, same origin only", () => {
  assert.match(config, /camera=\$\{camera\}/);
  assert.match(config, /PERMISSIONS_POLICY\("\(\)"\)/, "default is camera=()");
  const paths = /CAMERA_PATHS = \[([^\]]+)\]/.exec(config)?.[1] ?? "";
  for (const p of ['"/apply"', '"/verification"']) assert.ok(paths.includes(p), `${p} may use the camera`);
  for (const p of ['"/dashboard"', '"/:path*"', '"/"']) assert.ok(!paths.includes(p), `${p} must not get the camera`);
  assert.doesNotMatch(config, /camera=\*/);
});

test("microphone is same-origin only (G voice), never a wildcard", () => {
  assert.match(config, /microphone=\(self\)/);
  assert.doesNotMatch(config, /microphone=\*/);
  assert.match(config, /geolocation=\(\), payment=\(\), usb=\(\)/);
});
