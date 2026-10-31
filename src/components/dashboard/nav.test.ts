import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { NAV, isActivePath, navItemsForRole } from "./nav.ts";

/** Mobile navigation: one link list, filtered by role, shared by Sidebar and drawer. */

const hrefs = (role: "creator" | "company" | "admin") => navItemsForRole(role).map((i) => i.href);

test("creator sees exactly the creator links, in order", () => {
  assert.deepEqual(hrefs("creator"), ["/dashboard", "/inbox", "/analyzer", "/media-kit", "/pricing", "/settings"]);
});

test("company sees exactly the company links, in order", () => {
  assert.deepEqual(hrefs("company"), ["/dashboard", "/inbox", "/discover", "/pricing", "/settings"]);
});

test("admin sees every link, including the admin pages", () => {
  assert.deepEqual(hrefs("admin"), NAV.map((i) => i.href));
  for (const href of ["/admin/users", "/admin/promo-codes", "/admin/violations", "/admin/system"]) {
    assert.ok(hrefs("admin").includes(href), href);
  }
});

test("unauthorized links never appear", () => {
  for (const role of ["creator", "company"] as const) {
    assert.ok(!hrefs(role).some((h) => h.startsWith("/admin")), `${role} must not see admin pages`);
  }
  assert.ok(!hrefs("creator").includes("/discover"), "Discover is company/admin only");
  for (const href of ["/analyzer", "/media-kit"]) assert.ok(!hrefs("company").includes(href), href);
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
