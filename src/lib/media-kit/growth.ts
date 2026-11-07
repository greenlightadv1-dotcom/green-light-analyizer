/**
 * Creator growth from real, dated snapshots (migration 0025). Pure.
 *
 * Growth is the change between the oldest and newest snapshot inside the
 * retention window, and only when they were captured on different days and
 * both carry the metric. With fewer than two such points there is no growth
 * to show, and this returns null: a single current figure never produces a
 * growth number.
 *
 * The window is 29 days because the YouTube stats are Non-Authorized Data,
 * which the YouTube API policy forbids storing for more than 30 days; the
 * snapshots themselves are deleted at that age.
 */
export const SNAPSHOT_MAX_AGE_DAYS = 29;

export type GrowthMetric = "subscriber_count" | "channel_view_count" | "media_count";

export type Snapshot = {
  captured_on: string; // YYYY-MM-DD (UTC)
  subscriber_count: number | null;
  channel_view_count: number | null;
  media_count: number | null;
};

export type Growth = {
  metric: GrowthMetric;
  from: number;
  to: number;
  fromDate: string;
  toDate: string;
  days: number;
  change: number;
  /** null when the starting value is 0 (a percentage would be meaningless). */
  pct: number | null;
};

const DAY_MS = 86_400_000;
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`));

/** The UTC day `days` before `now`, as YYYY-MM-DD. */
export function cutoffDay(now: Date, days = SNAPSHOT_MAX_AGE_DAYS): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

export function computeGrowth(snapshots: Snapshot[], metric: GrowthMetric, now: Date): Growth | null {
  const cutoff = cutoffDay(now);
  const today = now.toISOString().slice(0, 10);
  const points = snapshots
    .filter((s) => isDay(s.captured_on) && s.captured_on >= cutoff && s.captured_on <= today)
    .filter((s) => typeof s[metric] === "number" && Number.isFinite(s[metric]) && (s[metric] as number) >= 0)
    .sort((a, b) => a.captured_on.localeCompare(b.captured_on));
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.captured_on === last.captured_on) return null;
  const from = first[metric] as number;
  const to = last[metric] as number;
  const days = Math.round((Date.parse(`${last.captured_on}T00:00:00Z`) - Date.parse(`${first.captured_on}T00:00:00Z`)) / DAY_MS);
  const change = to - from;
  return {
    metric,
    from,
    to,
    fromDate: first.captured_on,
    toDate: last.captured_on,
    days,
    change,
    pct: from > 0 ? Math.round((change / from) * 1000) / 10 : null,
  };
}
