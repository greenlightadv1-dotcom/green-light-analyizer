import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import en from "./i18n/dictionaries/en.ts";
import ar from "./i18n/dictionaries/ar.ts";
import fr from "./i18n/dictionaries/fr.ts";
import es from "./i18n/dictionaries/es.ts";
import de from "./i18n/dictionaries/de.ts";
import {
  COMMISSION_EFFECTIVE_DATE,
  CREATOR_COMMISSION,
  CREATOR_PLAN,
  formatCommissionEffectiveDate,
} from "./plans.ts";
import { LEGAL_LAST_UPDATED } from "./constants/legal.ts";

/**
 * Unified Creator Plan copy, in all five languages: one 10% commission, no
 * retired tier, no feature or integration the product does not have, and the
 * published support hours in the Africa/Cairo zone.
 */

const DICTIONARIES = { en, ar, fr, es, de } as const;
type Dict = typeof en;

function allStrings(dict: Dict): string[] {
  return Object.values(dict).flatMap((ns) => Object.values(ns as Record<string, string>));
}

function lookup(dict: Dict, key: string): string | undefined {
  const [ns, k] = key.split(".");
  return (dict as unknown as Record<string, Record<string, string>>)[ns]?.[k];
}

test("the commission is a single 10%", () => {
  assert.equal(CREATOR_COMMISSION, "10%");
  assert.equal(CREATOR_PLAN.commission, "10%");
});

for (const [lang, dict] of Object.entries(DICTIONARIES)) {
  test(`${lang}: every Creator Plan feature key exists`, () => {
    for (const key of [CREATOR_PLAN.nameKey, ...CREATOR_PLAN.featureKeys]) {
      assert.ok(lookup(dict, key), `${lang} is missing ${key}`);
    }
  });

  test(`${lang}: no retired tier, old commission, or unbuilt feature is advertised`, () => {
    const text = allStrings(dict).join("\n");
    for (const banned of [
      /\bStarter\b/,
      /\bElite\b/,
      /Pro Creator/,
      /Pro and Elite/,
      /\b15\s?%/,
      /8[–-]10\s?%/,
      /Twitch\/Kick/,
      /PDF/,
      /5 email analyses/,
    ]) {
      assert.doesNotMatch(text, banned, `${lang} still says ${banned}`);
    }
  });

  test(`${lang}: the commission and settlement copy is the unified one`, () => {
    assert.match(dict.dashboard.pricingNote, /\{pct\}/);
    assert.ok(dict.pricing.commissionPerDeal.length > 0);
    assert.ok(dict.pricing.settlementNote.length > 0);
    assert.ok(dict.pricing.companyFree.length > 0);
  });

  test(`${lang}: support hours name Africa/Cairo and 10–22, without a 24/7 promise`, () => {
    assert.match(dict.support.hours, /Africa\/Cairo/);
    assert.match(dict.support.hours, /10/);
    assert.match(dict.support.hours, /22|10:00 (PM|مساءً)/);
    // 24/7 may only appear where the copy says support is NOT 24/7.
    assert.doesNotMatch(dict.support.hours, /24/);
  });

  test(`${lang}: integration statuses and the in-development note are present`, () => {
    for (const key of ["available", "inDevelopment", "manual", "planned"] as const) {
      assert.ok(dict.integrations[key].length > 0, `${lang} integrations.${key}`);
    }
    assert.match(dict.mediaKit.inDevelopmentNote, /\{source\}/);
  });

  test(`${lang}: the landing page does not claim Twitch or Instagram sync`, () => {
    assert.doesNotMatch(dict.landing.valueProp1Body, /Twitch|Instagram|تويتش|إنستغرام/);
  });
}

test("English only says 24/7 to deny it", () => {
  assert.match(en.support.hoursNote, /not a 24\/7 service/);
});

test("the Terms state the single commission and no plan-dependent rate", () => {
  const terms = readFileSync(new URL("../app/terms/page.tsx", import.meta.url), "utf8");
  assert.match(terms, /commission of \{CREATOR_COMMISSION\}/);
  assert.doesNotMatch(terms, /depends on the account&apos;s plan/);
  assert.doesNotMatch(terms, /vary by region/);
});

/** The effective date of the single 10% rate (owner decision, 2026-10-31). */

test("the effective date is a real calendar date and matches this Terms revision", () => {
  assert.match(COMMISSION_EFFECTIVE_DATE, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(formatCommissionEffectiveDate("en-GB"), "31 October 2026");
  // The Terms claim the rate took effect "the date this revision was
  // published", so the two dates must never drift apart.
  assert.equal(formatCommissionEffectiveDate("en-GB"), LEGAL_LAST_UPDATED);
  // Plain "en" formats the same way as the Terms.
  assert.equal(formatCommissionEffectiveDate("en"), LEGAL_LAST_UPDATED);
});

/**
 * W1 on the Pricing page: the one-time no-notice change is historical, so its
 * rate and date are literal in every dictionary. Only the notice period for
 * future changes, which is current policy, is a parameter.
 */
const HISTORICAL_DATE: Record<string, string> = {
  en: "31 October 2026",
  ar: "31 أكتوبر 2026",
  fr: "31 octobre 2026",
  es: "31 de octubre de 2026",
  de: "31. Oktober 2026",
};

/** The same substitution LocaleProvider's t() performs. */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

for (const [lang, dict] of Object.entries(DICTIONARIES)) {
  const text = dict.pricing.commissionEffective;

  test(`${lang}: the pricing page's historical exception names 10% and 31 October 2026 literally`, () => {
    assert.match(text, /10\s?%/);
    assert.ok(text.includes(HISTORICAL_DATE[lang]), `${lang} lacks the literal date`);
    assert.doesNotMatch(text, /\{date\}|\{pct\}/, "rate and date must not be parameters");
  });

  test(`${lang}: changing the current rate or date cannot rewrite the historical exception`, () => {
    // Every parameter a future change might pass: a new rate and a new date.
    const rendered = interpolate(text, { days: 30, pct: "12%", date: "1 January 2028" });
    assert.match(rendered, /10\s?%/);
    assert.ok(rendered.includes(HISTORICAL_DATE[lang]));
    assert.ok(!rendered.includes("12%") && !rendered.includes("2028"));
  });

  test(`${lang}: the pricing page keeps future commission changes under the notice period`, () => {
    assert.match(text, /\{days\}/);
    assert.ok(interpolate(text, { days: 30 }).includes("30"));
  });
}

test("the historical date on Pricing matches the localized form of 2026-10-31", () => {
  for (const [lang, literal] of Object.entries(HISTORICAL_DATE)) {
    const tag = lang === "en" ? "en-GB" : lang;
    const formatted = new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "UTC" }).format(
      new Date("2026-10-31T00:00:00Z"),
    );
    assert.equal(literal, formatted, lang);
  }
});

test("PricingView passes only the notice period, never the live rate or date, to the exception", () => {
  const view = readFileSync(new URL("../components/views/PricingView.tsx", import.meta.url), "utf8");
  const call = view.slice(view.indexOf('t("pricing.commissionEffective"'));
  const args = call.slice(0, call.indexOf(")}") + 1);
  assert.match(args, /\{ days: CHANGE_NOTICE_DAYS \}/);
  assert.doesNotMatch(args, /COMMISSION_EFFECTIVE_DATE|formatCommissionEffectiveDate|CREATOR_COMMISSION|CREATOR_PLAN/);
});

test("the pricing exception agrees with Terms §6 and §14", () => {
  const terms = readFileSync(new URL("../app/terms/page.tsx", import.meta.url), "utf8");
  // Same rate and date, literal on both sides.
  assert.match(terms, /takes effect on 31 October 2026, with no notice period/);
  assert.match(terms, /the single 10%\s+commission in clause 6 took effect on 31 October 2026/);
  assert.ok(en.pricing.commissionEffective.includes("10%"));
  assert.ok(en.pricing.commissionEffective.includes("31 October 2026"));
  // Both protect deals agreed before the date.
  assert.match(en.pricing.commissionEffective, /agreed before 31 October 2026 keeps the rate/);
  // Both keep notice for later changes, with the same number of days.
  assert.match(terms, /\{CHANGE_NOTICE_DAYS\} days&apos; notice/);
  assert.match(en.pricing.commissionEffective, /one-time change/);
  assert.match(en.pricing.commissionEffective, /later change to the commission will be announced at least \{days\} days in advance/);
});

test("Terms §6 states the date and protects deals agreed before it", () => {
  const terms = readFileSync(new URL("../app/terms/page.tsx", import.meta.url), "utf8");
  const s6 = terms.slice(terms.indexOf("<h2>6. Commission</h2>"), terms.indexOf("<h2>7."));
  assert.match(s6, /This rate takes effect on 31 October 2026, with no notice period\./);
  assert.match(s6, /including a\s+deal that was opened before that date but had not been agreed by it/);
  assert.match(s6, /keep the rate that applied when the\s+deal was agreed/);
});

test("Terms §14 keeps its 30-day notice and no-retroactivity rule, with one named exception", () => {
  const terms = readFileSync(new URL("../app/terms/page.tsx", import.meta.url), "utf8");
  const s14 = terms.slice(terms.indexOf("<h2>14. Changes to these terms</h2>"), terms.indexOf("<h2>15."));
  assert.match(s14, /\{CHANGE_NOTICE_DAYS\} days&apos; notice/);
  assert.match(s14, /A change never applies retroactively to a deal already agreed, or to a\s+commission already earned/);
  assert.match(s14, /One change is an exception to that notice period/);
  assert.match(s14, /including any later change to the commission, is given\s+the full notice/);
});

/**
 * W1: the no-notice exception is a historical record of one change. It is
 * written out literally, so changing the rate or its date later cannot make a
 * new change inherit "no notice period".
 */
function noticeExceptionText(): { s6NoNotice: string; s14Exception: string } {
  const terms = readFileSync(new URL("../app/terms/page.tsx", import.meta.url), "utf8");
  const s6 = terms.slice(terms.indexOf("<h2>6. Commission</h2>"), terms.indexOf("<h2>7."));
  const s14 = terms.slice(terms.indexOf("<h2>14. Changes to these terms</h2>"), terms.indexOf("<h2>15."));
  const s6NoNotice = s6.slice(s6.indexOf("<strong>"), s6.indexOf("</p>", s6.indexOf("<strong>")));
  const start = s14.indexOf("One change is an exception");
  const s14Exception = s14.slice(start, s14.indexOf("</p>", start));
  return { s6NoNotice, s14Exception };
}

test("W1: the historical exception names 10% and 31 October 2026 literally", () => {
  const { s6NoNotice, s14Exception } = noticeExceptionText();
  assert.match(s6NoNotice, /takes effect on 31 October 2026, with no notice period/);
  assert.match(s14Exception, /the single 10%\s+commission in clause 6 took effect on 31 October 2026/);
});

test("W1: the exception is not wired to the current rate or date, so a future change cannot reuse it", () => {
  const { s6NoNotice, s14Exception } = noticeExceptionText();
  for (const text of [s6NoNotice, s14Exception]) {
    assert.doesNotMatch(text, /\{\s*CREATOR_COMMISSION\s*\}/);
    assert.doesNotMatch(text, /\{\s*EFFECTIVE_DATE\s*\}/);
    assert.doesNotMatch(text, /COMMISSION_EFFECTIVE_DATE|formatCommissionEffectiveDate/);
  }
  // Simulate a future rate change: what the exception says must not depend on
  // the live constant. Its literal rate stays 10% whatever CREATOR_COMMISSION is.
  const futureRate = "12%";
  assert.notEqual(futureRate, "10%");
  assert.ok(!s14Exception.includes(futureRate));
  assert.ok(s14Exception.includes("10%"));
});

test("W1: §14 still gives full notice for every later change, including the commission", () => {
  const terms = readFileSync(new URL("../app/terms/page.tsx", import.meta.url), "utf8");
  const s14 = terms.slice(terms.indexOf("<h2>14. Changes to these terms</h2>"), terms.indexOf("<h2>15."));
  assert.equal((s14.match(/is an exception to that notice period/g) ?? []).length, 1, "exactly one exception");
  assert.match(s14, /Every future change that materially affects your rights\s+or obligations, including any later change to the commission, is given\s+the full notice/);
});

/** A4: the sign-in note offers access or account help, not a "plan change". */
for (const [lang, dict] of Object.entries(DICTIONARIES)) {
  test(`${lang}: the sign-in access note exists and mentions no plan change`, () => {
    assert.ok(dict.login.accessNote.length > 0);
    assert.doesNotMatch(dict.login.accessNote, /plan|خطة|offre|Tarif/i);
  });
}

test("the sign-in page renders the translated note, not the old English copy", () => {
  const page = readFileSync(new URL("../app/(auth)/login/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<AccessNote \/>/);
  assert.doesNotMatch(page, /plan change/);
});
