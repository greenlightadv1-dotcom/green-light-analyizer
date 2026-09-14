import type { CountryShare } from "@/lib/types/database";

/**
 * Parsing and validation for audience-geography input (§7.2).
 *
 * declared_top_countries is creator-entered, so it is the one place in the
 * media kit where a human types free text into a JSONB column. Pure functions,
 * no I/O — see countries.test.ts.
 *
 * Accepted input is forgiving about layout — one per line, comma-separated,
 * or CSV-style — because this is a textarea a person types into:
 *
 *     EG 40        EG 40, SA 25        EG,40
 *     SA 25                            SA,25
 */

export type ParseResult =
  | { ok: true; value: CountryShare[] }
  | { ok: false; error: string };

const CODE = /^[A-Z]{2}$/;
const MAX_ENTRIES = 10;

/** Renders stored shares back into the textarea format. */
export function formatCountryShares(shares: CountryShare[] | null): string {
  if (!shares?.length) return "";
  return shares.map((s) => `${s.country} ${s.pct}`).join("\n");
}

export function parseCountryShares(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: [] };

  // Scan for code/percentage pairs rather than splitting on separators first.
  // Splitting cannot work here: a comma is an entry separator in "EG 40, SA 25"
  // and a field separator in "EG,40", and both are things people type.
  // Built per call — /g regexes carry lastIndex between uses.
  const entry = /([A-Za-z]{2})\s*[:\-,]?\s*(\d{1,3})\s*%?/g;

  const shares: CountryShare[] = [];
  const seen = new Set<string>();

  for (const match of trimmed.matchAll(entry)) {
    const country = match[1].toUpperCase();
    const pct = Number(match[2]);

    if (!CODE.test(country)) {
      return { ok: false, error: `"${country}" is not a two-letter country code.` };
    }
    if (seen.has(country)) {
      return { ok: false, error: `${country} is listed more than once.` };
    }
    if (pct <= 0 || pct > 100) {
      return { ok: false, error: `${country} must be between 1 and 100 percent.` };
    }

    seen.add(country);
    shares.push({ country, pct });
  }

  // Anything the scan did not consume is a typo, not a silent omission —
  // dropping it would quietly mis-state where someone's audience is.
  const leftover = trimmed
    .replace(/([A-Za-z]{2})\s*[:\-,]?\s*(\d{1,3})\s*%?/g, "")
    .replace(/[\s,;:%\-]/g, "");

  if (leftover) {
    return {
      ok: false,
      error: `Could not read "${leftover}". Use a two-letter country code and a percentage, like "EG 40".`,
    };
  }

  if (shares.length === 0) {
    return {
      ok: false,
      error: `Could not read "${trimmed}". Use a two-letter country code and a percentage, like "EG 40".`,
    };
  }

  if (shares.length > MAX_ENTRIES) {
    return { ok: false, error: `List at most ${MAX_ENTRIES} countries.` };
  }

  const total = shares.reduce((sum, s) => sum + s.pct, 0);
  if (total > 100) {
    return {
      ok: false,
      error: `Those percentages add up to ${total}%. They cannot exceed 100%.`,
    };
  }

  // Largest first: the evaluator and the UI both read these as a ranking.
  return { ok: true, value: shares.sort((a, b) => b.pct - a.pct) };
}

/** Share of an audience sitting in the given target countries, 0–1. */
export function overlapWith(
  shares: CountryShare[] | null,
  targets: string[] | null,
): number | null {
  if (!shares?.length) return null;
  if (!targets?.length) return 1;

  const wanted = new Set(targets.map((t) => t.toUpperCase()));
  const matched = shares
    .filter((s) => wanted.has(s.country.toUpperCase()))
    .reduce((sum, s) => sum + s.pct, 0);

  return Math.min(matched / 100, 1);
}
