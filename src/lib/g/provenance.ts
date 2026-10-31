/**
 * Where a number G shows came from. Every metric G reports carries one of
 * these, so verified, synced, self-reported, stale and missing data are never
 * blended (CLAUDE.md §7.2).
 *
 *   verified      — from an official analytics API the creator connected via
 *                   OAuth, and still within the 30-day window (G1)
 *   synced        — from a public platform API sync, within 30 days
 *   self_reported — typed by the creator; shown, never presented as verified
 *   stale         — came from an API but is older than 30 days
 *   missing       — no value
 *
 * Pure.
 */
export type Provenance = "verified" | "synced" | "self_reported" | "stale" | "missing";

export const FRESH_WINDOW_MS = 30 * 86_400_000;

/** True when `iso` is a valid timestamp under 30 days old (a minute of clock skew allowed). */
export function isFresh(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const age = now.getTime() - t;
  return age >= -60_000 && age < FRESH_WINDOW_MS;
}

export type Metric = {
  /** Stable key; the client labels it via the `g.metric.*` dictionary keys. */
  key: string;
  value: number | string | null;
  provenance: Provenance;
  /** When the value was last synced, for synced/verified/stale values. */
  asOf?: string | null;
};

export function metric(
  key: string,
  value: number | string | null | undefined,
  provenance: Exclude<Provenance, "missing">,
  asOf?: string | null,
): Metric {
  if (value === null || value === undefined || value === "") {
    return { key, value: null, provenance: "missing" };
  }
  return { key, value, provenance, asOf: asOf ?? null };
}

export type CountryShare = { country: string; pct: number };

export function toShares(raw: unknown): CountryShare[] {
  if (!Array.isArray(raw)) return [];
  const out: CountryShare[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { country, pct } = item as Record<string, unknown>;
    if (typeof country === "string" && /^[A-Z]{2}$/.test(country) && typeof pct === "number" && pct >= 0 && pct <= 100) {
      out.push({ country, pct });
    }
  }
  return out.sort((a, b) => b.pct - a.pct);
}
