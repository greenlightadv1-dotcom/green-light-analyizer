# Green Light market brief — 22 Oct 2026

Written with the `growth-research` skill (`.claude/skills/growth-research/`).
**Every proposal here is post-launch under the CLAUDE.md §16 feature freeze.**
Nothing is built until the owner says "ship <name>". P1 is the one case
where the owner may decide it is a launch blocker; see its *Freeze* line.

## What the market is telling us

| # | Finding | Source |
|---|---|---|
| 1 | **YouTube changed what a "view" is on 24 Aug 2026.** A public view now counts from the first frame, including feed autoplay. The old definition was renamed *engaged views*, and it is visible only in YouTube Studio and to apps with permissioned channel access. Across 75k+ videos, engaged views were **60%** of public views, **54% for micro channels** (under 50k views) and **46% in Technology**. Pricing on public views overpays by about 67%. | [Agentio data, Sep 2026](https://www.agentio.com/blog/youtube-new-view-count-60-engaged-view-rate) |
| 2 | `engagedViews` is a **core metric** of the YouTube Analytics API, available per video. It sits under the `yt-analytics.readonly` scope Green Light already requests. | [Google: Analytics metrics](https://developers.google.com/youtube/analytics/metrics) |
| 3 | Our closest thesis-twin raised a **$40M Series B**. Agentio is a closed marketplace of API-connected creators, vetted on real audience data, priced on expected 30-day views and reported automatically. About 40% of views arrive 30+ days after go-live. | [Agentio](https://www.agentio.com/blog/what-to-look-for-in-a-creator-marketing-platform-in-2026) |
| 4 | ThoughtLeaders: 25k+ collaborations, $50M+ in creator deals, a 3-day proposal turnaround, managed contracts and payouts, and live views/CPV dashboards. | [thoughtleaders.io](https://www.thoughtleaders.io/) |
| 5 | **Usage rights are now a priced line item.** 77% of brands reuse creator content in paid ads, and 67% put paid usage in the initial contract. Creators charge **15–35% of base rate per 30 days**, and 30-day windows are becoming the baseline. | [Aspire survey of ~900 marketers and creators, 2026](https://www.aspire.io/blog/how-brands-and-creators-are-navigating-content-usage-rights-in-2026) |
| 6 | TikTok One: no platform fee. **One Pay** (Sept 2026) pays creators in under 30 days with no commission. Content Suite requests up to 365 days of ad usage in one click. | [Billo citing Tubefilter](https://billo.app/blog/tiktok-creator-marketplace/), [TikTok](https://ads.tiktok.com/business/en-US/blog/tiktok-one-creative-platform) |
| 7 | Up to **87% of creators** have been paid late or had payment issues. | [Campaign, citing Tipalti/Lumanu](https://www.campaignlive.com/article/new-campaign-report-reveals-why-creators-arent-getting-paid-time/1930824) |
| 8 | Take rates: Collabstr charges brands 10% (5% on Premium) plus creators 15%. Passionfroot takes 15% on deals it sources. Green Light takes 5–15% in total. | [Collabstr pricing](https://collabstr.com/pricing), [CreatorStackClub](https://www.creatorstackclub.com/software/collabstr) |
| 9 | **UAE:** from 1 Feb 2026, anyone publishing advertising content in the UAE needs a Media Council Advertiser Permit, and brands are told to contract only permitted creators. KSA has its own regime (Mawthooq), still to be confirmed with counsel. | [Lexology](https://www.lexology.com/library/detail.aspx?g=fc922d9b-8ca9-4e93-9479-e644d512458e), [UAE Media Council](https://uaemc.gov.ae/en/%D8%AA%D8%B5%D8%B1%D9%8A%D8%AD-%D9%85%D8%B9%D9%84%D9%86/) |
| 10 | The GCC influencer market was $315.5M in 2025, projected to reach $771.6M by 2032. It is Arabic-first, and Snapchat is a top-3 platform in KSA. | [Kolsquare](https://www.kolsquare.com/en/blog/influencer-marketing-in-the-middle-east-in-2026-high-stakes-high-spend-and-the-arabic-first-imperative), [Valors](https://valors.agency/best-influencer-marketing-agencies-mena) |
| 11 | Performance pay is contested. One report says 53% of deals tie pay to sales. Collabstr's own marketplace data says only "at least 7%" of campaigns add a commission. I treat this as unproven. | [IMF via metamusicmedia](https://metamusicmedia.com/blogs/news/brand-deals-2026-performance-pay-majority), [Collabstr](https://collabstr.com/blog/performance-based-influencer-marketing) |

**What it means for Green Light.** Don't fight TikTok on TikTok: it is free
there and pays fast. Win where it is absent, by being *the verified,
payment-protected way to book MENA and YouTube creators, priced on
attention, not autoplay*.

One finding is about us, not the market. `media_kits.avg_views` (the
Co-Pilot's main pricing input, and the number companies see in Discover)
is **typed in by the creator**. The YouTube sync writes subscribers, total
channel views and engagement rate, but never average views. Discover does
disclose this at page level, so it is not a §16 violation. But it is the
weakest point of value proposition #1, and finding 1 makes even a correctly
synced public average overstate attention.

## Proposals, ranked

| | Proposal | Value | Effort | Freeze |
|---|---|---|---|---|
| P1 | Verified reach: price on engaged views | High | ~3 days | Owner decides: blocker or first post-launch |
| P2 | Go-live verification + 7/30/90-day verified report | High | ~4 days | Post-launch |
| P3 | Licensed-creator badge (UAE Advertiser Permit) | High in MENA | ~2 days | Post-launch |
| P4 | Usage rights & exclusivity, priced by the Co-Pilot | Med–High | ~1.5–2 days | Post-launch |
| P5 | "Payment-protected" positioning and take-rate comparison | Medium | ~0.5 day (copy) | Post-launch |

---

### P1 · Verified reach: price on engaged views · value H · effort ~3 days · freeze: owner decides

**Evidence.**
- Findings 1–3: public views overstate attention by about 1.7× since
  24 Aug, and by about 1.85× for micro channels.
- `engagedViews` is available under our existing scope.
- Today our pricing input is self-reported (see above).

**Fit.** Value propositions #1 (no self-reporting) and #3 (a Co-Pilot price
you can trust). This is the exact edge Agentio raised $40M on, applied to
MENA.

**Plan.**
1. **Migration `0023_verified_reach.sql`.**
   - On `media_kits`, add `public_avg_views int`, `engaged_avg_views int`,
     `engaged_view_rate numeric(4,3)` and `reach_synced_at timestamptz`. No
     grant to `authenticated`; grants on this table are already
     column-level.
   - Recreate `creator_directory()` with two new output columns:
     `reach_views` and `reach_source ('engaged' | 'public' | 'declared')`.
     The return type changes, so it is `drop function` + `create`, then
     re-grant `execute` to `authenticated` and keep it revoked from `anon`
     (0011).
2. **`src/lib/youtube/reach.ts` (pure).**
   - `parseIsoDuration`: `PT1H2M3S` → seconds.
   - `isLongForm`: longer than 180s, because Shorts can now run up to 3
     minutes.
   - `median`.
   - `eligibleUploads`: published at least 7 days ago, at most 10.
   - `pickReach({engaged, public, declared})`: precedence
     engaged > public > declared.
3. **`src/lib/youtube/client.ts`.** `fetchVideoDetails` also requests
   `contentDetails` (for duration) and `snippet.publishedAt`. The channel
   sync computes the median public views of eligible uploads.
4. **`src/lib/oauth/youtube.ts`.** Add `fetchEngagedViews(token, channelId,
   videoIds)`. It calls `reports?ids=channel==…&metrics=views,engagedViews&dimensions=video&filters=video==id1,id2…`
   and returns the median engaged views and the rate (Σengaged / Σviews).
   On disconnect it sets `engaged_avg_views` and `engaged_view_rate` to
   `null` (§12).
5. **Writes.** The sync in `media-kit/actions.ts` writes the new columns
   through the **service role**, scoped to `requireProfile().id`. The user
   client cannot write them.
6. **Pricing.**
   - `EvaluationInput` gains `reach_source`, and `avg_views` becomes
     `pickReach(...)`.
   - Engaged views are priced as-is.
   - Public views are priced at public × `ENGAGED_RATE_ESTIMATE`, shown as
     "estimated attention" in `reasoning`. *Owner decision:* the default
     is 0.6, from finding 1.
   - Declared views: extend §7.4's cap, so self-reported reach never yields
     **green** on a high-value deal.
   - `price-model.ts` tells the model which source it is reading.
7. **UI.** A reach badge in Discover, the deal sidebar and the Media Kit:
   "Engaged · verified", "Public · YouTube API" or "Self-reported". It
   reuses the existing verified/self-reported badge styles. i18n keys go
   in all five dictionaries.

**Security.**
- **Writes:** server-only (service role), validated.
- **Grants:** the new columns are absent from `authenticated`'s grants.
  Companies read reach only through `creator_directory()`, whose column
  list is hard-coded and adds exactly `reach_views` and `reach_source`.
- **Client values:** none. Reach is never taken from the browser.
- **Masking:** not applicable (no free text).
- **Outbound:** Google APIs only, with IDs from our own uploads list.
- **Rate limit:** reuse the existing sync action's limit.
- **Logs:** quota or HTTP errors through `log.warn`, never response
  bodies.
- **Revocation:** disconnect clears the engaged fields.

**Tests.**
- **`reach.test.ts`:**
  - ISO durations, including `PT59S`, `PT3M`, `PT1H`, and malformed input;
  - Shorts excluded, and uploads under 7 days old excluded;
  - median for odd counts, even counts and an empty list;
  - `pickReach` precedence and null handling.
- **`evaluate` tests:**
  - declared reach plus a high-value offer is capped at yellow;
  - the public path applies the estimate and says so;
  - the engaged path applies no discount.
- **Rolled-back live-schema test:**
  - `authenticated` updating `public_avg_views` is refused;
  - `creator_directory()` exposes `reach_source` and nothing else new.
- **Disconnect:** the update payload clears both engaged fields.

**Owner action.**
- Approve the 0.6 public-view estimate, or choose to show public views
  without discounting them.
- Google OAuth verification (already on the launch checklist) unlocks the
  engaged path.

**Freeze.** This isn't a §16 blocker as written: the number is disclosed
as self-reported. But it is the central input to the core product, so it
is the owner's call. My recommendation is to ship it first after launch.
If launch slips for other reasons, pull it in.

---

### P2 · Go-live verification + verified 7/30/90-day report · value H · effort ~4 days · freeze: post-launch

**Evidence.**
- Finding 7: late payment is the norm.
- Findings 3–4: automatic performance reporting is table stakes at the
  high end.
- About 40% of views arrive after day 30, so a day-7 screenshot undersells
  the deal.

**Fit.**
- Value proposition #1: the brand's report comes from the API, not a
  screenshot.
- It strengthens §12's escrow: admin sees "delivery verified" before
  marking a deal paid. That shortens payout and cuts disputes.

**Plan.**
1. **Migration `0024_deal_deliverables.sql`.**
   - New table `deal_deliverables`:
     - `id`; `chat_id` (FK to `deal_chats`, on delete cascade);
     - `platform text check (platform in ('youtube'))`;
     - `video_id text not null`;
     - `submitted_by`, `submitted_at`;
     - `verified_at`, `verification_error`, `published_at`;
     - `snapshots jsonb default '[]'`;
     - `unique (chat_id, video_id)`.
   - RLS on, with a select policy of
     `private.is_deal_participant(chat_id) or private.is_admin()`. There
     are **no write grants**; it follows 0022's model.
2. **`src/lib/youtube/video-url.ts` (pure).** `parseYoutubeVideoId(url)`:
   - Accept `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/live/` and
     `m.youtube.com`.
   - Use an exact host allowlist.
   - Require an 11-character `[A-Za-z0-9_-]` ID.
   - Everything else returns null.
3. **Server action `submitDeliverable(chatId, url)`.**
   - The caller must be the deal's creator, and the status must be
     `agreed`.
   - Calls `videos.list?part=snippet,status&id=…` and verifies:
     - `snippet.channelId` matches the creator's channel. Use
       `oauth_connections.external_account_id`, or else resolve
       `media_kits.platform_handle` through `channels.list`.
     - `privacyStatus` is `public`.
     - `publishedAt` is on or after the deal's `created_at`.
   - Stores `verified_at` or `verification_error`.
   - Posts a "Deliverable live · verified" system message.
   - Gets a `consumeRateLimit("deliverable_submit")` rule.
4. **Cron `GET /api/cron/deliverable-snapshots`.**
   - A daily schedule in a new `vercel.json`. *Confirm the Hobby cron
     frequency in Vercel → Settings → Cron Jobs.*
   - Requires `Authorization: Bearer ${CRON_SECRET}`, compared in constant
     time.
   - Pure `dueSnapshots(publishedAt, snapshots, now)` picks the
     deliverables owed a day-7, 30 or 90 snapshot.
   - Fetches them with batched `videos.list` statistics (at most 50 IDs per
     call), plus `engagedViews` when OAuth is connected (P1), and appends
     `{day, views, engaged?, likes, comments, at}`.
5. **UI.**
   - A "Deliverables" panel in the deal room: the creator submits, and both
     sides see status and snapshots.
   - Admin's status control shows "Delivery verified ✓" beside *Mark
     paid*.
   - The same report is shown to the company.

**Security.**
- **SSRF:** we never fetch the submitted URL. We parse an ID and call
  Google's API by ID.
- **Ownership:** the channel check stops a creator claiming someone else's
  video.
- **Cron:** requires the secret, otherwise 401, logged through `log.warn`.
- **Writes:** service role only. Participants can't insert directly
  (0022's pattern).
- **Masking:** a YouTube URL is not a masked handle, and the company
  already sees the creator's platforms in Discover. No contact details are
  added.
- **Rate limit:** on submit.
- **Logs:** carry IDs only.

**Tests.**
- **`video-url.test.ts`:**
  - the five accepted URL shapes, with and without extra query params;
  - rejects `youtube.com.evil.com`, `evil.com/youtube.com/watch?v=`,
    `javascript:`, and 10- or 12-character IDs.
- **`verifyDelivery`** with mocked API responses: channel mismatch,
  private, unlisted, before the deal date, and OK.
- **`dueSnapshots`:** day boundaries, and idempotency when re-run the same
  day.
- **Cron auth:** missing, wrong and correct bearer.
- **Rolled-back RLS test:**
  - a non-participant reads 0 rows;
  - a participant's direct insert is refused.

**Owner action.** Add `CRON_SECRET` in Vercel.

---

### P3 · Licensed-creator badge (UAE Advertiser Permit) · value H in MENA · effort ~2 days · freeze: post-launch

**Evidence.** Finding 9: since 1 Feb 2026 a UAE brand must use permitted
creators, and it carries the liability. Nobody in our competitor set shows
this as a verified badge.

**Fit.** The MENA position, and value proposition #1 (verified, not
claimed).

**Plan.**
1. **Migration `0025_creator_licences.sql`.**
   - New table `creator_licences`:
     - `id`, `creator_id`;
     - `jurisdiction text check (jurisdiction in ('AE','SA'))`;
     - `permit_number text check (char_length between 3 and 64)`;
     - `expires_on date`;
     - `status text check (status in ('pending','verified','rejected')) default 'pending'`;
     - `reviewed_by`, `reviewed_at`;
     - `unique (creator_id, jurisdiction)`.
   - RLS: a select policy of `creator_id = auth.uid() or is_admin()`. **No
     write grants.**
   - `creator_directory()` gains `licensed_in text[]`: jurisdictions where
     status is `verified` and `expires_on` is null or in the future. It
     never returns the permit number.
2. **Settings (creator).** An "Advertising licences" card →
   `submitLicence`.
   - `requireRole('creator')`; validate input; upsert with status
     `pending` through the service role.
3. **`/admin/licences`.** A pending queue with verify and reject buttons
   (`requireRole('admin')`), and a link to the Media Council's public
   lookup for the manual check.
4. **Discover.** A "Licensed · UAE" badge and filter.
5. **Co-Pilot.** If `target_countries` includes AE and the creator has no
   active AE licence, add the risk note "Brand compliance: no verified UAE
   Advertiser Permit". Whether it also caps the rating at yellow is an
   owner decision.
6. **Privacy policy.** Mention that permit numbers are stored for
   compliance checks.

**Security.**
- Permit numbers are visible to the creator and admins only. Companies see
  the badge.
- `status` is server-set.
- No document uploads in v1, so no ID scans are stored.
- Expiry is computed at read time, so a stale cron can't leave a badge
  showing.

**Tests.**
- `isLicenceActive(licence, today)`, including expiry-day edges;
  `validatePermitNumber`.
- Rolled-back RLS test:
  - a company reads 0 rows;
  - a creator can't set `verified`;
  - the directory exposes jurisdictions only.

**Owner action.** Confirm the KSA regime and wording with counsel (I've
verified the UAE only), then add the privacy-policy line.

---

### P4 · Usage rights & exclusivity, priced by the Co-Pilot · value M–H · effort ~1.5–2 days · freeze: post-launch

**Evidence.**
- Finding 5: usage rights are a standard line item, and creators charge
  15–35% of base rate per 30 days.
- Finding 6: TikTok normalises asking for 365 days in one click, which is
  exactly where creators under-charge.

**Fit.** Value proposition #3. The Co-Pilot protects the creator from
giving away paid usage for free.

**Plan.**
1. **Migration `0026_usage_terms.sql`.** On `deal_chats`, add:
   - `usage_rights_days int default 0 check (0..365)`;
   - `usage_platforms text[] default '{}'`, a subset of
     `youtube, instagram, tiktok, meta_ads, tiktok_ads`;
   - `exclusivity_days int default 0 check (0..365)`.

   All server-only.
2. **Forms.** Fields on the Discover `OfferPanel` and the Manual Analyzer.
   Parsing in the actions is bounded.
3. **`offer-quote.ts`.**
   - Add the three fields to `OfferQuote`.
   - Bump the canonical label to `offer-quote-v2`, so v1 tokens fail
     closed.
4. **Pricing.**
   - Usage premium: base × `USAGE_RATE_PER_30D` (0.25, the middle of
     15–35%) × ceil(days ÷ 30).
   - Exclusivity premium: base × `EXCLUSIVITY_RATE_PER_30D`. *Owner-tunable;
     there is no hard data for this one.*
   - The `reasoning` text shows the breakdown, and the model prompt
     includes the terms.
5. **Deal room.** The sidebar shows the terms, and the reply template
   names the usage fee.

**Security.**
- The terms are inside the HMAC, so they can't change between preview and
  send.
- Bounds are checked server-side, and the columns are server-only.

**Tests.**
- Premium arithmetic: 0, 30, 31 and 365 days.
- Quote v2 tampering: changing days or platforms is refused, and a v1
  token is rejected.
- Out-of-range parsing is clamped or refused.

---

### P5 · "Payment-protected" positioning · value M · effort ~0.5 day · freeze: post-launch

**Evidence.**
- Finding 7: late payment is the norm.
- Finding 8: a brand on Collabstr pays 10% and the creator gives up
  another 15%.

**Plan.** Copy only, on `/pricing` and the landing page:
- "Payment-protected. The brand pays into escrow, and funds release when
  delivery is verified." The word *verified* only after P2 ships; until
  then, "held by Green Light".
- A dated, sourced take-rate comparison.

**Security.** None. Comparative claims must be accurate and dated, so the
owner (or a lawyer) signs off on the wording.

**Tests.** The i18n dictionaries type-check across all five languages.

---

## Watch list (not proposed yet)

- **Performance and affiliate hybrids.** The evidence conflicts (finding
  11). Revisit once we see real offers.
- **Snapchat for KSA.** It would be declared-only, like Twitch, since there
  is no audience API. It needs a `platform` check change.
- **Meta Partnership Ads and Spark codes as deal terms.** They follow
  naturally from P4.
- **TikTok One Pay.** If it reaches MENA, that strengthens the case for P2
  and P5, not for competing on fees.

## Ship first after launch

1. **P1.** It fixes the number everything else is priced on.
2. **P2.** It turns escrow into "verified delivery", which competitors
   sell as their headline.
3. **P3 or P4, depending on who the first paying customers are.** P3 if
   they are UAE brands; P4 if they are YouTube creators.
