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
    .filter((v) => v.viewCount && v.viewCount > 0)
    .map((v) => (((v.likeCount ?? 0) + (v.commentCount ?? 0)) / v.viewCount!) * 100);

  if (rates.length === 0) return null;
  const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
  return Math.round(mean * 100) / 100;
}
