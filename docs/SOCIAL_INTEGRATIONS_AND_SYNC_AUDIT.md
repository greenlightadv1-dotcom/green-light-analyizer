# Social integrations and sync audit (re-assessed 2026-11-03)

## Method

- **Official documentation:** read on 2026-11-03 through an external search and fetch, because the sandbox network blocks these hosts. Sources: developers.facebook.com, developers.tiktok.com, dev.twitch.tv, dev.kick.com (and its official docs repository KickEngineering/KickDevDocs), docs.x.com.
- **Code:** read on this branch.
- **Live calls:** no provider API was called with credentials. No OAuth scope was requested and no provider setting was changed.

| Label | Meaning |
|---|---|
| [D] | Current official documentation |
| [C] | Code |
| [U] | Unverified |

## Status in the product (`INTEGRATION_STATUS`, `src/lib/media-kit/platforms.ts`) [C]

| Platform | Product status | Meaning |
|---|---|---|
| YouTube | **Functional** | Public stats by handle, recent uploads (0035), verified audience geography by OAuth |
| Instagram | **Disabled** | No Connect. The OAuth start and callback refuse it. |
| Twitch | **Self-reported** | Creator-entered fields, labelled self-reported |
| Kick | **Self-reported** | Same |
| TikTok | **Planned** | Nothing built |
| X | **Planned** | Nothing built |

A self-reported platform is never shown as connected or verified.

## Per platform

### YouTube

- **API:** Data API v3 (API key) and Analytics API v2 (OAuth).
- **Scopes:** `youtube.readonly` and `yt-analytics.readonly`, both checked at the callback [C].
- **Account metrics:**
  - subscribers, total views, video count [C];
  - per-upload views, likes and comments (likes and comments are omitted when hidden) [C].
- **Audience:** viewer share by country (Analytics, OAuth) [C]. Age and gender are available from Analytics but not built.
- **Content:** last 50 uploads, with top content and cadence (0035) [C].
- **Review:** Google OAuth verification for sensitive scopes. Consent-screen status is unknown [U]. In "Testing" mode, refresh tokens expire after 7 days [D, earlier research].
- **Restrictions:** Developer Policies III.E.4: Non-Authorized Data is kept ≤ 30 days. Implemented (29-day cleanup), but the cron is unscheduled because `CRON_SECRET` is not set.
- **Rate limits:** daily quota of 10,000 units by default. A sync costs about 3 units [C, earlier research].
- **Complexity:** in place.

### Instagram (Meta)

- **API:** Graph API. **Latest is v26.0 (2026-07-29)** [D].
- **Problem:** the code pins **v19.0, which expired on 2026-05-21** [D][C], so every call would fail today. v20.0 expired on 2026-09-24 [D].
- **Account metrics:** `followers_count`, `media_count` [C].
- **Audience:** `follower_demographics` with breakdowns `age`, `city`, `country`, `gender` (timeframes such as `last_30_days` and `last_90_days`). It is not returned under 100 followers [D]. The code still asks for the retired `audience_country` metric [C].
- **Content:** media insights, not built.
- **Review:** Meta App Review for the insights permissions, and a Business or Creator account linked to a Facebook Page [D, earlier research].
- **Restrictions:** Platform Terms [U, not re-read].
- **Rate limits:** Business Use Case rate limits [U].
- **Complexity:** medium. It needs:
  1. a version bump;
  2. a demographics parser;
  3. account binding;
  4. App Review.
- **Kept disabled.** Re-enabling it needs the owner's approval and Meta App Review.

### TikTok

- **API:** Display API v2 (Login Kit).
- **Scopes:** `user.info.basic`, `user.info.stats` (follower, following, likes and video counts) and `video.list` [D].
- **Account metrics:** those counts, for the authorised user only [D].
- **Audience:** **not available**; the Display API has no demographics [D].
- **Content:** the user's own videos (`video.list`) [D].
- **Review:** TikTok app review per scope [D, earlier research].
- **Restrictions:** the Research API is restricted to academic access.
- **Complexity:** low to medium (OAuth, token refresh, two endpoints).
- **Status:** planned and not built. It would be a **synced** source of account counts only, never verified geography.

### Twitch

- **API:** Helix.
- **Account metrics:**
  - follower **total** from `GET /helix/channels/followers`. The total is public; the list of followers needs `moderator:read:followers` [D];
  - live viewer count from `streams`, while live only [D].
- **Audience:** **not available** to third parties [D, earlier research].
- **Content:** VODs and clips (public) [D, earlier research].
- **Review:** none for public data. An app client id is needed.
- **Rate limits:** token bucket of about 800 points a minute [U].
- **Complexity:** low for follower total and live status.
- **Status:** self-reported. A Helix sync of public counts is possible and not built.

### Kick

- **API:** **an official public API exists**, `api.kick.com/public/v1`, with OAuth 2.1 + PKCE at `id.kick.com` and scopes such as `user:read` and `channel:read` [D].
- **Account metrics:** channel info, category, and live status with `viewer_count` [D, from documentation excerpts].
- **Audience:** no demographics documented [D].
- **Complexity:** low to medium.
- **Status:** self-reported. The earlier claim "no official API" in CLAUDE.md §7.3 is **outdated**. A Kick sync could be built; owner decision.

### X

- **API:** X API v2, **pay-per-use only** for new developers. User read costs $0.010 per resource, with no free tier [D].
- **Account metrics:** `public_metrics` (followers and so on) per user read [D].
- **Audience:** not available [U].
- **Restrictions:** paid. Rule 5 forbids activating it without approval.
- **Status:** planned, blocked on a paid service.

## Gaps and owner decisions

1. **Instagram:** upgrade off the expired v19.0 and apply for App Review, or leave it disabled.
2. **Kick and Twitch public-count syncs:** build them, or keep these platforms self-reported.
3. **TikTok Display API integration:** needs app review.
4. **X:** paid, so it is an owner decision.
5. **YouTube:** confirm Google OAuth verification status, and set `CRON_SECRET` so the 29-day cleanup runs.
