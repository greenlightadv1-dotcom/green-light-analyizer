# Master implementation audit

Prepared 2 November 2026 on branch `claude/eager-gauss-dox9tq`. Evidence labels:
**[C]** read in code, **[T]** covered by an automated test that passed today,
**[B]** browser-tested locally against `/preview` (invented data, no database),
**[DB]** checked read-only against the live Supabase project, **[D]** official
provider documentation, **[U]** unverified.

Statuses follow the release brief:
- **COMPLETE**: verified implementation and tests.
- **PARTIAL**: some functionality exists.
- **MISSING**: nothing meaningful exists.
- **BLOCKED**: needs an external approval, legal detail or owner decision.
- **NEEDS VERIFICATION**: built, but not verified in Production.

A local test or build is never treated as proof of Production behaviour.

## Branch and history

- **`main`:** `5580a78`. Production per CLAUDE.md §16 [U: not re-checked in Vercel].
- **This branch:** `main` plus 8 commits:
  - `9a627c3` docs;
  - `856fa16` mobile drawer;
  - `4b7f333` unified plan / Get Started / onboarding / Discovery v2 / G;
  - `a056163` UX-0;
  - `52eaade` Phase 1 design system and confirmations;
  - `e50f503` audit fixes;
  - `ecda076` growth snapshots and print-to-PDF;
  - the documentation commit.

  `main` is an ancestor of the branch, so a fast-forward is possible.
- **Everything after `5580a78` is not in Production.** That includes the large `4b7f333` release and its new Terms and Privacy policy.

## Live database (read-only, 2 November 2026) [DB]

- **Migration history:** lists 0001–0023.
- **0024:** applied through the SQL Editor, so it is absent from the history. Its objects are present: `access_requests`, `company_members`, `profiles.creator_categories`, both storage buckets and `creator_directory()`.
- **0025:** `media_kit_snapshots` does not exist; 0025 has not been applied.

## Feature status

### Accounts, onboarding, roles

| Feature | Status | Evidence |
|---|---|---|
| Admin-created accounts, forced first-login reset | COMPLETE (code) / NEEDS VERIFICATION (Production) | `admin/users/actions.ts` `createUser`; `lib/supabase/session.ts:107-113`; `marketplace-guards.test.ts` [T] |
| Get Started applications, admin review | COMPLETE / NEEDS VERIFICATION | `get-started/**`, `admin/requests/**`, `lib/access-requests.ts` [C][T]; 0024 [DB] |
| Representatives (link only, no deal access) | COMPLETE / NEEDS VERIFICATION | `company_members` [DB]; `admin/requests/actions.ts` [C][T] |
| Creator and company onboarding checklist | COMPLETE | `lib/onboarding.ts`, `/onboarding` [C][T][B] |
| Representative authority for financial commitments | MISSING | No permission model beyond the link |
| Account self-deletion | MISSING | Admin deletion only |
| Settings: name, password, WhatsApp | COMPLETE | `settings/actions.ts`; errors translated today [T] |

### Creator

| Feature | Status | Evidence |
|---|---|---|
| Creator profile and public `/p/<slug>` (no contact or audience data) | COMPLETE / NEEDS VERIFICATION | 0017 RPC; `app/p/[slug]/page.tsx` |
| Per-section public visibility toggles | MISSING | No column; needs a migration |
| Social connections: YouTube | PARTIAL / BLOCKED | OAuth and stats sync in code; Google OAuth verification pending; no live sync observed [U] |
| Social connections: Instagram | BLOCKED | Disabled on the server (`oauth/[platform]/start/route.ts:49-52`); code pinned to Graph `v19.0` (`lib/oauth/instagram.ts:16-17`), needs migrating before enabling |
| Social connections: Twitch, Kick | PARTIAL | Self-reported only, labelled |
| Social connections: TikTok, X | MISSING | Status "planned" |
| Channel analysis (strengths, weaknesses, opportunities) | PARTIAL | G assessment (`lib/g/assessment.ts`) [T]; no dedicated screen |
| Audience geography | PARTIAL / BLOCKED | Verified only via YouTube Analytics OAuth (Google review); 30-day freshness rule [T] |
| Demographics (age, gender) | MISSING / BLOCKED | Needs the same Google review |
| Historical growth from real snapshots | COMPLETE (code) / NEEDS VERIFICATION (Production) | Migration 0025; `lib/media-kit/growth.ts`; `growth.test.ts`, `snapshot-guards.test.ts` [T]; `supabase/tests/media_kit_snapshots_test.sql` [T local DB]; Media Kit growth summary [B]. 29-day window by YouTube policy [D]. 0025 not applied. |
| Content ideas, hooks, scripts, titles, plans; saved drafts | MISSING | No module or table |
| Media Kit page | PARTIAL | Per-platform kits and profile card; no portfolio or collaboration history |
| Media Kit PDF v1 (browser print) | COMPLETE (code) / NEEDS VERIFICATION | `components/ui/PrintButton.tsx` on `/p/<slug>`; print stylesheet [B via print emulation]; `/p/<slug>` needs a database, so the button itself is not browser-tested |
| Portfolio, past work, collaboration history with consent | MISSING | Needs a migration and consent rules |
| Pricing info and availability | PARTIAL | `base_rate_usd`; no availability field |
| Offer Analyzer (price and risk) | COMPLETE / NEEDS VERIFICATION | `analyzer/*`, `lib/ai/*` [T] |
| Deal inbox and masked chat | COMPLETE / NEEDS VERIFICATION | `inbox/**`, `lib/mask.ts` [T] |
| Support page (creators and admins) | PARTIAL | Contact channels only; no tickets |

### Company

| Feature | Status | Evidence |
|---|---|---|
| Company onboarding (details gate offers) | COMPLETE | `lib/onboarding.ts` [T] |
| Discovery: filters, sort, pagination, provenance | COMPLETE / NEEDS VERIFICATION | `lib/discovery.ts` [T]; Pagination component [C]; not browser-tested (company role has no preview) |
| Comparison | PARTIAL | Through G only; no saved shortlist |
| Shortlists / saved creators | MISSING | Needs a migration |
| Recommendations from real data | PARTIAL | `lib/g/recommend.ts` [T] |
| Briefs and campaigns | BUILT, NOT APPLIED | Migration 0026; `/briefs` [T][B on preview] |
| Invitations, accept/decline/negotiate as an entity | BUILT, NOT APPLIED | 0026 invitations; `/opportunities`. Discover offers are unchanged |
| Company dashboard (translated) | COMPLETE | Phase 1 [C][T]; not browser-tested |

### Collaboration lifecycle

| Step | Status |
|---|---|
| Brief → discover → compare | BUILT, NOT APPLIED (0026): companies publish briefs, creators see them in `/opportunities` |
| Invitation → creator review → accept/decline/request changes | BUILT, NOT APPLIED (0026); accepting opens a deal room |
| Terms agreed, status transitions | COMPLETE for deal status: `new`/`negotiating`/`agreed`/`disputed`, admin-only `paid`, enforced on the server (`inbox/[chatId]/actions.ts:181-217`) [T] |
| Terms proposed and confirmed by both sides | BUILT, NOT APPLIED (0026); confirmation freezes the terms and marks the deal room agreed |
| Deliverables, revisions, approvals, completion | BUILT, NOT APPLIED (0026). Reviews: owner decision |
| History retained under access rules | BUILT, NOT APPLIED (0026): append-only `collaboration_events` |

### G assistant

| Feature | Status | Evidence |
|---|---|---|
| Text chat, role-aware, grounded figures | COMPLETE / NEEDS VERIFICATION | `lib/g/*` [T]; NVIDIA with rules fallback |
| Actions: navigation only, user-pressed | COMPLETE | `lib/g/actions.ts` [T]. G executes nothing; every action is a button the user presses. |
| Drafts and proposals with confirmation | MISSING | No non-navigation actions exist yet |
| Voice: push-to-talk, states, interrupt | COMPLETE (simulated) / NEEDS VERIFICATION (real mic) | `g-voice-e2e.mjs` 18/18 [B, simulated] |
| "Hey G" opt-in wake phrase | COMPLETE (simulated) / NEEDS VERIFICATION | `g-wake-e2e.mjs` 31/31 [B, simulated] |
| Language detection, replies in the user's language | PARTIAL | Follows the site language; no per-message detection [C] |
| Arabic and Egyptian Arabic quality benchmark | MISSING | Not run: needs the NVIDIA key and spends quota |

### Support, notifications, admin

| Feature | Status |
|---|---|
| Support tickets | MISSING |
| In-app notifications, read/unread | MISSING (WhatsApp new-deal alert only) |
| Inbox read/unread | MISSING |
| Admin: users, applications, violations, system, promo codes (read-only) | COMPLETE / NEEDS VERIFICATION; confirmations and real results [T]; users/requests/promo page text still English |
| Durable audit for violation ban/dismiss, application reject, representative unlink | BLOCKED (owner decision, see PENDING_OWNER_DECISIONS.md) |

### Monetization and legal

| Feature | Status |
|---|---|
| Unified Creator Plan, 10% commission, Company Access free, manual settlement | COMPLETE in code and copy (`lib/plans.ts`, `pricing-copy.test.ts`) [T] |
| Subscription prices | Intentionally none; needs a cost model (not done) |
| Legal operator details | BLOCKED (`lib/constants/legal.ts:36,44,51` are empty) |
| Legal and commission effective dates | BLOCKED (both are 31 October 2026, now in the past) |

## Platform integrations

Source: `docs/GREEN_LIGHT_INTEGRATION_STATUS.md` (29 October) and code. The YouTube retention rule was re-read today [D].

| Platform | API in code | What it gives | Approval | Status |
|---|---|---|---|---|
| YouTube | Data API v3 (API key) | Public channel stats, recent videos | None (quota) | Non-Authorized Data: 30-day storage limit [D]; enforced by the cron (needs `CRON_SECRET`) and by the snapshot pruning |
| YouTube | Analytics API (OAuth `yt-analytics.readonly`) | Views by country | Google OAuth verification | BLOCKED by the review; query fixed in code [C], no live success observed [U] |
| Instagram | Graph API v19.0 (code) | Followers, media, audience country | Meta App Review; a current API version | BLOCKED; must be migrated off `v19.0` before enabling |
| TikTok | none | Display API: own-account basics only. The Research API is academic, not commercial. | App review | MISSING / BLOCKED |
| Twitch | none (self-reported) | Helix basics with an app token; no viewer geography | Developer app | MISSING (manual only) |
| Kick | none | Public API capabilities need checking against current docs [U] | — | Manual only |
| X | none | Paid API tiers | Cost decision | MISSING / BLOCKED |

## Security review summary (this pass)

- **Server-side authorization:** every confirmed admin action and the deal-status change re-check the role on the server, re-read their writes and return translated error keys [T].
- **RLS:** unchanged. 0025 adds a table that only the server can write, with an owner-or-admin read policy [T local DB].
- **Remaining gaps:**
  - violation, reject and unlink actions leave no durable audit (owner decision);
  - the users-page ban/unban and its audit row aren't atomic;
  - `banProfile` doesn't stop an admin banning another admin;
  - several older client components format dates in the browser's locale (`HeldDeliveriesPanel`, `CompanyIntelligencePanel`, `DealRoom`), a possible hydration warning only.

## Recommended implementation order

1. Owner decisions: legal dates and details, `CRON_SECRET`, the audit design.
2. Apply 0025 in Production, after the code that uses it is deployed or alongside it.
3. Collaboration core: built on the branch as migration 0026 (not applied); needs review, then application.
4. In-app notifications and inbox read state.
5. Support tickets.
6. Content planning with saved drafts.
7. Portfolio and visibility controls.
8. Company shortlists.
9. Platform integrations as approvals arrive.
