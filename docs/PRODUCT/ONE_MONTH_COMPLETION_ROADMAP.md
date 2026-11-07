# One-month completion roadmap (2026-11-07)

Based on `FEATURE_COMPLETION_AUDIT.md` at commit `e8d4349`. Acceptance criteria for each item are in `FEATURE_ACCEPTANCE_CRITERIA.md` under the same ID.

## Executive summary

The product is broad but not yet finished as **journeys**:
- **Five gaps break a core path:**
  1. no password reset;
  2. no email when the other party acts;
  3. support email not routed;
  4. creator comparison only inside G;
  5. G proposals impossible without the NVIDIA model.
- **One fragile edge can crash a deal room.**
- **Several finished journeys** (creator activation, the collaboration lifecycle, media-kit privacy, admin rejection) **have never been run end to end in the real app.**

The plan below closes those first (P0), then the important completions (P1), and leaves the rest for after launch (P2).

**Effort sizes:** S, M and L are relative size only, not calendar estimates.

| Size | Meaning |
|---|---|
| S | A contained change and its tests |
| M | Several files or a new UI surface |
| L | A new subsystem, or an external dependency |

**Rules for every item:**
- No migration is applied to production.
- No commercial rule changes.
- No paid service.
- Each item lands on the branch with tests, CI green, and nothing deployed.

**New migrations:** none of the P0 work needs one. Where an item does need one, it takes the next free number, 0038 or later.

## P0: required for the core journeys

| ID | Task | Status now | Files | Missing | Depends on | Risk | Size |
|---|---|---|---|---|---|---|---|
| P0-1 | **Password reset** | Missing | `app/(auth)/login/*`; new `app/(auth)/reset-password/*` and `app/auth/recovery/route.ts`; `lib/i18n/dictionaries/*` | A "Forgot password?" link and request form (rate-limited, identical answer for unknown emails), a recovery landing page that exchanges the code, and a set-new-password form with the existing password rules | Owner: add the recovery URL to Supabase Auth redirect URLs (configuration, at launch prep) | Account enumeration (identical answers); recovery-link reuse | M |
| P0-2 | **Deal room resilience** | Broken edge case | `components/views/DealRoomView.tsx`, `CompanyIntelligencePanel`, `lib/deals/*` | Validate `security_check` and `company_profile` at read time (unknown shape → panel hidden), plus an error boundary around the side panels, so the chat always renders | — | None; read-only change | S |
| P0-3 | **Email notifications for key in-app events** | In-app only | `lib/notifications/*`, a new `lib/notifications/email.ts`, `lib/resend.ts`, `notification_preferences` (0027) | An email to the recipient on: invitation received, invitation accepted or declined, terms confirmed, deliverable submitted or reviewed, collaboration completed, new message in an in-app room. Sent via the relay-lifecycle pattern (idempotency key, retry), honouring the existing per-category mute. Ids and event kind only; never message text. | Resend sender verified (launch prep). The free tier is 3,000 a month: volume check. | Leaking message content (forbidden); mail floods (one per event; debounce messages) | M |
| P0-4 | **Creator comparison view** | Only in G | `components/views/DiscoverView.tsx`, `components/shortlists/*`, `lib/g/context.ts compareCreators`; a new `components/discover/CompareTable.tsx` | Select 2–4 creators from Discover or a shortlist and see a side-by-side table: reach, engagement, categories, verified versus self-reported geography, freshness, rate. Each value is labelled with its source, reusing `compareCreators` and its provenance. No AI needed. | — | Contact fields must stay out; reuse `creator_directory()` only | M |
| P0-5 | **G without the model** | No proposals when NVIDIA is down | `lib/g/*`, `components/g/GProposals.tsx` | Rule-based proposal templates when the model is unavailable, clearly labelled "template":<br>- **content draft:** from the creator's categories and plan;<br>- **invitation:** from the brief and the creator;<br>- **message draft:** from the collaboration's next step.<br>Same confirmation path. | — | Must still pass `allowedProposals` and grounding | M |
| P0-6 | **Real-app run of the post-activation journeys** | Unverified as journeys | `scripts/isolated-validation/` (new `flow5-collab.mjs`, `flow6-mediakit.mjs`, `flow7-review.mjs`, `flow8-creator.mjs`) | Run these on the isolated Supabase stack with mocks:<br>- **flow 5:** brief → invite → accept → terms → deliverable → revision → approve → complete;<br>- **flow 6:** media kit → visibility toggles → `/p/<slug>`;<br>- **flow 7:** reject and request-info → applicant email → resume;<br>- **flow 8:** creator KYC with Chromium's fake camera → activation.<br>Fix whatever breaks. | Isolated stack (available); P0-3 for the email checks | Test-only; the mocks prevent any real sends | M |
| P0-7 | **Support channels operational** | Email blocked; Discord and WhatsApp unverified | `lib/support.ts`, `lib/constants/contact.ts`, `lib/email/role-mailbox.ts` | Owner:<br>- set `ROLE_MAILBOX_FORWARD_TO`;<br>- confirm the Discord invite never expires and the WhatsApp number is staffed during the published hours.<br>Code: an `/admin/system` row showing the role-mailbox route as configured or not, with no value shown. | Owner configuration | Never display the forward address | S |
| P0-8 | **Owner decisions that gate journeys** | Open | `PENDING_OWNER_DECISIONS.md` | Decide:<br>- (a) KYC for existing and admin-created accounts;<br>- (b) the identity-document retention period;<br>- (c) portfolio consent wording;<br>- (d) whether a creator's public "profile photo" must also be camera-only (today the avatar is an upload, kept separate from identity documents). | Owner and counsel | — | — |

## P1: complete before launch

| ID | Task | Status now | Files | Missing | Depends on | Risk | Size |
|---|---|---|---|---|---|---|---|
| P1-1 | Deal-room read state and unread counts | Missing | New migration `message_reads` (0038), `InboxView`, `TopBar` | Per-party `last_read_at`; unread badge in the inbox and nav | Migration (local only until launch prep) | RLS: own rows only | M |
| P1-2 | Real-device camera and voice testing | Unverified | `CameraCapture`, `lib/g/voice.ts` | A manual test matrix:<br>- iOS Safari, Android Chrome, desktop Chrome, Firefox, Edge, Safari;<br>- camera permission states;<br>- G voice with a real microphone, in Arabic and English.<br>Fix the findings. | A person with devices | None | M |
| P1-3 | Accessibility pass | Partial | All views | axe-core in the existing Playwright suites (en/ar, 390/1440); keyboard-only run through the 8 journeys; screen-reader labels on camera, G and dialogs | — | None | M |
| P1-4 | Mobile pass on DB-backed pages | Partial | `admin/*`, `team`, `apply`, `collaborations/[id]`, `inbox/[chatId]` | Extend the isolated flows with 390 px screenshots and overflow checks | P0-6 | None | S |
| P1-5 | Durable admin audit trail | Partial | `admin/*/actions.ts`, new migration (design in `PENDING_OWNER_DECISIONS` item 4) | Append-only rows for violation review, ban and unban, rejection, unlink, reviewer grant, and taxonomy and news actions; a read-only admin view | Owner approves the design | Append-only and admin-read; no personal data in details | M |
| P1-6 | Representative scopes: collaboration access and brief creation | Not built | 0034, `collab_*` functions, `team` | Acting-member support in the `collab_*` functions (recorded actor). Grant `briefs.create` and `collaborations.access`; keep the financial and contractual scopes refused. | **Owner decision 9** | Company isolation; every action records the acting member | L |
| P1-7 | Account deletion and data export (PDPL) | Missing | New `settings` section, server action, service-role routine | Export of the user's own data as JSON; deletion request → admin-confirmed deletion that removes OAuth tokens, storage objects and personal fields, and keeps deal records anonymised as the law requires | **Owner and legal retention decision** | Irreversible; needs a confirmation and grace period | L |
| P1-8 | Twitch public counts via Helix | Self-reported | New `lib/twitch/*`, `media-kit/actions.ts` | Follower total and live status from the official Helix API (free, client credentials), labelled *synced*, never *verified* | Owner decision; `TWITCH_CLIENT_ID`/`SECRET` | Store counts only; 29-day freshness like YouTube | M |
| P1-9 | Kick official API sync | Self-reported | New `lib/kick/*` | Channel info and live viewer count through the official API, labelled *synced* | Owner decision; Kick app credentials | As above | M |
| P1-10 | More official news sources | 2 sources | `lib/news/sources.ts` | Add only feeds confirmed official and free (candidates to verify: Riot, Epic, Mojang/Minecraft, EA developer blogs) | Owner approval per source; terms review | Host allow-list; headlines only | S each |
| P1-11 | YouTube live sync verification | Unverified | `lib/youtube/*` | One real sync on an isolated stack with a test channel (top content, cadence, geography). Confirm the Google OAuth consent-screen status. | Owner: Google test account, consent-screen status | Uses a real API key; quota is small | S |
| P1-12 | Upload malware mitigation | None | `lib/verification/documents-server.ts`, `api/uploads/*` | Re-encode identity JPEGs server-side (strips payloads) and re-render or reject PDFs with active content. No paid scanner. | Owner chooses re-encode or ClamAV | None | M |
| P1-13 | Arabic and Egyptian Arabic G benchmark | Missing | `scripts/check-nvidia.mjs` | 30 fixed prompts with no user data; record grounding failures and language correctness | NVIDIA quota (owner) | No user data | S |

## P2: safely after launch

| ID | Task | Why it can wait |
|---|---|---|
| P2-1 | Ratings and reviews after completion | Owner decision 9; no core journey needs it |
| P2-2 | Automatic portfolio showcase of completed collaborations | Needs company consent design (decision 10) |
| P2-3 | Streamed G replies | Comfort only; replies already arrive with a loading state |
| P2-4 | Instagram (Graph v26 upgrade and Meta App Review) | External review time; disabled safely today |
| P2-5 | TikTok Display API | External review |
| P2-6 | Growth history beyond 29 days | YouTube policy |
| P2-7 | In-app support tickets | Discord tickets cover it |
| P2-8 | Pricing from synced reach (decision 12) | Changes how prices are computed; needs the owner and data |
| P2-9 | Server-side Media Kit PDF | Print-to-PDF works |

## Do not start before launch

These add launch risk or contradict decisions:
- **Payments, escrow automation, commission calculation:** settlement is manual by decision.
- **Paid KYC, face matching or liveness providers.**
- **X API:** paid.
- **Any second AI provider:** NVIDIA only.
- **Subscription billing or price changes.**
- **Public self-sign-up.**
- **Rewriting existing migrations.**

## Recommended implementation sequence

1. **P0-2** deal room resilience. Small, and removes a crash path.
2. **P0-1** password reset.
3. **P0-4** comparison view.
4. **P0-5** G templates without the model.
5. **P0-3** email notifications, after confirming the sender domain with the owner.
6. **P0-6** real-app journey runs on the isolated stack, fixing what they find. Re-run after each P0 item.
7. **P0-7** and **P0-8**, in parallel with the above. These are owner actions; prepare the checklists on day one.
8. **P1-3, P1-4** accessibility and mobile. They ride on the P0-6 flows.
9. **P1-1** read state, then **P1-5** admin audit (once the owner approves).
10. **P1-2, P1-11, P1-13** real-device, live-YouTube and benchmark checks. They need the owner's devices, accounts or quota.
11. **P1-12** upload mitigation.
12. **P1-6, P1-7, P1-8, P1-9, P1-10**, only as their owner decisions arrive. Each is independent.

## Feature freeze

- **Freeze when P0 is complete and accepted, and the decided P1 items are in.** Plan for that to be no later than the start of the final launch-preparation window, leaving that window entirely for:
  - the production backup and restore;
  - migrations 0025–0037;
  - Auth and environment configuration;
  - legal text;
  - deployment and the smoke tests in `docs/RELEASE/`.
- **After the freeze:** only fixes for launch blockers (CLAUDE.md §16 definition).
- **Undecided P1 items:** any P1 item whose owner decision has not arrived by the freeze moves to P2, with its impact documented:
  - **P1-6:** representatives stay view-only;
  - **P1-7:** deletion stays an admin, manual process;
  - **P1-8 / P1-9:** Twitch and Kick stay self-reported.

  No approved requirement is removed. Each simply ships in its documented, labelled partial state.
