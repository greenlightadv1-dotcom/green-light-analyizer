import { strict as assert } from "node:assert";
import { test } from "node:test";

import { meanEngagementRate } from "./engagement.ts";

test("returns null when given no videos", () => {
  assert.equal(meanEngagementRate([]), null);
});

test("returns null when every video is missing a view count", () => {
  const result = meanEngagementRate([
    { likeCount: 10, commentCount: 2 },
    { viewCount: 0, likeCount: 5, commentCount: 1 },
  ]);
  assert.equal(result, null);
});

test("computes the mean of per-video rates, not a ratio of summed totals", () => {
  // Video A: 10% engagement on 100 views. Video B: 1% engagement on 100,000
  // views. A ratio-of-sums would be dominated by B's huge view count; the
  // per-video mean should weight them equally.
  const result = meanEngagementRate([
    { viewCount: 100, likeCount: 9, commentCount: 1 },
    { viewCount: 100_000, likeCount: 900, commentCount: 100 },
  ]);
  assert.equal(result, 5.5);
});

test("excludes zero-view videos rather than counting them as 0% engagement", () => {
  const withZeroView = meanEngagementRate([
    { viewCount: 1000, likeCount: 50, commentCount: 0 },
    { viewCount: 0, likeCount: 0, commentCount: 0 },
  ]);
  const withoutIt = meanEngagementRate([{ viewCount: 1000, likeCount: 50, commentCount: 0 }]);
  assert.equal(withZeroView, withoutIt);
  assert.equal(withZeroView, 5);
});

test("rounds to two decimal places", () => {
  const result = meanEngagementRate([{ viewCount: 3, likeCount: 1, commentCount: 0 }]);
  assert.equal(result, 33.33);
});
