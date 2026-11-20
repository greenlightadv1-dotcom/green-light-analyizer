/**
 * Top content and posting cadence from the uploads the YouTube Data API
 * returned on the last sync (media_kit_videos, 0035).
 *
 * Integrity rules:
 * - Unavailable is never zero. A hidden like or comment count is null, and
 *   an engagement rate is computed only from the counts that exist.
 * - Cadence is computed only over a window the sample actually covers: with
 *   50 uploads fetched, "uploads in the last 90 days" is reported only if the
 *   oldest fetched upload is older than 90 days, or the sample is the
 *   channel's whole upload history. Otherwise the figure is "unknown", not a
 *   guess.
 * - YouTube only. Nothing here applies to another platform.
 *
 * Pure — tested in content-analytics.test.ts.
 */

export type SyncedVideo = {
  video_id: string;
  title: string | null;
  published_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
};

export type TopItem = SyncedVideo & {
  /** (likes + comments) / views × 100 when likes are visible; null otherwise. */
  engagement_pct: number | null;
};

export function topContent(videos: SyncedVideo[], n = 5): TopItem[] {
  return videos
    .filter((v) => typeof v.view_count === "number")
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0) || (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, n)
    .map((v) => ({
      ...v,
      engagement_pct:
        v.view_count && v.view_count > 0 && v.like_count !== null
          ? Math.round((((v.like_count ?? 0) + (v.comment_count ?? 0)) / v.view_count) * 10000) / 100
          : null,
    }));
}

export type Cadence = {
  sample: number;
  /** null = the sample does not reach back that far, so the count is unknown. */
  last30: number | null;
  last90: number | null;
  /** Median days between consecutive uploads; null with fewer than 3 dated uploads. */
  medianGapDays: number | null;
  /** Average uploads per week over the covered span; null with fewer than 3 dated uploads. */
  perWeek: number | null;
  /** Coefficient of variation of the gaps: regular ≤ 0.5, irregular > 1. null when unknown. */
  consistency: "regular" | "variable" | "irregular" | null;
  /** The newest upload's age in days, null without dated uploads. */
  daysSinceLast: number | null;
};

const DAY = 86_400_000;

/**
 * `complete` is true when the API returned fewer uploads than asked for,
 * i.e. the sample is the channel's whole public upload list.
 */
export function cadence(videos: SyncedVideo[], now: Date, complete: boolean): Cadence {
  const times = videos
    .map((v) => (v.published_at ? Date.parse(v.published_at) : NaN))
    .filter((t) => Number.isFinite(t) && t <= now.getTime())
    .sort((a, b) => b - a);
  const sample = times.length;
  const oldest = times[times.length - 1];
  const covers = (days: number) => complete || (sample > 0 && now.getTime() - oldest > days * DAY);
  const within = (days: number) => times.filter((t) => now.getTime() - t <= days * DAY).length;
  const base: Cadence = {
    sample,
    last30: covers(30) ? within(30) : null,
    last90: covers(90) ? within(90) : null,
    medianGapDays: null,
    perWeek: null,
    consistency: null,
    daysSinceLast: sample ? Math.floor((now.getTime() - times[0]) / DAY) : null,
  };
  if (sample < 3) return base;
  const gaps = times.slice(0, -1).map((t, i) => (t - times[i + 1]) / DAY);
  const sorted = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
  const cv = mean > 0 ? sd / mean : null;
  const spanDays = (times[0] - oldest) / DAY;
  return {
    ...base,
    medianGapDays: Math.round(median * 10) / 10,
    perWeek: spanDays > 0 ? Math.round(((sample - 1) / spanDays) * 7 * 10) / 10 : null,
    consistency: cv === null ? null : cv <= 0.5 ? "regular" : cv <= 1 ? "variable" : "irregular",
  };
}
