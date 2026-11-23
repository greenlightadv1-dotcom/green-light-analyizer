import type { CountryShare } from "@/lib/types/database";

/**
 * Instagram audience geography from `follower_demographics` (Graph API,
 * `metric_type=total_value&breakdown=country`). Replaces the retired
 * `audience_country` metric the connector used to ask for.
 *
 * Response shape (developers.facebook.com, Instagram Account Insights, read
 * 2026-11-23):
 *   data[0].total_value.breakdowns[0] = {
 *     dimension_keys: ["timeframe", "country"]  (or just ["country"]),
 *     results: [{ dimension_values: ["LAST_90_DAYS", "EG"], value: 40 }, …]
 *   }
 * The country is found by its position in dimension_keys, not assumed to be
 * last. Meta returns only the top 45 countries and nothing under 100
 * followers, so an empty result is "no data", never "no audience".
 *
 * Pure, so it is tested directly (instagram-demographics.test.ts).
 */
export function parseFollowerCountries(body: unknown): CountryShare[] | null {
  const metric = (body as { data?: unknown[] })?.data?.[0] as
    | { total_value?: { breakdowns?: unknown[] } }
    | undefined;
  const breakdown = metric?.total_value?.breakdowns?.[0] as
    | { dimension_keys?: unknown; results?: unknown }
    | undefined;
  if (!breakdown || !Array.isArray(breakdown.results)) return null;

  const keys = Array.isArray(breakdown.dimension_keys) ? breakdown.dimension_keys : ["country"];
  const at = keys.indexOf("country");
  if (at < 0) return null;

  const counts = new Map<string, number>();
  for (const row of breakdown.results as { dimension_values?: unknown; value?: unknown }[]) {
    const values = Array.isArray(row?.dimension_values) ? row.dimension_values : [];
    const country = values[at];
    const value = row?.value;
    if (typeof country !== "string" || !/^[A-Za-z]{2}$/.test(country)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    const code = country.toUpperCase();
    counts.set(code, (counts.get(code) ?? 0) + value);
  }

  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  return [...counts.entries()]
    .map(([country, n]) => ({ country, pct: Math.round((n / total) * 100) }))
    .filter((share) => share.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);
}
