/**
 * UX-0 regression guard: user-facing text must not carry internal references
 * (spec sections such as "§7.4", migration numbers, source paths, env-var
 * names in end-user errors) or the vague "Something went wrong".
 *
 * It scans source text with comments stripped, so the many "§" references in
 * code comments, which are for developers, stay allowed. Admin-only system
 * status (`lib/config.ts`) may name env vars, because naming the variable to
 * set is that page's job; it may not cite spec sections or source paths.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    if (!/\.(ts|tsx)$/.test(name)) return [];
    if (/\.test\.ts$/.test(name) || p.includes(`${join("lib", "email", "intake-tests")}`)) return [];
    if (p.includes(join("oauth", "callback-tests"))) return [];
    return [p];
  });
}

/** Blank out comments, keeping line numbers. URLs ("https://") survive. */
function stripComments(source: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p: string) => p + " ".repeat(m.length - p.length));
}

type Hit = { file: string; line: number; text: string };

function scan(files: string[], pattern: RegExp, allow: (h: Hit) => boolean = () => false): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    stripComments(readFileSync(file, "utf8"))
      .split("\n")
      .forEach((text, i) => {
        if (!pattern.test(text)) return;
        const hit = { file: relative(SRC, file), line: i + 1, text: text.trim().slice(0, 140) };
        if (!allow(hit)) hits.push(hit);
      });
  }
  return hits;
}

const ALL = walk(SRC);
const DICTIONARIES = ["en", "ar", "fr", "es", "de"].map((l) =>
  join(SRC, "lib", "i18n", "dictionaries", `${l}.ts`),
);

const fmt = (hits: Hit[]) => hits.map((h) => `${h.file}:${h.line}: ${h.text}`).join("\n");

test("the scan actually covers the app and all five dictionaries", () => {
  assert.ok(ALL.length > 100, `only ${ALL.length} files scanned`);
  assert.equal(DICTIONARIES.length, 5);
});

test("no spec-section sign (§) in any non-comment source text", () => {
  // A legal citation in the privacy policy is a real statute reference.
  const hits = scan(ALL, /§/, (h) => /CCPA § \d/.test(h.text));
  assert.deepEqual(hits, [], `internal spec references are visible:\n${fmt(hits)}`);
});

test("no 'Something went wrong' anywhere in the UI text", () => {
  const hits = scan(ALL, /something went wrong/i);
  assert.deepEqual(hits, [], fmt(hits));
});

test("dictionaries carry no internal references", () => {
  const hits = scan(DICTIONARIES, /§|migration\s*0\d|src\/|\b[A-Z][A-Z0-9]*_(API_KEY|SECRET)\b/i);
  assert.deepEqual(hits, [], fmt(hits));
});

test("no migration numbers in string literals", () => {
  const hits = scan(ALL, /["'`][^"'`]*\bmigration\s+0\d{3}/i);
  assert.deepEqual(hits, [], fmt(hits));
});

test("no source paths in string literals outside code that names its own module", () => {
  const hits = scan(ALL, /["'`][^"'`]*\bsrc\/(lib|app|components)\//);
  assert.deepEqual(hits, [], fmt(hits));
});

test("end-user action errors never name an env var", () => {
  // Server actions return `{ error: "..." }` straight to the form that called them.
  const actions = ALL.filter((f) => /actions\.ts$/.test(f));
  assert.ok(actions.length >= 5);
  const hits = scan(actions, /error:[^\n]*\b[A-Z][A-Z0-9]*_(API_KEY|SECRET|TOKEN)\b/);
  assert.deepEqual(hits, [], fmt(hits));
  const multiline = actions.flatMap((file) => {
    const src = stripComments(readFileSync(file, "utf8"));
    return [...src.matchAll(/error:\s*\n\s*["'`]([^"'`]*)["'`]/g)]
      .filter((m) => /\b[A-Z][A-Z0-9]*_(API_KEY|SECRET|TOKEN)\b/.test(m[1]))
      .map((m) => `${relative(SRC, file)}: ${m[1]}`);
  });
  assert.deepEqual(multiline, []);
});

test("EmptyState has no spec label and no caller passes one", () => {
  const src = readFileSync(join(SRC, "components", "dashboard", "EmptyState.tsx"), "utf8");
  assert.doesNotMatch(stripComments(src), /\bspec\b/);
  const callers = scan(ALL, /<EmptyState[\s\S]*?spec=|^\s*spec="/);
  assert.deepEqual(callers, [], fmt(callers));
});

test("the error page and capped badge tooltip read as plain language in every language", () => {
  for (const file of DICTIONARIES) {
    const text = readFileSync(file, "utf8");
    const tooltip = /cappedTooltip:\s*\n?\s*"([^"]+)"/.exec(text)?.[1] ?? "";
    assert.ok(tooltip.length > 40, `${relative(SRC, file)}: cappedTooltip missing`);
    assert.doesNotMatch(tooltip, /§|7\.4/);
    const body = /errorBody:\s*\n?\s*"([^"]+)"/.exec(text)?.[1] ?? "";
    assert.ok(body.length > 40, `${relative(SRC, file)}: errorBody missing`);
  }
});
