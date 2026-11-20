# AI Analyzer: root-cause report (2026-11-02)

## Scope

- the creator channel analysis (G's assessment, `src/lib/g/assessment.ts`);
- the YouTube sync it reads (`src/lib/youtube/*`, `syncYoutubeStats` in `src/lib/media-kit/actions.ts`);
- the Manual (offer) Analyzer.

The offer Analyzer was already audited and fixed in D3–D6 (CLAUDE.md §5.1, §7.4). It was re-read here, and no new defect was found.

## Method

- Code reading and unit tests with recorded API shapes.
- No live YouTube or NVIDIA call was made in this pass, so live API behaviour is cited from the code's documented assumptions, not re-observed.

## Findings

### A1. Engagement rate understated for channels that hide likes (fixed)

| | |
|---|---|
| **Reproduction** | Three recent uploads: two at 5% engagement, one with likes hidden. The old code returned **3.33%**. |
| **Root cause** | `meanEngagementRate` used `likeCount ?? 0`. The Data API omits `likeCount` when a creator hides likes, so a hidden count was read as zero likes. |
| **Impact** | Every channel with likes hidden on some videos showed lower engagement than it has. Engagement feeds the assessment and the Media Kit. |
| **Fix** | Videos without a like count are excluded from the mean (`src/lib/youtube/engagement.ts`). |
| **Test** | `engagement.test.ts`, "hidden like counts are left out". The mean is now 5%. |

### A2. Synced reach was fetched and thrown away (fixed for display; pricing unchanged)

| | |
|---|---|
| **Evidence** | `fetchYoutubeChannelStats` already loaded the view count of the last 10 uploads (to compute engagement), then kept only the engagement rate. `avg_views`, the reach figure behind pricing and the assessment, is only ever typed by the creator (`metric("avg_views", …, "self_reported")`). |
| **Impact** | The analysis could not show an official reach figure, even after a successful sync. |
| **Fix** | Migration 0031 adds `media_kits.recent_median_views` and `recent_views_sample`, written by the sync. They are cleared with the other synced public stats at 29 days (`clearedYouTubeStats`, YouTube data policy). The assessment shows the median as a **synced** metric with its sync time. The median is used rather than the mean, so one viral upload does not stand for typical reach. |
| **Not changed** | Pricing still reads the creator-typed `avg_views`. Switching pricing to the synced median changes recommended prices, so it is an owner decision (PENDING_OWNER_DECISIONS item 12). |
| **Tests** | `engagement.test.ts` ("median views"), `youtube-freshness.test.ts` (clearing), `supabase/verify/0031_verify.sql` (no client write grant). |

### A3. API failures during sync were silent (fixed: now logged)

- **Root cause:** `channels.list`, `playlistItems.list` and `videos.list` returned `null` or `[]` on any non-OK response, with no log. A quota error (403) on the video call produced a "successful" sync with no engagement update.
- **Fix:** each failure now logs `youtube.channels_failed`, `youtube.playlist_items_failed` or `youtube.videos_failed` with the HTTP status (no key, no body).
- **Not changed:** the user-facing message. A missing channel already shows "could not reach YouTube"; partial failures still finish the sync with the data that did arrive.

### A4. `engagement_rate` has mixed provenance (known, not fixed)

- The Media Kit form and the sync both write `engagement_rate`, and nothing records which wrote last.
- The assessment therefore labels it **self-reported**, the conservative choice (CLAUDE.md §12, G1).
- A clean fix needs a separate synced column, which is a schema change the owner should schedule.

### A5. Growth claims (verified correct)

- Growth is computed only from two real snapshots on different days (`lib/media-kit/growth.ts`, migration 0025, not applied).
- Without them the UI says so. No growth is ever estimated.

### A6. AI wording (verified guarded)

G's replies are discarded when they state a figure that is not in its data (`ungroundedFigures`). Proposals now get the same check (CLAUDE.md §19). Arabic digits are normalised before the check.

## Not verified

- Live API behaviour (quotas, hidden-likes field shape) was not re-observed in this pass.
- No real channel was synced.
- Shorts and long-form uploads are mixed in the "last 10 uploads" sample. Whether to separate them is a product decision, not a defect.
