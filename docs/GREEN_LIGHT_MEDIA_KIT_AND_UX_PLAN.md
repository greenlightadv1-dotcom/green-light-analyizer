# GREEN LIGHT — Media Kit transformation and zero-confusion UX (audit and plan)

> **Status: plan only. Nothing here is implemented.** Written 2026-10-31
> against branch `claude/eager-gauss-dox9tq` at `4b7f333` (production still
> runs `5580a78`).
>
> - **Freeze.** This work sits outside the CLAUDE.md §16 feature freeze. It
>   needs the owner's explicit approval, stage by stage.
> - **Migrations.** Every schema change listed here needs its own migration,
>   which the owner applies after review, as with 0024.
>
> Evidence labels:
> - **[C]** read from the code at `4b7f333`;
> - **[D]** from provider documentation, to be re-checked before building;
> - **[U]** unverified;
> - **[O]** needs an owner decision.

This document extends, and does not replace, `DESIGN.md` (design system),
`PRODUCT.md`, and `docs/GREEN_LIGHT_IMPLEMENTATION_ROADMAP.md` (features A–M).

---

## 0. Principles that decide every trade-off

1. **Truth before polish.** A number is shown only with its source, period
   and last update. Data that doesn't exist is hidden or explained, never
   estimated to fill a layout. This is §1's "kill screenshot fraud" applied
   to design.
2. **The creator controls what is public.** Visibility is enforced on the
   server, in the public RPC's column list, not only in the UI.
3. **Plain words first; the correct term second, with its meaning.**
4. **Progressive disclosure:** one sentence up front, details on request.
5. **Arabic is a first-class reading experience,** not a translation pass at
   the end.

---

## 1. Where the Media Kit stands today [C]

| Area | Today | Gap |
|---|---|---|
| Identity | `full_name`, `avatar_url` (0024 bucket), `bio`, `country`, `primary_language`, `shareable_slug`, taxonomy (`creator_categories`, `creator_games`, `content_formats`) | No cover image, no professional headline, no specialties beyond the taxonomy |
| Channels | `media_kits` per platform (youtube, twitch, kick, instagram): `platform_handle`, `subscriber_count`, `channel_view_count`, `media_count`, `avg_views`, `avg_ccv`, `engagement_rate`, `content_category`, `content_language`, `content_tags`, `last_synced_at`, `youtube_stats_synced_at` | No channel title or URL, no per-metric source record, no history |
| Audience | `declared_top_countries` (self-reported); `verified_top_countries` (YouTube Analytics, views by country, 90-day window, fresh < 30 days) | No age, gender or city; interests are not available from any connected API |
| Content | `fetchYoutubeRecentVideos` already reads recent uploads (title, thumbnails, statistics) for engagement, but stores nothing | No showcase table, no creator selection |
| Collaborations | `deal_chats` with `deal_status='paid'` exist, but only the parties can see them | No portfolio, no consent model |
| Services | `base_rate_usd` (creator-entered) | No list of collaboration formats offered |
| Public page | `/p/[slug]` through `creator_public_profile(slug)`: name, avatar, bio, country, language, social links, base rate, platform names | No metrics, no visibility controls, no showcase, no call to action beyond what the page shows |
| Completeness | `isProfileIncomplete`, the onboarding checklist and G's assessment each compute completeness | Three overlapping definitions; nothing user-facing shows "why this matters" per item |
| PDF | None; the retired Elite tier advertised one | — |

---

## 2. Media Kit architecture (target)

### 2.1 Sections and their data sources

| # | Section | Data | Source and provenance label | Shown when |
|---|---|---|---|---|
| 1 | Identity header | Cover, avatar, name, `@slug`, headline, categories, games, languages, formats, location | Creator-entered → "Provided by the creator". Location is shown as entered; it is never presented as verified (no API verifies it). | Field present, and visible in public |
| 2 | Channels | One card per platform: name, handle, link, followers/subscribers, connection status, last sync | YouTube API → "Synced from YouTube · {date}"; Twitch/Kick/manual → "Self-reported by the creator" | Kit exists |
| 3 | Performance overview | Subscribers, average views (last N uploads), engagement rate, total views, uploads; publishing consistency (YouTube) | Each metric carries a `MetricSource` and a period (§3) | Value present; otherwise "Not available because…" in the private view, hidden in the public one |
| 4 | Audience insights | Countries (built today); age and gender; cities | YouTube Analytics, verified, window shown | Connected, fresh (< 30 days), and visible |
| 5 | Content showcase | Up to 6 creator-chosen videos: thumbnail, title, platform, views, link | YouTube Data API, refreshed ≤ 30 days (§6) | Creator picked items |
| 6 | Specialties | Taxonomy chips, grouped as Games / Genres / Categories / Formats / Platforms | Creator-entered (controlled list) | Any selected |
| 7 | Collaboration portfolio | Past collaborations | See §2.3: creator-declared, labelled; platform-completed only with consent | Entries exist and consent rules are met |
| 8 | Services | Formats offered (sponsored segment, dedicated video, live stream, product placement, other); optional "starting from" rate | Creator-entered; a rate is shown only if the creator set one | Any selected |
| 9 | Call to action | Public: "Send a collaboration offer on Green Light" (company sign-in, then Discover) or "Request access" for visitors | — | Always, in public |

### 2.2 What is feasible with today's integrations

| Insight | Feasible? | How |
|---|---|---|
| Countries | **Yes, built** | YouTube Analytics `dimensions=country` |
| Age, gender | **Likely, with no new scope** | YouTube Analytics `dimensions=ageGroup` / `gender`, `metrics=viewerPercentage`, on the already-granted `yt-analytics.readonly`. [D, re-check] |
| Cities | **Possibly** | YouTube Analytics `city` dimension; documented restrictions apply. [D, re-check] |
| Interests | **No** | No connected API provides them. Hide the section; never infer it with AI. |
| Growth over time | **Only with new storage or OAuth** | Option A: daily or weekly snapshots table (new migration), so growth appears only after weeks of collection. Option B: YouTube Analytics `subscribersGained`/`subscribersLost` by day (OAuth creators only). |
| Reach, impressions | **YouTube: impressions are not exposed by the public Analytics API for all channels** [U]; Twitch/Kick: no | Hide unless a verified source exists |
| Publishing consistency | **Yes, YouTube** | From upload dates of recent videos (public API), e.g. "Uploaded 9 times in the last 90 days" |
| Instagram, TikTok, X | **No** | Not integrated (see the readiness report); manual numbers only, labelled |

### 2.3 Collaboration portfolio: honest sourcing [O]

- **Creator-declared entries:** brand, category, deliverable, date, link to
  the public content. Labelled "Added by the creator". Brand name only,
  **no logos**, unless the creator confirms they have permission (a
  checkbox stored with the entry).
- **Platform-completed deals** (`paid` in Green Light): shown only when
  - the creator opts in;
  - for in-app deals, the company account also consents (a new consent
    flag); and
  - for email-intake deals there is no company account to ask, so only
    the creator's own declaration applies.

  Then they get a "Completed on Green Light" badge. **No amounts are ever
  shown publicly.**
- **Results** ("+X% sales") are never shown unless attached to a verifiable
  source. Default: not supported in v1.

### 2.4 Public and private views

| Element | Private (creator) | Public `/p/<slug>` | Company (signed in) |
|---|---|---|---|
| Missing data | Explained, with "how to add it" | Hidden | Hidden |
| Self-reported numbers | Labelled | Labelled | Labelled |
| Verified audience | Shown, with freshness | Only if toggled public | Shown in Discover (as today) |
| Email, alias, phone, WhatsApp | Own settings only | **Never** | **Never** |
| Base rate | Shown | Only if toggled public | Only if toggled public |
| Internal data (G assessment, risk ratings, deal history, notes) | Shown to the owner | **Never** | **Never** |
| Completeness score | Shown | **Never** | **Never** |

**Visibility controls:**
- A per-section switch (identity always on; others on or off) stored in
  `profiles.media_kit_visibility jsonb`.
- `creator_public_profile` is rewritten to project only sections whose flag
  is on: a server-enforced, hard-coded column list, the same discipline as
  0017.
- A "Preview as a brand sees it" button opens the public view.

### 2.5 Schema proposal (one migration, for review; not written yet)

- **`profiles`:**
  - `cover_url text` (in the existing public `avatars` bucket, under
    `<uid>/cover-*`);
  - `headline text` (≤ 120);
  - `collaboration_services text[]` (controlled list);
  - `media_kit_visibility jsonb default '{}'`.
  - None granted to `authenticated`; server actions validate them.
- **`media_kit_showcase`:** `creator_id, platform, external_id, position,
  added_at`. The video data itself is re-fetched, not stored (YouTube policy;
  see §6).
- **`collaborations`:** creator-declared, with `brand_name`, `category`,
  `deliverable`, `content_url`, `occurred_on`, `logo_permission boolean`,
  `deal_id null` (link to a paid deal), `company_consent boolean`. RLS: the
  owner reads and writes through the server; public through the RPC only.
- **Optional `media_kit_snapshots`** (growth history), under a retention rule.
- **`creator_public_profile(slug)`:** extended, visibility-aware, still
  excluding every contact and intake column.

### 2.6 PDF export feasibility

| Option | Arabic/RTL | Cost / limits | Verdict |
|---|---|---|---|
| **A. Print stylesheet + browser "Save as PDF"** | Perfect: the browser shapes Arabic and lays out RTL | Free, no dependency; output varies slightly by browser | **Recommended for v1.** The button says "Print or save as PDF", not "Download PDF", so it promises exactly what happens. Include the generation date and only public-visible sections. |
| B. Server-side headless Chromium (`puppeteer-core` + a serverless Chromium build) | Good | Large function bundle on Vercel Hobby, 60s limit, cold starts; heavier maintenance [U] | Later, if a one-click file is required |
| C. `@react-pdf/renderer` | **Weak:** Arabic shaping and bidi are unreliable [U] | Small | Not recommended for an Arabic-first product |

No export button ships until the chosen path works in both languages; the
old "Media Kit PDF export" claim was removed for exactly this reason.

### 2.7 Completeness guidance

- **One definition** (`lib/media-kit/completeness.ts`) replaces the three
  current ones. Each item is `{ id, done, whyItMatters, howToAdd, href }`.
- **Two separate meters:**
  - "Media Kit completeness" (what is filled in);
  - "Data confidence" (how much is verified and fresh).

  A complete kit with self-reported data must not look "strong".
- **Required copy:** "A complete Media Kit helps brands understand you. It
  does not guarantee offers."
- **Never visible** in the public view.

---

## 3. Data provenance and privacy requirements (binding)

1. **Every metric carries its context.** It is rendered through one
   component, `<Metric value source period updatedAt explain />`, and the
   type makes `source`, `period` and `explain` required. Sources: `verified`
   (OAuth Analytics), `synced` (public API), `self_reported`,
   `platform_record` (Green Light's own data), and `missing`. These extend
   the existing `lib/g/provenance.ts`.
2. **Freshness.** Synced and verified values older than 30 days show "Out of
   date — sync again". YouTube data follows the existing deletion cron
   (needs `CRON_SECRET`).
3. **No synthetic numbers.** No AI-generated metrics, no interpolated trends,
   no "estimated reach" unless labelled "Green Light estimate" with its
   method on request. The G grounding check already enforces this for the
   assistant.
4. **Public projection.** The public projection is server-side and
   allow-listed. A test asserts that the public RPC's column list never
   contains contact, intake, risk or deal-amount columns. This extends
   `marketplace-guards.test.ts`.
5. **Third-party content.**
   - Thumbnails and titles link to the original.
   - The YouTube attribution and branding guidelines are followed.
   - Brand logos appear only with recorded permission.

---

## 4. Plain-language terminology audit

### 4.1 Defects found in the code [C]

| # | Where | What a user sees | Problem | Fix |
|---|---|---|---|---|
| T1 | `badges.cappedTooltip` (all languages) | "…the deal is high-value (§7.4)." | Internal spec reference shown to users | "…because the audience data is self-reported and the deal is large. Verified data can lift this limit." |
| T2 | `CompanyDashboardView.tsx` | "Browsing and messaging creators is free (§8)." | Spec reference; the view isn't translated | Plain sentence, translated |
| T3 | `EmptyState` `spec` prop (`DashboardView`, `InboxView`, `CompanyDashboardView`) | Visible labels "§3", "§5, §6.2" | Spec references rendered as UI | Remove the `spec` prop; replace with `why` / `nextAction` (§7) |
| T4 | `errors.errorTitle` | "Something went wrong" | Generic, although the body helps | "This page didn't load" (the body already explains next steps) |
| T5 | UI copy using "alias" (9×), "CCV" (3×), "engine" (3×), "API" (7×) | Jargon | Keep the term, add meaning: "your Green Light forwarding address (alias)", "average live viewers (CCV)" |
| T6 | Admin pages (7 of 7 files) | English only | Arabic admins excluded | Translate (§15 already lists this gap) |
| T7 | Company dashboard | Partly hard-coded English | Inconsistent with the rest | Move to dictionaries |

### 4.2 Glossary (one term, one meaning, every language)

`docs/GLOSSARY.md` will hold the canonical term, a one-line meaning, and the
approved Arabic, French, Spanish and German forms. Dictionary review checks
against it. Seed terms:
- Verified, Synced, Self-reported, Out of date, Not available;
- Media Kit, Forwarding address (alias), Deal room, Offer, Commission;
- Risk rating (Green light / Proceed with care / High risk);
- Average views, Average live viewers, Engagement rate, Audience
  geography;
- Application, Representative, Get set up.

### 4.3 Standard status vocabulary

| Status | Meaning | Next action shown |
|---|---|---|
| Complete | Nothing more needed | — |
| Incomplete | Something required is missing | "Add {thing}" |
| Pending review | Waiting for Green Light's team | "We'll email you" (only if true) |
| Connected | The account link works | "Sync now" |
| Connection expired | Token revoked or expired | "Reconnect YouTube" |
| Needs attention | A problem the user can fix | A specific action |
| Unavailable | Not offered for this platform or browser | Why, plus the alternative |
| Failed | An attempt did not work | What was saved; "Try again" |
| Updating | In progress | — |

Existing vocabularies map onto this table: deal status, integration status,
provenance, onboarding, applications and wake-word states. They keep their
domain words but share colours and icons through one `StatusBadge`.

---

## 5. Screen-by-screen clarity audit (plan)

Each screen is scored against the 10 acceptance questions (§8). Initial
code-based assessment:

| Screen | Purpose in 5s? | Primary action clear? | Known issues |
|---|---|---|---|
| Landing `/` | Yes | Yes ("Get started") | — |
| Get Started | Yes | Yes | Applicants aren't told *when* to expect a reply [O] |
| Login / set password | Yes | Yes | — |
| Creator dashboard | Mostly | Banner points to Get set up | Spec label on the empty state (T3) |
| Onboarding | Yes | Yes | Steps link out; return-to-checklist not guaranteed |
| Deal inbox / room | Mostly | "Generate AI reply" vs "Direct reply" can be confused | Needs a one-line difference: "Draft only" vs "Sends now" |
| Analyzer | Yes | Yes | Risk "capped" tooltip (T1) |
| Media Kit (private) | **No: dense** | Several equal-weight panels | The §2 redesign |
| Public profile `/p` | Partly | No clear call to action | The §2 redesign |
| Discover | Yes | Filters clear | Provenance badges need a legend ("What do these labels mean?") |
| Company dashboard | Partly | "Discover creators" | T2, T3, T7 |
| Pricing / Support | Yes | Yes | — |
| Settings | Mostly | Several sections | Group into Account / Email forwarding / Notifications / Voice |
| G panel | Mostly | Suggestions help | "Hey G" switch wording is long; consent card good |
| Admin pages | Partly | English only | T6; "Create account" from an application is clear |

Method for the full audit: a walkthrough of every route for each role
(creator, company, admin), in English and Arabic, on desktop (1280) and
phone (390). Findings are recorded in a table like the one above, with
screenshots, and prioritised P0 (misleading or untrue) / P1 (blocks a task)
/ P2 (slows a task) / P3 (polish).

---

## 6. External rules that constrain the design [D, re-check before build]

- **YouTube API Services policies.** Data obtained from the API must be
  refreshed or deleted within 30 days, and users must be able to revoke
  access. Attribution and branding guidelines apply to thumbnails and the
  logo. The showcase therefore stores only video IDs and re-fetches the
  data.
- **Brand marks.** Third-party logos are shown only with permission (§2.3).

---

## 7. Empty, loading, error and success state audit (rules)

| State | Rule | Component contract |
|---|---|---|
| Empty | Answers *why it's empty*, *what this area is for*, and *the next step* | `EmptyState({ title, why, nextAction: { label, href } })`; the `spec` prop is removed |
| Loading | A skeleton matching the final layout; a text status for screen readers; no spinner longer than 10s without an explanation | `aria-busy`, `role=status` |
| Error | What failed + whether data was saved + what to do | `ErrorNotice({ what, saved: boolean, next })` |
| Success | What happened + what happens next | `SuccessNotice({ what, next })` |

Known good examples to copy: the Get Started error (keeps the entered data
and says applications aren't open), uploads (retry, plus the exact reason),
and voice errors.

---

## 8. Measurable zero-confusion acceptance criteria

**Automated (in CI):**
1. **No internal references in UI copy.** No `§`, no TODO text, and no
   untranslated raw keys in any dictionary or rendered page. This is a
   dictionary scan plus a crawl of `/preview` routes.
2. **Banned vague labels.** Button text may not be exactly "Manage",
   "Process", "Execute", "Continue", "Submit" or "OK". Enforced by a
   dictionary test plus a JSX lint rule.
3. **Every metric is complete.** `<Metric>` requires `source`, `period` and
   `explain` (type-level), and there are no raw numeric metric renders
   outside it (a source scan).
4. **Every empty state has a next step.** `EmptyState` requires `why` and
   `nextAction` (type-level).
5. **Accessibility.** axe-core reports 0 serious or critical violations on
   every `/preview` route, in English and Arabic, light and dark.
6. **Touch targets.** Interactive elements are at least 44×44 px at phone
   width (Playwright measurement).
7. **Language parity.** Every key exists in five languages (already
   type-checked), and glossary terms map consistently (a test against
   `GLOSSARY.md`).
8. **Public profile privacy.** The public profile never contains email,
   alias, phone, risk, deal amounts or completeness (a source and
   rendered-page test).

**With people (per release with UX changes):**
9. **Five-second test.** Five first-time users per role, per language (English
   and Arabic). At least 4 of 5 must state the screen's purpose and its
   primary action correctly, on each major screen.
10. **Task success.** At least 90% complete these unaided:
    - creator: "connect YouTube and make your kit public";
    - company: "find a gaming creator in Egypt and send an offer";
    - admin: "create an account from an application".

    Median time is recorded.
11. **Error recovery.** At least 90% recover from a forced failure (upload too
    large, offer without company details) without help.
12. **Truthfulness check.** 0 participants believe a self-reported number is
    verified (asked after viewing a mixed kit).

---

## 9. First-time user experience

- **Creator.**
  - First sign-in lands on "Get set up". The first three steps (profile,
    category, platform) take under 5 minutes.
  - After that, a one-line tip per page, dismissible and never repeated,
    stored per user.
- **Company.**
  - A 3-step intro card on the dashboard: company details → Discover →
    send an offer.
  - G suggests "Help me write a campaign brief".
- **Admin.**
  - A checklist on the dashboard: pending applications, accounts needing a
    password reset, `/admin/system` warnings.
- No modal tours; every tip can be dismissed for good.

---

## 10. Roadmap additions (staged; each needs approval)

| Stage | Scope | Migration | Freeze impact |
|---|---|---|---|
| UX-0 | Remove internal spec references (T1–T3), fix the generic error title, glossary seed | None | Could qualify as a §16 blocker ("legal/UI untrue" is borderline). Owner decides. |
| UX-1 | Status vocabulary + `StatusBadge`; `EmptyState`/`ErrorNotice`/`SuccessNotice` contracts; automated criteria 1–4 | None | Outside freeze |
| MK-1 | Private Media Kit redesign (§2.1 sections 1–3, 6, 8) with `<Metric>` provenance; one completeness model | `cover_url`, `headline`, `collaboration_services`, `media_kit_visibility` | Outside freeze |
| MK-2 | Public `/p/<slug>` redesign + visibility controls + "Preview as a brand" | RPC rewrite | Outside freeze |
| MK-3 | Audience age and gender (and cities if confirmed) | None (columns or JSON in `media_kits`) | Outside freeze; re-check Google policy |
| MK-4 | Content showcase | `media_kit_showcase` | Outside freeze |
| MK-5 | Print or save as PDF (option A) | None | Outside freeze |
| MK-6 | Collaboration portfolio + consent | `collaborations` + consent flag | Needs owner decisions §11 |
| MK-7 | Growth history | `media_kit_snapshots` | Optional |
| UX-2 | Admin translation; company dashboard translation; Settings regrouping | None | Outside freeze |
| UX-3 | Usability study (§8 items 9–12) and fixes | — | — |

**UX-0 status (1 November 2026): implemented locally only.** Not committed,
not pushed, not deployed, not verified in production. The two review corrections made after the
first UX-0 report are included below.
- T1: `badges.cappedTooltip` rewritten, no "§". It opens with the badge's own
  word ("Capped at yellow: …"). It names every cause of the cap: the deal is
  high-value and the audience geography is not verified, because it is
  self-reported, missing or older than 30 days. This matches
  `capRiskByVerification` (`lib/ai/rules.ts`) and `isVerifiedGeoFresh`
  (`lib/oauth/youtube-freshness.ts`). It does not promise that connecting an
  account lifts the cap. This supersedes the proposed wording in §4.1's T1 row.
- Analyzer: the same correction in `analyzer.unverifiedCapNote` (the sidebar
  note shown while the creator's geography is unverified) and
  `analyzer.heldAtYellow` (shown on a result that was capped). Both name
  self-reported, missing and stale geography. Neither promises that
  connecting YouTube or Instagram lifts the cap. The sidebar note says only
  YouTube provides verified geography today and Instagram is in development.
- T2: "(§8)" removed from the company dashboard. The view is still English
  only; translating it stays in UX-2.
- T3: `EmptyState`'s `spec` prop and its four callers' labels are removed.
  The `why` / `nextAction` contract moves to UX-1.
- T4, generic error page: `errors.errorTitle` says the page did not load. The
  `errorBody` says to try again and, if the problem continues, to contact
  support with the reference shown, if there is one. It makes no claim about
  previously saved work.
- Ban reason for new bans: "Deliberately attempted to exchange direct contact
  details, or to move a deal off Green Light to avoid commission." It keeps
  the two separate violations of Terms section 8: deliberately attempting to
  exchange direct contact details, and moving a deal off Green Light to avoid
  commission. Only the stored text changed; when a ban happens and who can
  ban are unchanged.
- Also fixed: admin system-status and application messages (no spec
  sections, file paths or migration numbers), and Media Kit sync/save errors
  (no env-var names; each says whether anything was saved). Settings,
  chat-send and Analyzer deal-room errors were fixed too.
- All copy changes are in all five dictionaries (en, ar, fr, es, de). No keys
  were added, removed or renamed.
- Unchanged: rating logic, ban mechanics, permissions, database schema,
  historical ban records and every remote system. Existing `banned_reason`
  rows keep their old text.
- Guard: `src/lib/ux-copy.test.ts` fails on:
  - any visible "§" (the privacy policy's CCPA citation excepted);
  - "Something went wrong";
  - migration numbers or source paths in strings;
  - env-var names in action errors or dictionaries;
  - an `EmptyState` `spec` label.
- Not done: the glossary seed (moved to UX-1). The translated strings have not
  been reviewed by native speakers.

**Recommended order:** UX-0 → UX-1 → MK-1 → MK-2 → MK-5 → MK-3 → MK-4 → UX-2
→ MK-6 → MK-7, with UX-3 after MK-2.

---

## 11. Owner decisions needed

1. Lift the §16 freeze for this programme, or keep UX-0 only until launch.
2. Portfolio: allow creator-declared brand names? Logos only with a
   permission checkbox? Require company consent for platform-completed
   deals?
3. Public profile default: every optional section off, so the creator opts
   in (recommended), or on?
4. Show `base_rate_usd` publicly at all, even when the creator opts in?
   (Risk: it anchors negotiations.)
5. PDF: accept "Print or save as PDF" for v1, or fund a server-rendered PDF?
6. Growth history: start collecting snapshots now, so growth can be shown
   later?
7. Who runs the usability sessions (§8 items 9–12), and in which markets?
8. Public call to action for signed-out visitors: "Request access" or a
   contact form, which is masked and goes through Green Light.
