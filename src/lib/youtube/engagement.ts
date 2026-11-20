export type VideoEngagementInput = {
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
};

/**
 * Mean of (likes + comments) / views * 100 across the given videos —
 * per-video, not from summed totals, so one viral outlier can't dominate
 * the number. Videos with no recorded view count are excluded rather than
 * treated as a 0% engagement data point. Returns null (never 0) when there
 * is nothing to average, so a caller can't mistake "no data" for "no
 * engagement".
 */
export function meanEngagementRate(videos: VideoEngagementInput[]): number | null {
  const rates = videos
    // A hidden like count is omitted by the API, not zero: counting it as 0
    // understated engagement for every channel that hides likes (analyzer
    // report A1). Such videos are left out of the mean.
    .filter((v) => v.viewCount && v.viewCount > 0 && v.likeCount !== undefined)
    .map((v) => (((v.likeCount ?? 0) + (v.commentCount ?? 0)) / v.viewCount!) * 100);

  if (rates.length === 0) return null;
  const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
  return Math.round(mean * 100) / 100;
}

/**
 * Median views of the given uploads (videos with a known view count only),
 * and how many it is the median of. Median, not mean, so one viral upload
 * does not stand for the channel's typical reach. Null when there is nothing.
 */
export function medianViews(videos: VideoEngagementInput[]): { median: number; sample: number } | null {
  const views = videos.map((v) => v.viewCount).filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (!views.length) return null;
  const mid = Math.floor(views.length / 2);
  const median = views.length % 2 ? views[mid] : Math.round((views[mid - 1] + views[mid]) / 2);
  return { median, sample: views.length };
}
