import type { CountryShare } from "@/lib/types/database";

/**
 * YouTube verified audience geography — CLAUDE.md §7.2/§7.3.
 *
 * What the number means: the share of the channel's **views** in the last
 * AUDIENCE_GEO_WINDOW_DAYS days that came from each country, as reported by
 * the YouTube Analytics API. It is the geographic distribution of views, not
 * a demographic count of unique viewers — §7.3's "viewer % by country" is the
 * closest thing the API supports. It is "verified" in the §7.2 sense: it came
 * from an official API the creator connected via OAuth, not from the creator.
 *
 * Why not `viewerPercentage`: that metric only exists in the demographics
 * reports (ageGroup / gender). The country report ("User activity by
 * country") requires the `country` dimension and supports `views`,
 * `estimatedMinutesWatched` and similar — never `viewerPercentage`. The query
 * used before this module asked for exactly that unsupported combination.
 * (developers.google.com/youtube/analytics/channel_reports, checked
 * 2026-10-30.)
 *
 * Pure — no fetch, no server-only — so every branch is unit-tested
 * (youtube-geo.test.ts).
 */

export const REPORTS_ENDPOINT = "https://youtubeanalytics.googleapis.com/v2/reports";

/** A fixed, recent window, so every creator's shares mean the same thing. */
export const AUDIENCE_GEO_WINDOW_DAYS = 90;

/** How many countries are stored; the full distribution is used for maths. */
export const MAX_COUNTRIES = 10;

/** YouTube reports views it could not place in a country under this code. */
export const UNKNOWN_COUNTRY = "ZZ";

const COUNTRY_CODE = /^[A-Z]{2}$/;

export type AudienceGeoResult =
  | {
      ok: true;
      countries: CountryShare[];
      totalViews: number;
      startDate: string;
      endDate: string;
    }
  | {
      ok: false;
      /**
       * http_error — the API answered non-2xx (status set);
       * network    — the request did not complete;
       * malformed  — a 2xx whose body is not the documented result table;
       * no_data    — a valid answer with nothing usable: no rows, zero views,
       *              or only views YouTube could not place in a country.
       */
      reason: "http_error" | "network" | "malformed" | "no_data";
      status?: number;
    };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The reporting window: AUDIENCE_GEO_WINDOW_DAYS inclusive, ending
 * *yesterday* in UTC. YouTube Analytics dates are Pacific-time days and the
 * most recent day is still filling in, so ending on today's UTC date would at
 * times ask for a day that is in the future where the data lives.
 */
export function reportWindow(now: Date): { startDate: string; endDate: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (AUDIENCE_GEO_WINDOW_DAYS - 1));
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

/**
 * Query parameters for views by country. No `maxResults`: every country row
 * is needed, because each share is computed against the total of all of them
 * (one country per row, so this is at most a few hundred rows).
 */
export function buildCountryViewsQuery(channelId: string, now: Date): URLSearchParams {
  const { startDate, endDate } = reportWindow(now);
  return new URLSearchParams({
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    metrics: "views",
    dimensions: "country",
    sort: "-views",
  });
}

type CountryViews = { country: string; views: number };

/**
 * Reads the documented `youtubeAnalytics#resultTable` shape. Column positions
 * are taken from `columnHeaders`, never assumed, and every row is checked: a
 * body that does not match is `malformed`, never "no countries".
 */
export function parseCountryViewsReport(
  body: unknown,
): { ok: true; rows: CountryViews[] } | { ok: false; reason: "malformed" } {
  const malformed = { ok: false as const, reason: "malformed" as const };
  if (!body || typeof body !== "object" || Array.isArray(body)) return malformed;
  const table = body as Record<string, unknown>;

  if (table.kind !== undefined && table.kind !== "youtubeAnalytics#resultTable") return malformed;
  if (!Array.isArray(table.columnHeaders)) return malformed;

  const names = table.columnHeaders.map((h) =>
    h && typeof h === "object" ? (h as Record<string, unknown>).name : undefined,
  );
  const countryAt = names.indexOf("country");
  const viewsAt = names.indexOf("views");
  if (countryAt === -1 || viewsAt === -1) return malformed;

  // The API omits `rows` entirely when the query matched nothing.
  if (table.rows === undefined) return { ok: true, rows: [] };
  if (!Array.isArray(table.rows)) return malformed;

  const rows: CountryViews[] = [];
  for (const row of table.rows) {
    if (!Array.isArray(row)) return malformed;
    const country = row[countryAt];
    const views = row[viewsAt];
    if (typeof country !== "string" || !COUNTRY_CODE.test(country)) return malformed;
    if (typeof views !== "number" || !Number.isInteger(views) || views < 0) return malformed;
    rows.push({ country, views });
  }
  return { ok: true, rows };
}

/**
 * Integer percentages that sum to exactly 100 across the whole distribution
 * (largest-remainder / Hamilton method): floor every exact share, then hand
 * the leftover points to the largest fractional parts, ties broken by more
 * views and then by country code so the result is deterministic.
 *
 * Independent rounding would let a 33.4 / 33.3 / 33.3 split print as
 * 33 / 33 / 33 = 99, and a long tail round every small country to 0 while the
 * total drifts. Shares are computed against *all* views in the window,
 * including the unknown-country bucket, so each is a true fraction of the
 * channel's views; the unknown bucket itself is then dropped from the list
 * (it is not a country a sponsor can target).
 */
export function toCountryShares(
  rows: CountryViews[],
  max: number = MAX_COUNTRIES,
): { ok: true; countries: CountryShare[]; totalViews: number } | { ok: false; reason: "no_data" } {
  // Defensive: a repeated country (not expected) is merged, not double-listed.
  const byCountry = new Map<string, number>();
  for (const r of rows) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + r.views);

  const totalViews = [...byCountry.values()].reduce((s, v) => s + v, 0);
  if (totalViews <= 0) return { ok: false, reason: "no_data" };

  const exact = [...byCountry].map(([country, views]) => {
    const share = (views * 100) / totalViews;
    return { country, views, floor: Math.floor(share), rest: share - Math.floor(share) };
  });

  let leftover = 100 - exact.reduce((s, e) => s + e.floor, 0);
  const byRemainder = [...exact].sort(
    (a, b) => b.rest - a.rest || b.views - a.views || a.country.localeCompare(b.country),
  );
  const pct = new Map(exact.map((e) => [e.country, e.floor]));
  for (const e of byRemainder) {
    if (leftover <= 0) break;
    pct.set(e.country, pct.get(e.country)! + 1);
    leftover--;
  }

  const countries = exact
    .filter((e) => e.country !== UNKNOWN_COUNTRY && pct.get(e.country)! > 0)
    .sort((a, b) => b.views - a.views || a.country.localeCompare(b.country))
    .slice(0, max)
    .map((e) => ({ country: e.country, pct: pct.get(e.country)! }));

  if (countries.length === 0) return { ok: false, reason: "no_data" };
  return { ok: true, countries, totalViews };
}

/** Full pipeline from a parsed response body to a result. */
export function audienceGeoFromReport(body: unknown, now: Date): AudienceGeoResult {
  const parsed = parseCountryViewsReport(body);
  if (!parsed.ok) return parsed;
  const shares = toCountryShares(parsed.rows);
  if (!shares.ok) return shares;
  return { ok: true, countries: shares.countries, totalViews: shares.totalViews, ...reportWindow(now) };
}

const NO_DATA_MESSAGE = `YouTube has no country data for this channel in the last ${AUDIENCE_GEO_WINDOW_DAYS} days yet.`;

/**
 * What a sync may write. The only path to `audience_verified: true` is an ok
 * result with at least one country; every failure returns an error and no
 * update at all, so a failed or empty sync can never mark — or re-mark —
 * geography as verified, and never overwrites the last good values with
 * empty ones.
 */
export function verifiedGeoUpdate(
  result: AudienceGeoResult,
):
  | { update: { verified_top_countries: CountryShare[]; audience_verified: true }; error: null }
  | { update: null; error: string } {
  if (result.ok && result.countries.length > 0) {
    return {
      update: { verified_top_countries: result.countries, audience_verified: true },
      error: null,
    };
  }
  if (result.ok) return { update: null, error: NO_DATA_MESSAGE };

  switch (result.reason) {
    case "no_data":
      return { update: null, error: NO_DATA_MESSAGE };
    case "http_error":
      return {
        update: null,
        error:
          result.status === 401 || result.status === 403
            ? "YouTube refused access to this channel's analytics — reconnect above."
            : "Could not reach YouTube Analytics — try again shortly.",
      };
    default:
      return { update: null, error: "Could not reach YouTube Analytics — try again shortly." };
  }
}
