import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_VISIBILITY, p3ErrorKey, parsePortfolioItem, parseShortlistName, parseVisibility, reorder } from "./rules.ts";

test("portfolio items: https only, consent needs a brand, dates checked", () => {
  const ok = parsePortfolioItem({ title: "Launch review", url: "https://example.com/v", brand_name: "Nimbus", brand_name_public: "on", is_public: "on" });
  assert.ok(ok.ok && ok.value.brand_name_public && ok.value.is_public && ok.value.url === "https://example.com/v");
  assert.deepEqual(parsePortfolioItem({ title: "x" }), { ok: false, errorKey: "portfolio.errors.title" });
  assert.deepEqual(parsePortfolioItem({ title: "Valid", url: "http://example.com" }), { ok: false, errorKey: "portfolio.errors.url" });
  assert.deepEqual(parsePortfolioItem({ title: "Valid", url: "javascript:alert(1)" }), { ok: false, errorKey: "portfolio.errors.url" });
  assert.deepEqual(parsePortfolioItem({ title: "Valid", brand_name_public: "on" }), { ok: false, errorKey: "portfolio.errors.consent" });
  assert.deepEqual(parsePortfolioItem({ title: "Valid", published_on: "2026-13-40" }), { ok: false, errorKey: "portfolio.errors.date" });
  const priv = parsePortfolioItem({ title: "Private", platform: "myspace" });
  assert.ok(priv.ok && !priv.value.is_public && priv.value.platform === null && !priv.value.brand_name_public);
});

test("visibility defaults keep the old public page and hide the portfolio", () => {
  assert.equal(DEFAULT_VISIBILITY.show_portfolio, false);
  assert.ok(DEFAULT_VISIBILITY.show_bio && DEFAULT_VISIBILITY.show_platforms);
  const v = parseVisibility((k) => k === "show_bio");
  assert.equal(v.show_bio, true);
  assert.equal(v.show_rate, false);
});

test("shortlist names and refusal mapping", () => {
  assert.equal(parseShortlistName("  Tech   reviewers "), "Tech reviewers");
  assert.equal(parseShortlistName("   "), null);
  assert.equal(parseShortlistName("x".repeat(61)), null);
  assert.equal(p3ErrorKey("shortlist:too_many"), "shortlists.errors.too_many");
  assert.equal(p3ErrorKey('duplicate key value violates unique constraint "shortlists_unique_name"'), "shortlists.errors.duplicate");
  assert.equal(p3ErrorKey("something else"), "ui.errors.generic");
});

test("reorder swaps neighbours and ignores out-of-range moves", () => {
  assert.deepEqual(reorder(["a", "b", "c"], "b", "up"), ["b", "a", "c"]);
  assert.deepEqual(reorder(["a", "b", "c"], "c", "down"), ["a", "b", "c"]);
  assert.deepEqual(reorder(["a", "b"], "z", "up"), ["a", "b"]);
});

test("server actions take the owner from the session and never from the form", () => {
  for (const [file, role] of [["shortlists", "company"], ["portfolio", "creator"]] as const) {
    const src = readFileSync(new URL(`../../app/(app)/${file}/actions.ts`, import.meta.url), "utf8");
    const fns = src.split("\nexport async function ").slice(1);
    assert.ok(fns.length >= 3, file);
    for (const fn of fns) {
      assert.match(fn, new RegExp(`requireRole\\("${role}"\\)`), `${file}: ${fn.slice(0, 40)}`);
    }
    assert.doesNotMatch(src, /fd\.get\("(company_id|creator_id_owner|profile_id)"\)/, `${file}: owner from form`);
  }
  const sl = readFileSync(new URL("../../app/(app)/shortlists/actions.ts", import.meta.url), "utf8");
  assert.match(sl, /\.eq\("company_id", profile\.id\)/);
  const pf = readFileSync(new URL("../../app/(app)/portfolio/actions.ts", import.meta.url), "utf8");
  assert.match(pf, /\.eq\("creator_id", profile\.id\)/);
  assert.match(pf, /profile_id: profile\.id/);
});
