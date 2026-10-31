import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { NAV, isActivePath, navItemsForRole } from "./nav.ts";

/** Mobile navigation: one link list, filtered by role, shared by Sidebar and drawer. */

const hrefs = (role: "creator" | "company" | "admin") => navItemsForRole(role).map((i) => i.href);

test("creator sees exactly the creator links, in order", () => {
  assert.deepEqual(hrefs("creator"), ["/dashboard", "/onboarding", "/inbox", "/analyzer", "/media-kit", "/pricing", "/support", "/settings"]);
});

test("company sees exactly the company links, in order", () => {
  assert.deepEqual(hrefs("company"), ["/dashboard", "/onboarding", "/inbox", "/discover", "/pricing", "/settings"]);
});

test("admin sees every link but onboarding, including the admin pages", () => {
  assert.deepEqual(hrefs("admin"), NAV.map((i) => i.href).filter((h) => h !== "/onboarding"));
  for (const href of ["/admin/users", "/admin/requests", "/admin/promo-codes", "/admin/violations", "/admin/system"]) {
    assert.ok(hrefs("admin").includes(href), href);
  }
});

test("unauthorized links never appear", () => {
  for (const role of ["creator", "company"] as const) {
    assert.ok(!hrefs(role).some((h) => h.startsWith("/admin")), `${role} must not see admin pages`);
  }
  assert.ok(!hrefs("creator").includes("/discover"), "Discover is company/admin only");
  for (const href of ["/analyzer", "/media-kit", "/support"]) assert.ok(!hrefs("company").includes(href), href);
});

test("every link has a translation key that exists in every dictionary", () => {
  for (const locale of ["en", "ar", "fr", "es", "de"]) {
    const dict = readFileSync(new URL(`../../lib/i18n/dictionaries/${locale}.ts`, import.meta.url), "utf8");
    for (const item of NAV) {
      const key = item.labelKey.split(".")[1];
      assert.match(dict, new RegExp(`\\n    ${key}: `), `${locale} lacks ${item.labelKey}`);
    }
    for (const key of ["openMenu", "closeMenu", "navigation"]) {
      assert.match(dict, new RegExp(`\\n    ${key}: `), `${locale} lacks topbar.${key}`);
    }
  }
});

test("active state matches the page and the pages beneath it, not prefixes", () => {
  assert.ok(isActivePath("/inbox", "/inbox"));
  assert.ok(isActivePath("/inbox/abc", "/inbox"));
  assert.ok(isActivePath("/preview/inbox/abc", "/preview/inbox"));
  assert.equal(isActivePath("/inboxes", "/inbox"), false);
  assert.equal(isActivePath("/admin/users", "/admin/system"), false);
});

test("Sidebar and the mobile drawer both render the shared list, and nothing else defines one", () => {
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  for (const file of ["./Sidebar.tsx", "./MobileNav.tsx"]) {
    const source = read(file);
    assert.match(source, /<NavLinks\b/, `${file} must render NavLinks`);
    assert.ok(!/roles:\s*\[/.test(source), `${file} must not define its own role list`);
  }
  assert.match(read("./NavLinks.tsx"), /navItemsForRole\(role\)/);
});

test("each layout gives the desktop Sidebar and the mobile menu the same role and link prefix", () => {
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  // TopBar renders MobileNav from the same profile.role and basePath it is given.
  assert.match(read("./TopBar.tsx"), /<MobileNav role=\{profile\.role\} basePath=\{basePath\} \/>/);
  const app = read("../../app/(app)/layout.tsx");
  assert.match(app, /<Sidebar role=\{profile\.role\} \/>/);
  assert.match(app, /<TopBar profile=\{profile\} \/>/);
  const preview = read("../../app/preview/layout.tsx");
  assert.match(preview, /<Sidebar role=\{mockProfile\.role\} basePath="\/preview" \/>/);
  assert.match(preview, /<TopBar profile=\{mockProfile\} basePath="\/preview" demo \/>/);
});

test("for every role, the drawer and the Sidebar list the same authorized links", () => {
  // Both render <NavLinks role={role}>, whose only source is navItemsForRole.
  for (const role of ["creator", "company", "admin"] as const) {
    const items = navItemsForRole(role);
    assert.ok(items.length > 0);
    for (const item of items) assert.ok(item.roles.includes(role), `${item.href} leaked to ${role}`);
    assert.deepEqual(items, NAV.filter((i) => i.roles.includes(role)));
  }
});
