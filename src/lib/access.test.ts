import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canUseCreatorFeatures } from "./access.ts";

/**
 * Unified Creator Plan: the creator-only boundary. The pure check is tested
 * directly; the server actions and the page import "server-only" and cannot
 * run here, so — like rate-limit-coverage.test.ts — their use of the check is
 * asserted from source, and fails the moment one loses it.
 */

test("creators and admins may use creator features; companies may not", () => {
  assert.equal(canUseCreatorFeatures("creator"), true);
  assert.equal(canUseCreatorFeatures("admin"), true);
  assert.equal(canUseCreatorFeatures("company"), false);
  assert.equal(canUseCreatorFeatures(null), false);
  assert.equal(canUseCreatorFeatures(undefined), false);
});

const SRC = new URL("../", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, SRC), "utf8");

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start !== -1, `${name} not found`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const MEDIA_KIT_ACTIONS = [
  "saveMediaKit",
  "disconnectAnalytics",
  "syncVerifiedGeo",
  "syncYoutubeStats",
  "syncInstagramStats",
  "detectNiche",
  "saveCreatorProfile",
];

test("every exported Media Kit server action is listed here", () => {
  const source = read("lib/media-kit/actions.ts");
  const exported = [...source.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(exported, [...MEDIA_KIT_ACTIONS].sort());
});

for (const action of MEDIA_KIT_ACTIONS) {
  test(`${action} refuses non-creators before doing anything`, () => {
    const body = functionBody(read("lib/media-kit/actions.ts"), action);
    const auth = body.indexOf("await requireProfile()");
    const check = body.indexOf("if (!canUseCreatorFeatures(profile.role)) return");
    assert.ok(auth !== -1 && check !== -1, `${action} has no creator-role check`);
    // The check comes straight after the session is read, before any other
    // statement — nothing (a rate limit, a database read) runs for a company.
    const between = body.slice(auth, check).split("\n").filter((l) => l.trim() && !l.trim().startsWith("//"));
    assert.equal(between.length, 1, `${action} does work before its role check`);
  });
}

test("the Media Kit page requires creator features, not just a session", () => {
  const page = read("app/(app)/media-kit/page.tsx");
  assert.match(page, /await requireCreatorFeatures\(\)/);
  assert.doesNotMatch(page, /await requireProfile\(\)/);
});

test("the Support & Help page requires creator features, not just a session", () => {
  const page = read("app/(app)/support/page.tsx");
  assert.match(page, /await requireCreatorFeatures\(\)/);
  assert.doesNotMatch(page, /await requireProfile\(\)/);
});

test("requireCreatorFeatures redirects non-creators", () => {
  const body = functionBody(read("lib/auth.ts"), "requireCreatorFeatures");
  assert.match(body, /if \(!canUseCreatorFeatures\(profile\.role\)\) redirect\("\/dashboard"\)/);
});

test("both OAuth routes check the role", () => {
  for (const file of ["app/api/oauth/[platform]/start/route.ts", "app/api/oauth/[platform]/callback/route.ts"]) {
    assert.match(read(file), /canUseCreatorFeatures\(profile\.role\)/, `${file} has no role check`);
  }
});

test("no access decision reads the stored subscription plan any more", () => {
  for (const file of [
    "lib/media-kit/actions.ts",
    "lib/media-kit/platforms.ts",
    "app/api/oauth/[platform]/start/route.ts",
    "app/api/oauth/[platform]/callback/route.ts",
    "app/(app)/media-kit/page.tsx",
    "components/views/MediaKitView.tsx",
    "components/views/DashboardView.tsx",
    "components/settings/SocialConnections.tsx",
    "components/media-kit/VerificationPanel.tsx",
  ]) {
    assert.doesNotMatch(read(file), /subscription_plan/, `${file} still reads subscription_plan`);
  }
});

test("an expired plan is no longer rewritten to Starter on sign-in", () => {
  const auth = read("lib/auth.ts");
  assert.doesNotMatch(auth, /subscription_plan: "Starter"/);
  assert.doesNotMatch(auth, /createAdminClient/);
});
