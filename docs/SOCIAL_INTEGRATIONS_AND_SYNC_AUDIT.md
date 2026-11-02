# Social integrations and sync audit (2026-11-02)

## Method and labels

- **Method:** code reading on this branch. No provider API was called in this pass.
- **Provider documentation:** facts are cited from the code's documented assumptions and from `docs/GREEN_LIGHT_INTEGRATION_STATUS.md` (2026-10-29). They were **not re-checked** against the providers today.

| Label | Meaning |
|---|---|
| [C] | From code |
| [D] | From provider docs, as recorded earlier |
| [U] | Unverified |

## Source of truth

`INTEGRATION_STATUS` in `src/lib/media-kit/platforms.ts` [C]:

| Platform | Status | What the product does |
|---|---|---|
| YouTube | `available` | Public stats by handle (Data API v3) and OAuth-verified audience geography (Analytics API) |
| Instagram | `in_development` | No Connect button. Both the OAuth start and callback routes refuse it. |
| Twitch | `manual` | Self-reported fields only, labelled self-reported |
| Kick | `manual` | Self-reported only |
| TikTok | `planned` | Nothing |
| X | `planned` | Nothing |

## YouTube

### Public stats sync

Code: `syncYoutubeStats` in `lib/media-kit/actions.ts` and `lib/youtube/client.ts`.

- **Reads:**
  - `channels.list`: subscribers, total views, video count;
  - `playlistItems.list` and `videos.list`: the last 10 uploads.
- **Writes:**
  - `subscriber_count`, `channel_view_count`, `media_count` and `youtube_stats_synced_at`;
  - engagement rate;
  - since 0031 (not applied), `recent_median_views` and `recent_views_sample`.
- **Fixed this pass:**
  - hidden like counts are no longer read as 0 (A1);
  - reach was fetched but discarded (A2);
  - API failures are now logged (A3).
- **Limits and safeguards:**
  - rate limit `platform_sync`;
  - API-key quota, not measured [U].

### Verified audience geography (OAuth)

Code: `lib/oauth/youtube*.ts` and `api/oauth/[platform]/*`.

- **Scopes:** `youtube.readonly` plus `yt-analytics.readonly`. The callback checks that both were granted [C].
- **State:** signed (`lib/oauth/state.ts`). The platform is bound into the state, so a YouTube state cannot complete an Instagram callback [C].
- **Token storage:** `oauth_connections` (0015) is service-role only. It has no app-layer encryption, which the migration comment documents as a deliberate trade-off [C].
- **Analytics query:** fixed earlier in `youtube-geo.ts` (country dimension, valid metric) [C]. Not re-run live [U].
- **Retention (G1, 0023):**
  - geography counts as verified only while under 30 days old;
  - `invalid_grant` deletes the token and clears the geography columns;
  - the daily freshness cron clears data at 29 days, but only once `CRON_SECRET` is set (**not set in production**).
- **Google OAuth consent-screen verification:** status unknown [U]. While the app is in "Testing", refresh tokens expire after 7 days [D].

## Instagram

- **Status:** disabled on the server.
- **Code:** `lib/oauth/instagram.ts` pins Graph **v19.0** for the dialog, token, accounts, insights and media endpoints [C]. That version is past Meta's support window [D].
- **Before it can be enabled:**
  1. bump the version and re-test every endpoint;
  2. replace `audience_country` (deprecated in later versions [D]) with the current demographics metric;
  3. Meta App Review;
  4. bind the IG account to the creator.

## Twitch, Kick, TikTok, X

- **Twitch:** Helix exposes public stream and channel data, but no per-viewer country data [D]. It stays self-reported. A Helix sync of public follower counts is possible but not built.
- **Kick:** no official public analytics API [D].
- **TikTok:** the Display API does not give demographics for arbitrary accounts [D].
- **X:** not built; API access is paid [D]. That needs owner approval (rule 5).

## Sync freshness rules (all platforms)

- A synced value carries its sync time.
- A verified value older than 30 days is shown as stale and is not used as verified (`lib/g/provenance.ts`).
- Nothing self-reported is ever shown as verified. `engagement_rate` is labelled self-reported because its provenance is mixed (A4).

## Gaps

- No live sync was run in this pass [U].
- Growth history needs 0025 plus two daily snapshots.
- Per-video storage for top content, posting cadence and consistency is not built.
