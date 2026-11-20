# Product completeness audit

**Branch:** `claude/eager-gauss-dox9tq` at `1e8db30`, 2026-11-20. This is an audit only: nothing was implemented, migrated, merged or deployed.

**Method:** I read the routes, server actions, database functions, migrations, G modules and test scripts in the repository. I cross-checked them against the existing release documents (`MASTER_IMPLEMENTATION_AUDIT`, `MISSING_FEATURES_MATRIX`, `PENDING_OWNER_DECISIONS` §1–16, `MALWARE_SCANNING_REQUIREMENT`, and `docs/G/*`). A page or button existing was not taken as proof that the feature works. A feature is graded COMPLETE only when its behaviour and a meaningful test exist.

## Classification

| Label | Meaning |
|---|---|
| **COMPLETE** | Implemented end to end, with automated tests that exercise the behaviour (unit, SQL or browser on the isolated stack) |
| **PARTIAL** | Works, but a part the intended journey needs is missing or restricted |
| **MISSING** | No implementation |
| **BROKEN** | Implemented, but it does not work as intended in the current state |
| **UNVERIFIED** | Implemented, but never exercised against the real external service or in the real environment |

## Read this first: the deployment gap

Everything below describes the **branch**, not production.

- **Production** runs `5580a78`, with migrations up to **0024**.
- **The branch** adds migrations **0025–0041**, which are applied nowhere except the isolated test stack. Those migrations cover:
  - collaborations, notifications, shortlists, portfolio and content;
  - verification and activation;
  - taxonomy, representative scopes and analytics;
  - the relay lifecycle and official news;
  - registration trust, review notes and flags, the second reviewer and match keys.
- **Consequence:** on production, every feature marked COMPLETE here that depends on 0025+ is **absent**. That includes:
  - the Get Started → activation flow;
  - KYC and KYB;
  - briefs, collaborations and deliverables;
  - notifications.

| ID | Area | Status | What exists | What is missing or broken | Evidence | Impact | Dependency |
|---|---|---|---|---|---|---|---|
| D1 | Production database | **BROKEN** (relative to the branch) | 0001–0024 live | 0025–0041 unapplied; the Supabase Free plan has no PITR and no backup download, so there is no tested rollback | `supabase/migrations/`, `DATABASE_MIGRATION_PLAN.md`, `ROLLBACK_PLAN.md` | Every post-0024 feature is absent in production | Owner decision on a backup method or the Pro plan (§16 item 5) |
| D2 | Production code | **BROKEN** (relative to the branch) | `5580a78` READY | The branch is undeployed. The production code expects the old account-creation model | Vercel deployment record (CLAUDE.md §16) | As D1 | D1 must land first; code and schema ship together |
| D3 | Scheduled jobs | **BROKEN** in production | `vercel.json` registers youtube-data-freshness and verification-retention | `CRON_SECRET` is unset, so every cron answers 401. The YouTube 29-day cleanup and the 365-day purge do not run | CLAUDE.md §16; `lib/cron-auth.ts` | Privacy and YouTube-policy statements describe jobs that are not running | Owner sets the secret |
| D4 | Legal operator identity | **MISSING** | Terms and Privacy pages exist | `ENTITY_REGISTERED_NAME = ""` and `ENTITY_ADDRESS = ""` | `src/lib/constants/legal.ts` | Legal pages don't name the operator (§16 item 6) | Owner supplies the details |
| D5 | Malware scanning | **MISSING** | Magic-byte type checks, size limits, EXIF stripping | No scanning on any of the 5 upload paths, no quarantine, no fail-closed state | `MALWARE_SCANNING_REQUIREMENT.md` | Reviewers and admins open unscanned PDFs. Public avatars are unscanned | Owner decision on hosting (self-hosted ClamAV needs a non-Vercel host) |
| D6 | Supabase Auth configuration | **UNVERIFIED** | Code no longer calls `signUp` | Public sign-up must be **off**. Site URL and redirects, and the password policy, need checking | §16 item 5, §20 | Self-signup could bypass admin gating if left on | Owner configuration |

---

## 1. Creator journey

| ID | Feature / route | Status | What exists | What is missing | Evidence | Impact | Order |
|---|---|---|---|---|---|---|---|
| C1 | Application: `/get-started/creator`, `/apply`, `/apply/continue` | **COMPLETE** (branch) | Honeypot and rate limit; email verification recorded and enforced in the DB; multi-step wizard; review step; status panel; rejected-applicant read-only view | — | `lib/verification/rules.ts`, `CaseEditor.tsx`, migration 0039, `registration-smoke.mjs` 9/9, `registration_trust_test.sql` | — | Ships with D1/D2 |
| C2 | Identity capture (camera only) | **PARTIAL** | getUserMedia → canvas JPEG; EXIF refused; `capture_method='camera'` enforced in the DB | Not liveness, not face matching (by design). **No fallback** for devices without a camera. Real-device testing is limited to `camera-capture-e2e` in headless Chromium | `lib/verification/camera.ts`, `scripts/camera-capture-e2e.mjs` | Creators on desktops without a webcam cannot apply | P2: real-device test pass |
| C3 | Activation: `/activate` | **COMPLETE** (branch) | Single-use 48-hour token, stored as a hash; claim → checkpoint → complete; carry-over of photo, handle and categories; EXIF stripped | — | `ACCOUNT_ACTIVATION_FLOW.md`, `carry-over.ts`, `flow1–4` | — | — |
| C4 | Pending and rejected account confinement: `/verification` | **COMPLETE** | `requireProfile` redirects; `loadApiSession` answers 403; `verification_reapply()` | — | 0032/0040, `auth.ts`, `api-session.ts` | — | — |
| C5 | Onboarding checklist: `/onboarding` | **COMPLETE** | Computed from real data, never stored | — | `lib/onboarding.ts`, `onboarding-uploads.test.ts` | — | — |
| C6 | Media Kit: `/media-kit` | **PARTIAL** | YouTube OAuth sync (stats, verified geography, median reach, 50 recent uploads); manual entry for Twitch and Kick | Instagram disabled (Graph v19.0 expired 2026-05-21); TikTok and X planned; Kick now has an official API but is unused. Median reach is shown but **not used in pricing** (owner decision 12) | `INTEGRATION_STATUS` in `lib/media-kit/platforms.ts`, `SOCIAL_INTEGRATIONS_AND_SYNC_AUDIT.md` | Most creators outside YouTube have self-reported data only | P2 |
| C7 | YouTube OAuth in production | **UNVERIFIED** | Code and the token-refresh `invalid_grant` handling | Google OAuth verification status for `yt-analytics.readonly` unknown; one stored token in production. Unverified apps show a warning screen and are capped in users | §7.3, §12 G1 | Verified geography may be unusable at scale | Owner/Google |
| C8 | Public profile `/p/[slug]` and Media Kit PDF | **COMPLETE** | SECURITY DEFINER RPC with a fixed column list; section toggles; print-to-PDF | PDF is the browser print dialog only (v1, by design) | 0017/0028, `public-profile.ts` | — | — |
| C9 | Portfolio: `/portfolio` | **PARTIAL** | Private by default; masked text; brand named only with consent | The public-consent **wording** is pending the owner (PENDING item 10) | 0028 | Public brand display awaits the decision | Owner |
| C10 | Opportunities: `/opportunities` | **PARTIAL** | Creators see published briefs and their invitations, and accept, decline or request changes | **A creator cannot apply to a published brief**: there is no `collab_*` function or action for a creator-initiated application, so they can only wait to be invited | `collaborations/actions.ts` (`respondToInvitation` only); no "apply" path in `components/collab` | Published briefs are read-only to creators; the marketplace is one-directional | P1, needs an owner decision on the model (O3) |
| C11 | Campaign matching | **PARTIAL** | Discover sorts and filters for companies; G recommends for companies | No matching *for creators*: nothing ranks briefs by fit with the creator's categories, geography or rate | `lib/discovery.ts` (company side only), `lib/g/recommend.ts` | Creators browse an unranked list | P2 |
| C12 | Email Deal Inbox (§5 intake) | **COMPLETE** in code; **UNVERIFIED** live | Fetches the body, screener, claim and recovery, held panel, Gmail confirmation handling | Live Resend inbound on the branch build has not been exercised since F1 | `src/lib/email/intake-tests/`, `webhook-e2e.mjs`, `claim-concurrency-pg.sh` | — | P0 smoke test after deploy |
| C13 | Deal room `/inbox/[chatId]` (creator side) | See §4 | | | | | |
| C14 | Deliverables (creator submits) | **PARTIAL** | Submit an https link or a note; revision loop | **No file upload** for deliverables; links only | `collab_submit_deliverable`, `addDeliverable` | Creators must host files elsewhere | P2 (needs malware scanning first) |
| C15 | Earnings and payment visibility | **MISSING** | `deal_status` `agreed → paid` (admin-only), the 10% rate stated in copy | No earnings view, no payout status, no per-deal commission amount, nothing computed (by design: "Nothing computes or stores commission") | §8, §12, §19 | A creator cannot see what they earned or what is owed | P1, display-only and computed from `offered_amount` × 10%, **only if the owner approves** (O4) |
| C16 | Reviews and ratings | **MISSING** | — | No reviews (PENDING item 9) | §19 | No reputation signal | Owner (O5) |
| C17 | Settings `/settings` | **COMPLETE** | Display name, password, alias, WhatsApp opt-in, notification preferences | — | `settings/actions.ts` | — | — |
| C18 | Content plan `/content` | **COMPLETE** | Owner-only RLS, statuses and calendar, a 500-item cap, official news | News refresh is manual and the cron is unscheduled | 0029/0037 | — | — |
| C19 | Support `/support` | **COMPLETE** | Channels and hours from `lib/support.ts` | — | `support.test.ts` | — | — |

**What blocks the Creator journey:**
- in production, everything (D1/D2);
- on the branch:
  - C10, no way to apply to a brief;
  - C15, no earnings visibility;
  - email notifications for collaboration events (S3);
  - C2, no fallback without a camera.

## 2. Company journey

| ID | Feature / route | Status | What exists | What is missing | Evidence | Impact | Order |
|---|---|---|---|---|---|---|---|
| K1 | Application and KYB: `/get-started/company` | **COMPLETE** (branch) | Business activity, authorized representative, registration and tax fingerprints, documents | Document malware scanning (D5) | 0039/0041, `second_reviewer_test.sql` | — | D5 |
| K2 | Company profile and details: `/onboarding` | **COMPLETE** | Required before a Discover offer or a brief; masked description | — | `lib/company-details.ts`, `marketplace-guards.test.ts` | — | — |
| K3 | Discover `/discover` | **PARTIAL** | Server-side filter, sort and pagination over `creator_directory()`; verified geography only when fresh; signed offer preview and send | **No side-by-side comparison in the UI**; comparison exists only through G (`g-collab-compare.mjs`). Data is thin outside YouTube (C6) | `lib/discovery.ts`, `discovery.test.ts`; no compare component in `src/app/(app)/discover` | Companies compare manually or must use G | P2 |
| K4 | Shortlists `/shortlists` | **COMPLETE** | Company-private RLS, rate-limited | — | 0028 | — | — |
| K5 | Briefs `/briefs`, `/briefs/new`, `/briefs/[id]` | **COMPLETE** | Draft → publish (needs company details) → archive; invite and withdraw | — | `collaboration_lifecycle_test.sql`, `collab-ui-e2e.mjs` | — | — |
| K6 | Invitations and terms | **COMPLETE** | Invite, revise, respond; both sides confirm, terms freeze, deal → `agreed` | — | `collab_*` functions, `lib/collab/*.test.ts` | — | — |
| K7 | Deliverable review | **COMPLETE** (links and notes) | Approve or request revision; complete once all are approved | No file attachments (C14) | `collab_review_deliverable`, `collab_complete` | — | — |
| K8 | Deal management | **PARTIAL** | Status control, in-app chat, relay | No dispute workflow (A5), no cancellation reasons beyond `collab_cancel` | `StatusControl.tsx` | — | P1 |
| K9 | Real company email shown to creators | **Owner decision** | `deal_chats.sender_email` visible on Discover deals | §16 item 7 is still undecided | §16 | Both sides can route around the platform | Owner (O6) |
| K10 | Settings | **COMPLETE** | As C17 | — | — | — | — |

**What blocks the Company journey:**
- in production, everything (D1/D2);
- on the branch:
  - no comparison UI (K3);
  - no dispute path (K8/A5);
  - no email alerts when a creator responds or submits (S3), so companies must poll the in-app bell.

## 3. Company Representative journey

| ID | Feature | Status | What exists | What is missing | Evidence | Order |
|---|---|---|---|---|---|---|
| R1 | Application and verification | **COMPLETE** (branch) | A representative case with camera selfie and ID; a typed company name grants nothing | — | 0039, `registration-smoke` check 9 | — |
| R2 | Company association | **COMPLETE** | Admin links via `linkRepresentative` after reviewer approval | — | `company_members`, `admin/requests/actions.ts` | — |
| R3 | Scopes `/team` | **PARTIAL** | Grantable: `company.view`, `company.edit`, `discovery.view`, `briefs.view`; enforced in RLS, the RPC and the server | **No write scopes for briefs, invitations, deals or messages.** Financial and contractual scopes are refused pending an owner decision | 0034, `company-access.ts`, `company-access.test.ts` | Owner (O7) |
| R4 | Permitted workflows | **PARTIAL** | View the company, edit details, browse Discover, read briefs | A representative cannot do the company's actual work: publishing, inviting, negotiating | As R3 | Depends on O7 |

## 4. Deal Room (`/inbox/[chatId]`, `/collaborations/[id]`)

| ID | Feature | Status | Evidence / notes |
|---|---|---|---|
| DR1 | Lifecycle `new → negotiating → agreed → paid / disputed` | **COMPLETE** | `updateDealStatus` is the only writer, `paid` is admin-only and final (0022) |
| DR2 | Messaging with §6.1 masking and violation log | **COMPLETE** | `lib/mask.ts` with oracle and property tests; server-side only; 0022 revoked client writes |
| DR3 | Email relay to the company | **COMPLETE** in code; **UNVERIFIED** live | Relay lifecycle 0036 with retries and `/admin/relays`; production Resend delivery for the new lifecycle has not been exercised |
| DR4 | File attachments in chat | **MISSING** | Text only. Needs D5 before any file path is added |
| DR5 | Agreements (frozen terms) | **COMPLETE** | `collab_confirm_terms`. No signed document or PDF contract (none promised) |
| DR6 | Deliverables, revisions, approvals | **COMPLETE** (links and notes) | See K7 |
| DR7 | Disputes | **PARTIAL** | `disputed` is a status only. No reason, evidence, admin queue, resolution outcome, or deadline |
| DR8 | Permissions | **COMPLETE** | RLS on parties; `marketplace-guards.test.ts`; `dealroom-malformed.mjs` |
| DR9 | AI reply drafts and negotiation co-pilot | **COMPLETE** (deterministic); **UNVERIFIED** (model) | Templates and the staged plan are tested; the NVIDIA path has never run live (G-ai) |
| DR10 | Real-time updates | **UNVERIFIED** | Supabase Realtime is used for messages; not covered by a browser test of two live sessions |

## 5. G Assistant

**Owner priority: G is central.** What is real and what is not:

| ID | Capability | Status | What exists | Gap |
|---|---|---|---|---|
| G1 | Real AI responses | **UNVERIFIED** | NVIDIA via `chatJson`; grounding rejects any figure not in DATA | **The live NVIDIA call has never succeeded from this environment** (egress blocked). `g-ai-live.mjs` exists but has not passed against the real endpoint. All passing G tests run against fakes or the rules fallback |
| G2 | Role and context awareness | **COMPLETE** | `lib/g/context.ts` reads the caller's own data through RLS: briefs, invitations, collaborations, deliverables, content, deal_chats (metadata), the directory (company) | — |
| G3 | Current-page awareness | **PARTIAL** | The route is passed to G | Page-specific state (e.g. the brief being edited, unsaved form contents) isn't |
| G4 | Deal-room thread awareness | **MISSING** | G reads `deal_chats` rows only | **G does not read messages**, so it cannot summarise a negotiation or draft a reply from what the sponsor actually said. The deal room's own reply generator does, but G doesn't |
| G5 | Recommendations and comparisons | **PARTIAL** | Rule-computed cards; company creator comparison (`g-collab-compare` passing on the rules path) | Creative or explanatory text appears only when the AI is up (G1). Creators get no brief recommendations (C11) |
| G6 | Brief, invitation, content and message preparation | **COMPLETE** (confirm-to-execute) | 4 proposal kinds (`brief_draft`, `content_draft`, `invitation`, `message_draft`), at most 2 per reply; server-scoped, masked, grounded; confirmed via `ConfirmActionForm` calling the ordinary action | By design, G never executes. Message drafts are copy-only, not one-click send |
| G7 | Deliverable assistance | **PARTIAL** | Next step computed per collaboration (`lib/g/collab.ts`) | No submission or review proposal kind |
| G8 | Multi-turn | **PARTIAL** | History sent with each turn; sessionStorage per user and role | Lost on tab close; no server-side memory (a privacy decision, not a bug) |
| G9 | Arabic and English | **PARTIAL** | Replies in the message's language; dictionaries for 5 languages; Arabic wake phrases | Arabic output quality is unverified with the real model (G1) |
| G10 | Voice | **UNVERIFIED** | Web Speech start, stop, mute and interrupt; opt-in "Hey G"; 18 fake-recognizer checks | **Never tested with a real microphone**; Edge, Safari and Firefox untested (`VOICE_MANUAL_TEST_CHECKLIST.md`) |
| G11 | Streaming | **MISSING** | Replies arrive whole after a loading state | Long waits on a slow model |
| G12 | Error handling and fallback | **COMPLETE** | Rules-only cards on any NVIDIA failure; rate limit `g_chat`; logged `nvidia.unavailable` | — |
| G13 | Availability to pending users and applicants | **MISSING** | `loadApiSession` answers 403 for non-active accounts | G cannot help someone through verification, the step where help is most needed. Applicants have no session at all |
| G14 | Admin assistance | **PARTIAL** | Navigation only | No review-queue summaries (by design so far) |
| G15 | Prompt-injection defence | **COMPLETE** | Fenced and masked untrusted text; allow-listed actions; `lib/g/*.test.ts` | — |

**What G still cannot do:**
- answer with a verified live model (G1);
- read a deal's conversation (G4);
- help pending or applying users (G13);
- stream (G11);
- speak or listen reliably on real devices (G10);
- propose deliverable actions (G7);
- recommend briefs to creators (G5/C11).

## 6. Admin

| ID | Feature / route | Status | Notes |
|---|---|---|---|
| A1 | Verification queue `/admin/verification`, `/[id]` | **COMPLETE** | Reviewer allow-list; trust checks; duplicate fingerprints; internal notes; flags; second reviewer; signed 5-minute document links with logging. Tests: 0039–0041 SQL, `second-reviewer-check` 6/6, `second-reviewer-action-check` 7/7, `review-retention-check` 3/3 |
| A2 | Reviewer staffing | **Owner action** | The `verification_reviewers` table is empty by default. Enforcing the second-reviewer rule in practice needs **at least two** reviewers, or flagged cases cannot be approved |
| A3 | Users `/admin/users`, applications `/admin/requests` | **COMPLETE** | createUser via an application, ban, profile edit, representative linking |
| A4 | Violations `/admin/violations` | **COMPLETE** | Ban or dismiss with the masked log |
| A5 | Disputes | **MISSING** | No queue, filter or resolution tooling. Admins find disputed deals by scanning `/inbox` |
| A6 | Deals oversight | **PARTIAL** | Admins see every deal in `/inbox` and mark `paid` | No filter by status or age, no reconciliation view for manual settlement |
| A7 | Audit-log viewer | **MISSING** | `admin_actions` is written by user actions only, and nothing displays it. Verification has its own history. The durable admin audit design is unwritten (§18, next free migration) |
| A8 | Reports and metrics | **MISSING** | No admin reporting (deal volume, conversion, GMV for commission). `/admin/system` shows integration configuration only |
| A9 | Relays, taxonomy, news, system | **COMPLETE** | `/admin/relays`, `/admin/taxonomy`, `/admin/news` (manual refresh), `/admin/system` |
| A10 | Promo codes | **COMPLETE** (read-only, retired) | By §8 |
| A11 | Retention purge | **COMPLETE** in code; **BROKEN** in production | Needs D3 |

## 7. Public website

| ID | Feature | Status | Notes |
|---|---|---|---|
| P1 | Landing page `/` | **COMPLETE** | Real marketing page; CTAs go to Get Started; 5 languages; light and dark |
| P2 | Get Started journeys | **COMPLETE** (branch) | Replaces Discord "Request access" |
| P3 | Legal `/terms`, `/privacy` | **PARTIAL** | Operator details empty (D4). `LEGAL_LAST_UPDATED` is still 31 October, which predates the KYC, retention and camera-capture flows. **Whether the Privacy Policy describes identity documents, 365-day retention and match fingerprints must be checked before launch.** Changing it needs separate approval (O2) |
| P4 | Responsiveness | **PARTIAL** | `mobile-nav-e2e.mjs`; the registration wizard has no dedicated mobile pass |
| P5 | Accessibility | **PARTIAL** | axe found 0 violations on 33 pages, plus a keyboard pass. Both predate the wizard, camera capture and the new admin review screens, which are unaudited |

## 8. Shared concerns

| ID | Area | Status | Notes |
|---|---|---|---|
| S1 | Global search | **MISSING** | No search across deals, briefs or collaborations; filter-only lists |
| S2 | In-app notifications | **COMPLETE** (branch) | 5 categories (`invitations`, `terms`, `deliverables`, `status`, `messages`); trigger-created; preferences; bell and `/notifications` (0027/0030) |
| S3 | Email and push notifications for collaboration events | **MISSING** | Email exists for applications, verification decisions and relays; WhatsApp only for new deals. **No email for invitations, terms, deliverables or status**, so a user who isn't signed in never learns of them |
| S4 | Email delivery (Resend) for new flows | **UNVERIFIED** | All registration and activation emails were tested against a mock outbox only. `ROLE_MAILBOX_FORWARD_TO` is unset in production |
| S5 | WhatsApp alerts | **UNVERIFIED** | Meta Cloud API path; quiet degradation; no live send recorded |
| S6 | Uploads | **PARTIAL** | Magic bytes, size limits, private buckets, signed links, EXIF stripping. **No malware scanning (D5)** |
| S7 | Security and permissions | **COMPLETE** | RLS on every table; service-role writes only; rate-limit coverage test; security headers test; `rest_tests.py` and `auth_tests.py` |
| S8 | Empty, loading and error states | **PARTIAL** | Design system and `ux-copy.test.ts`; error boundary; not systematically checked on the 0025+ pages |
| S9 | i18n | **PARTIAL** | Admin pages and `lib/` data strings are English only (§15, disclosed) |
| S10 | Error tracking | **MISSING** | JSON logs only, no Sentry or similar (post-launch per §16) |
| S11 | Code hygiene | **COMPLETE** | 0 TODO/FIXME markers in non-test `src/` |

## Summary count

Counted over the 91 finding rows. C13 is a pointer and 2 rows are owner decisions. A row graded "COMPLETE in code, UNVERIFIED live" or "COMPLETE in code, BROKEN in production" counts once under each label, so the totals add up to more than the number of rows.

| Status | Count | Main items |
|---|---|---|
| COMPLETE | 40 | Registration, activation, KYC/KYB review, collaborations, briefs, terms, masking, RLS, in-app notifications, G proposals and fallback |
| PARTIAL | 24 | Opportunities, Discover, representative scopes, disputes, integrations, G context and multi-turn, legal, accessibility, mobile |
| MISSING | 14 | Malware scanning, earnings view, brief applications, G thread awareness, G for pending users, streaming, attachments, disputes queue, audit-log viewer, reports, search, collaboration emails |
| BROKEN | 4 | Production schema, code, cron and retention purge, all relative to the branch |
| UNVERIFIED | 10 | Live NVIDIA, real-mic voice, live Resend, live WhatsApp, YouTube OAuth verification, Realtime, Auth configuration, live inbound intake, live relay, model-backed reply drafts |

**Limits of this audit:**
- It is a source and test-script reading; no test was re-run for it. The test counts quoted are from the last runs in this session on `1e8db30`.
- Production was not inspected beyond what CLAUDE.md §16 records.
- Accessibility and mobile findings rely on earlier passes.
