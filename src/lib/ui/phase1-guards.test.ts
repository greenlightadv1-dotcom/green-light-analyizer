/**
 * Phase 1 guards, checked against the source so a regression fails CI:
 *  - the five dictionaries stay structurally identical, with no empty strings
 *    and the same {placeholders} as English;
 *  - every sensitive action asks first in the UI and reports a real result
 *    from the server, which keeps its own role check.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import en from "../i18n/dictionaries/en.ts";
import ar from "../i18n/dictionaries/ar.ts";
import fr from "../i18n/dictionaries/fr.ts";
import es from "../i18n/dictionaries/es.ts";
import de from "../i18n/dictionaries/de.ts";

const SRC = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

type Tree = { [k: string]: string | Tree };
function flatten(node: Tree, prefix = "", out = new Map<string, string>()) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else flatten(v, key, out);
  }
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("all five dictionaries have exactly the same keys", () => {
  const base = flatten(en as unknown as Tree);
  assert.ok(base.size > 800);
  for (const [name, dict] of Object.entries({ ar, fr, es, de })) {
    const other = flatten(dict as unknown as Tree);
    const missing = [...base.keys()].filter((k) => !other.has(k));
    const extra = [...other.keys()].filter((k) => !base.has(k));
    assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, name);
  }
});

test("no empty strings, and every translation keeps English's placeholders", () => {
  const base = flatten(en as unknown as Tree);
  for (const [name, dict] of Object.entries({ en, ar, fr, es, de })) {
    const flat = flatten(dict as unknown as Tree);
    for (const [k, v] of flat) {
      // A key may be empty only where English is deliberately empty too.
      if ((base.get(k) ?? "").trim()) assert.ok(v.trim().length > 0, `${name}: ${k} is empty`);
      assert.equal(placeholders(v), placeholders(base.get(k) ?? ""), `${name}: ${k} placeholders differ`);
    }
  }
});

test("the Phase 1 namespaces exist in every language", () => {
  for (const dict of [en, ar, fr, es, de]) {
    const d = dict as unknown as Tree;
    for (const ns of ["ui", "dealStatus", "companyDashboard", "admin"]) assert.ok(d[ns], ns);
  }
});

/** The text of an exported function, up to the next top-level export. */
function body(file: string, fn: string): string {
  const src = read(file);
  const start = src.indexOf(`export async function ${fn}(`);
  assert.ok(start >= 0, `${fn} not found in ${file}`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

const SENSITIVE: [string, string, RegExp][] = [
  ["app/(app)/admin/violations/actions.ts", "banProfile", /requireRole\("admin"\)/],
  ["app/(app)/admin/violations/actions.ts", "dismissViolation", /requireRole\("admin"\)/],
  ["app/(app)/admin/users/actions.ts", "setBan", /requireRole\("admin"\)/],
  ["app/(app)/admin/requests/actions.ts", "rejectRequest", /requireRole\("admin"\)/],
  ["app/(app)/admin/requests/actions.ts", "unlinkRepresentative", /requireRole\("admin"\)/],
  ["app/(app)/inbox/[chatId]/actions.ts", "updateDealStatus", /requireProfile\(\)/],
];

test("sensitive actions keep their server-side role check and return a real result", () => {
  for (const [file, fn, guard] of SENSITIVE) {
    const src = body(file, fn);
    assert.match(src, guard, `${fn}: role check`);
    assert.match(src, /Promise<ActionResult>/, `${fn}: returns ActionResult`);
    // Every write is read back, so "matched nothing" is not reported as success.
    assert.match(src, /\.select\(/, `${fn}: write is read back`);
    // A database error is surfaced as a failure, never swallowed.
    assert.match(src, /if \((\w+)?[eE]rror\) \{[\s\S]*?return (fail|failWith)\(/, `${fn}: error returns a failure`);
    // Success is the last thing it returns.
    assert.match(src, /return OK;\s*\}\s*(\/\*\*[\s\S]*)?$/, `${fn}: OK only at the end`);
  }
});

test("the violations ban marks the entry reviewed only after the ban succeeded", () => {
  const src = body("app/(app)/admin/violations/actions.ts", "banProfile");
  const banAt = src.indexOf('.from("profiles")');
  const reviewAt = src.indexOf('.from("violation_logs")');
  const failAt = src.indexOf('fail("admin.violations.errors.banFailed")');
  assert.ok(banAt >= 0 && reviewAt > failAt && failAt > banAt);
});

test("pages never wire a sensitive action straight to a form without confirmation", () => {
  const pages = [
    "app/(app)/admin/violations/page.tsx",
    "app/(app)/admin/violations/ViolationsView.tsx",
    "app/(app)/admin/users/page.tsx",
    "app/(app)/admin/requests/page.tsx",
    "app/(app)/inbox/[chatId]/StatusControl.tsx",
  ];
  for (const p of pages) {
    const src = read(p);
    assert.doesNotMatch(
      src,
      /<form[^>]*action=\{(banProfile|dismissViolation|setBan|rejectRequest|unlinkRepresentative|updateDealStatus|banAction|dismissAction)\}/,
      `${p} submits a sensitive action without asking`,
    );
  }
  assert.match(read("app/(app)/admin/violations/ViolationsView.tsx"), /<ConfirmActionForm/);
  assert.match(read("app/(app)/admin/users/page.tsx"), /<ConfirmActionForm/);
  assert.match(read("app/(app)/admin/requests/page.tsx"), /<ConfirmActionForm/);
  assert.match(read("app/(app)/inbox/[chatId]/StatusControl.tsx"), /<ConfirmDialog/);
});

test("ConfirmActionForm shows success only on ok, and errors inside the dialog", () => {
  const src = read("components/ui/ConfirmActionForm.tsx");
  assert.match(src, /if \(result\.ok\) \{\s*setOpen\(false\);\s*setDone\(true\);/);
  assert.match(src, /setError\(t\(result\.errorKey\)\)/);
  assert.match(src, /e\.preventDefault\(\)/);
  const dialog = read("components/ui/ConfirmDialog.tsx");
  // Cancel is the default focus, and a pending request cannot be dismissed.
  assert.match(dialog, /autoFocus\s+onClick=\{onCancel\}/);
  assert.match(dialog, /dismissible=\{!pending\}/);
});

test("the G launcher clears content on phones and respects the safe area", () => {
  const g = read("components/g/GAssistant.tsx");
  assert.match(g, /bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(g, /hidden sm:inline">\{t\("g\.askG"\)\}/);
  for (const p of ["app/(app)/layout.tsx", "app/preview/layout.tsx"]) {
    assert.match(read(p), /min-w-0 flex-1 pb-24/, p);
  }
});

test("every dictionary key a server action returns as an error exists in English", () => {
  const files = [
    "lib/media-kit/actions.ts",
    "app/(app)/settings/actions.ts",
    "app/(app)/inbox/[chatId]/actions.ts",
    "app/(app)/analyzer/actions.ts",
    "app/(app)/admin/violations/actions.ts",
    "app/(app)/admin/users/actions.ts",
    "app/(app)/admin/requests/actions.ts",
  ];
  const base = flatten(en as unknown as Tree);
  let seen = 0;
  for (const f of files) {
    for (const m of read(f).matchAll(/"((?:actionErrors|ui|admin|dealStatus)\.[a-zA-Z.]+)"/g)) {
      seen++;
      assert.ok(base.has(m[1]), `${f}: ${m[1]} is not in the English dictionary`);
    }
  }
  assert.ok(seen >= 30, `only ${seen} keys found`);
});

test("no body text uses the low-contrast fg/30–55 opacities (WCAG AA)", () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
    });
  const hits = walk(SRC).filter((f) => /(^|[^:a-z-])text-fg\/(30|35|40|45|50|55)\b/.test(readFileSync(f, "utf8")));
  assert.deepEqual(hits, [], "use text-fg-muted (64%) instead");
});
