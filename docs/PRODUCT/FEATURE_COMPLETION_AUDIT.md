# Feature completion audit (2026-11-07)

**Inspected:** branch `claude/eager-gauss-dox9tq` at commit `e8d4349`, read from the code rather than from earlier reports. Clean tree, even with origin. PR #6: draft, unmerged.

## Executive summary

- **Breadth:** nearly every approved feature is built. The core company journey (apply → verify → activate → dashboard) was verified end to end in the real app against an isolated Supabase stack on 2026-11-06.
- **What is weak:**
  1. Most journeys after activation (briefs → invitations → collaboration → completion, G proposals, media-kit privacy) are verified only by SQL tests and mock-data UI tests, never as a full run in the real app.
  2. Several journeys break at a missing piece rather than at a bug:
     - no in-app password reset;
     - no email notifications for in-app collaboration events;
     - support email not routed;
     - comparison only through G;
     - G proposals need the NVIDIA model.
  3. The social integrations beyond YouTube are self-reported, or blocked by external review or cost.
- **Not deployed:** none of the post-0024 work is live. Production runs `5580a78`, and migrations 0025–0037 are unapplied. That is the launch-preparation phase, outside this audit's scope, but every "COMPLETE" below means verified locally or in isolation, **not live**.
- **No feature is UI ONLY in the misleading sense.** Planned integrations are labelled "planned" in the UI (`INTEGRATION_STATUS`), and preview pages render mock data only behind `NEXT_PUBLIC_ENABLE_UI_PREVIEW`.

**Status key:**

| Status | Meaning |
|---|---|
| COMPLETE | Implemented and verified (the "Evidence" column says where) |
| PARTIAL | Works, but missing required functionality |
| BROKEN | Exists but does not work correctly |
| UI ONLY | Interface with no functioning backend |
| PLANNED | Documented, not implemented |
| BLOCKED | Needs credentials, external approval, a paid service or an owner decision |

**Evidence levels:**

| Code | Meaning |
|---|---|
| ISO | Real app against an isolated Supabase stack, 2026-11-06 |
| SQL | Migration and SQL test suites (local Postgres and the isolated stack) |
| UNIT | `npm test` |
| E2E-M | Browser suite against mock-data preview pages |
| CODE | Read only |

## Feature inventory

### Accounts, onboarding and verification

| Feature | Status | Evidence | Files | Gap |
|---|---|---|---|---|
| Get Started (creator / company / representative journeys) | COMPLETE | ISO (company), E2E-M (all) | `app/get-started/*`, `components/get-started/*` | Creator and representative journeys not run in ISO |
| Application → manual review → one-time activation → account | COMPLETE | ISO, SQL, UNIT | `app/apply`, `app/activate`, `lib/verification/*`, 0032 | — |
| Creator KYC: camera-only selfie, ID front and back | PARTIAL | E2E-M (Chromium fake camera), UNIT (JPEG checks), SQL (`capture_method='camera'`) | `components/verification/CameraCapture.tsx`, `lib/verification/camera.ts` | Never run on a real device (iOS Safari, Android Chrome) or in ISO end to end |
| Company KYB documents | COMPLETE | ISO | `CaseEditor`, `DocumentUploader`, `api/applications/documents` | — |
| Representative verification and link | PARTIAL | SQL | 0032, 0034 | Not run in ISO; see representative scopes |
| Admin review: approve | COMPLETE | ISO | `admin/verification/*` | — |
| Admin review: reject, request info | PARTIAL | SQL, UNIT | `admin/verification/actions.ts` | Applicant emails and the resume-after-info path not run in ISO |
| Reviewer allow-list | COMPLETE | ISO, SQL | 0032 `verification_reviewers` | Needs a production row (launch prep) |
| Forced first-login password change | COMPLETE | Production (earlier), CODE | `(auth)/set-password` | — |
| **Password reset ("forgot password")** | **PLANNED (missing)** | CODE: no `resetPasswordForEmail`, no recovery landing page | `(auth)/login` | **A locked-out user has no self-service path.** Supabase recovery itself works (ISO). |
| Login with sign-up disabled | COMPLETE | ISO | — | The production Auth toggle is a launch-prep task |
| Existing (pre-0032) accounts and KYC | BLOCKED | CODE | `lib/auth.ts` | Owner decision: must existing or admin-created accounts pass KYC? |
| Account self-deletion and data export (PDPL) | PLANNED | CODE: none | — | Needs an owner and legal retention decision |
| Suspended and banned handling | COMPLETE | CODE, UNIT | `app/suspended`, `lib/auth.ts` | — |

### Creator experience

| Feature | Status | Evidence | Files | Gap |
|---|---|---|---|---|
| Creator dashboard | COMPLETE | ISO (loads), E2E-M | `views/DashboardView.tsx` | — |
| Channel analysis: strengths, weaknesses, opportunities | COMPLETE (rules), PARTIAL (AI) | UNIT | `lib/g/assessment.ts`, `recommend.ts`, `GCards.tsx` | AI wording needs NVIDIA; the rules-based cards always work |
| YouTube connect and sync (public stats, top content, cadence, verified geography) | PARTIAL | UNIT, ISO (OAuth start and refusal only) | `lib/youtube/*`, `api/oauth/*`, 0031, 0035 | No live sync with the 50-upload read. Google OAuth verification status unknown (Testing mode expires refresh tokens after 7 days). |
| Growth history | PARTIAL | UNIT, SQL | 0025, `lib/media-kit/growth.ts` | Shown only after two snapshots on different days. Capped at 29 days by YouTube policy. |
| Twitch, Kick metrics | PARTIAL (self-reported only) | CODE | `lib/media-kit/platforms.ts` | No API sync; Kick now has an official API (owner decision) |
| Instagram | BLOCKED | CODE: pinned Graph v19.0, expired 2026-05-21 | `lib/oauth/instagram.ts` | Version upgrade plus Meta App Review |
| TikTok | BLOCKED | CODE: planned card | — | TikTok app review |
| X | BLOCKED | — | — | Paid API (do not activate) |
| Media Kit | COMPLETE | ISO (loads), E2E-M | `views/MediaKitView.tsx` | — |
| Public profile `/p/[slug]`, section visibility, portfolio with consent | PARTIAL | SQL, E2E-M | 0028, `components/portfolio/*` | Not run in ISO. Consent wording is an owner decision. |
| Media Kit PDF | COMPLETE (print dialog v1) | CODE | public profile print | No PDF service, by design |
| Content plan: ideas, scripts, hooks, titles, descriptions, board, calendar | COMPLETE | ISO (loads), SQL, E2E-M | `app/(app)/content`, 0029 | — |
| G content ideas and scripts → confirm → saved | PARTIAL | UNIT | `lib/g/*`, `GProposals.tsx` | **Proposals come only from the NVIDIA model.** With the model down, G gives rules-only cards and no proposals. Real-model quality is unevaluated (Arabic benchmark pending). |
| Opportunities (published briefs) | COMPLETE | ISO (loads), SQL | `app/(app)/opportunities` | — |
| Manual Analyzer | COMPLETE | Production (earlier), UNIT | `views/AnalyzerView.tsx` | — |
| Inbound email → deal room | COMPLETE | Production (earlier), UNIT intake tests | `lib/email/*` | Depends on Resend inbound; unchanged since production |

### Company experience

| Feature | Status | Evidence | Files | Gap |
|---|---|---|---|---|
| Company dashboard | COMPLETE | ISO (loads) | `views/CompanyDashboardView.tsx` | — |
| Company details and onboarding gate | COMPLETE | ISO (loads), UNIT | `lib/onboarding.ts` | — |
| Briefs (create, publish, archive) | COMPLETE | SQL, E2E-M | `app/(app)/briefs/*`, 0026 | Not run in ISO |
| Discovery: filters, sort, pagination | COMPLETE | ISO (lists creators), UNIT | `lib/discovery.ts`, `DiscoverView.tsx` | — |
| Creator comparison | PARTIAL | UNIT | `lib/g/context.ts compareCreators`, `DiscoverView` "compare" → G | **No dedicated comparison view.** Comparison exists only inside G. |
| Explainable recommendations | PARTIAL | UNIT | `lib/g/recommend.ts` | Rules-based reasons shown; AI explanations need NVIDIA |
| Shortlists | COMPLETE | SQL, E2E-M | 0028, `components/shortlists/*` | Not run in ISO |
| Invitation preparation (G) and sending (company) | PARTIAL | SQL, UNIT | `inviteCreator`, `GProposals` | Sending works; G preparation needs NVIDIA |
| Collaboration management (terms, deliverables, revisions, completion) | COMPLETE (backend), PARTIAL (journey) | SQL lifecycle test, E2E-M | `app/(app)/collaborations/*`, 0026 | Never run end to end in the real app; no email notifications |
| Representative scopes | PARTIAL | SQL, UNIT | 0034, `app/(app)/team` | Only `company.view`, `company.edit`, `discovery.view` and `briefs.view` exist. Brief creation, collaboration access and invitations on the company's behalf are not built (owner decision 9). |

### Deals, chat and communication

| Feature | Status | Evidence | Files | Gap |
|---|---|---|---|---|
| Deal rooms, masked chat, violation log | COMPLETE | ISO, Production (earlier) | `inbox/[chatId]`, `lib/mask.ts` | — |
| Deal room resilience | COMPLETE (P0-1, 2026-11-07) | UNIT (`intel-shape.test.ts`, 8 tests), ISO (`dealroom-malformed.mjs`: 8/8 rooms incl. `{}` and wrong-type rows; flow4 10/10) | `lib/deals/intel-shape.ts`, `CompanyIntelligencePanel.tsx`, `ui/PanelBoundary.tsx` | Malformed `security_check`/`company_profile` now hide a field or the brief; the chat always renders, and an error boundary contains any other panel failure |
| Relay lifecycle (retry, idempotency, admin view) | COMPLETE | ISO, SQL | 0036, `lib/email/relay-*` | The retry cron is not scheduled (launch prep) |
| Deal status (`new` → … → `paid`; admin-only `paid`) | COMPLETE | Production (earlier), UNIT | `updateDealStatus` | Settlement is manual by design |
| In-app notifications (collaboration events, new messages) | COMPLETE (in-app) | SQL, ISO (page loads) | 0027, 0030 | **In-app only.** No email to a company or creator who is not signed in; WhatsApp exists for new creator deals only. |
| Message read state and unread counts in deal rooms | PLANNED | — | — | — |

### G assistant

| Feature | Status | Evidence | Gap |
|---|---|---|---|
| Chat, site-wide | COMPLETE | UNIT, E2E-M | Replies are not streamed |
| Replies in the user's language | COMPLETE (rule), PARTIAL (quality) | UNIT (`replyLanguageHint`) | Real-model Arabic and Egyptian Arabic quality unmeasured |
| Uses only authorized data; no invented figures; sources and dates | COMPLETE | UNIT (`ungroundedFigures`, provenance) | — |
| Explicit confirmation before every action | COMPLETE | UNIT, CODE (`ConfirmActionForm`; G never executes) | — |
| Voice (Web Speech), "Hey G" opt-in | PARTIAL | E2E with a fake recognizer (18 + 31) | Never tested with a real microphone, or in Safari, Firefox or Edge |
| Creator- and company-specialized capabilities | COMPLETE (rules), PARTIAL (AI) | UNIT | AI parts need NVIDIA |

### Admin

| Feature | Status | Evidence | Gap |
|---|---|---|---|
| Users, requests, verification, taxonomy, relays, news, system, violations | COMPLETE (pages load, core actions) | ISO (8 pages), SQL | Admin copy is English-only (approved) |
| Durable audit trail for all admin actions | PARTIAL | CODE | `verification_events` and `company_permission_events` exist. `admin_actions` is written only by `admin/users/actions.ts`. Violation review, rejection and unlink have no durable record (owner decision 4; design ready). |
| Promo codes | COMPLETE (retired, read-only) | CODE | By decision |

### News, support, commercial

| Feature | Status | Evidence | Gap |
|---|---|---|---|
| Official news: YouTube blog, Steam developer posts; manual refresh | PARTIAL | UNIT (real payloads) | Never fetched from the deployed app. Two sources only; no other gaming publishers, no sports. The cron is off. |
| Support: email | **BLOCKED** | CODE (`support@greenlightadvs.com`) | Role-mailbox mail is forwarded only when `ROLE_MAILBOX_FORWARD_TO` is set, and it was not set in production. Not verified operational. |
| Support: Discord, WhatsApp | PARTIAL | CODE (invite `discord.gg/ejTySEFu3k`, `+201041165669`) | Links render. Whether the invite is valid and the number is staffed was not verified. |
| Support tickets in-app | PLANNED (by design: Discord tickets) | — | — |
| Pricing page: unified Creator plan, 10% commission, free company access, effective date | COMPLETE | UNIT, CODE | Legal wording review pending. No price set (by decision). |
| Commission calculation and settlement | Intentionally manual | CODE | Nothing computes commission. Do not build payments before launch. |
| Subscriptions and billing | Intentionally none | — | Manage via Discord (§4) |

### Cross-cutting

| Area | Status | Evidence | Gap |
|---|---|---|---|
| RLS, column grants, service-role-only functions | COMPLETE | ISO REST 13/13, SQL 20/20 | — |
| Preview deployments read-only | COMPLETE (new previews) | UNIT, local build | The `d6fd238` preview is unverified (Vercel access) |
| Identity document security | PARTIAL | SQL, UNIT | No malware scan. The retention period is undecided (`VERIFICATION_RETENTION_DAYS` unset). |
| i18n (5 languages, RTL) | COMPLETE for user-facing pages | E2E-M (en/ar at 390 and 1440 px) | Admin pages English-only, by decision |
| Mobile responsiveness | PARTIAL | E2E-M preview pages at 390 px; mobile nav suite | Real DB-backed pages (admin, team, apply with real data) not checked on mobile |
| Accessibility | PARTIAL | CODE (145 `aria-*` attributes, labelled forms) | No automated audit (axe), and no keyboard or screen-reader pass |

## Journey analysis: where each one stops

| # | Journey | Furthest verified point | Where it stops or is unverified |
|---|---|---|---|
| 1 | Creator: register → verify → activate → dashboard | Camera capture (fake camera); activation (company case in ISO) | Never run end to end for a **creator** in ISO; no real-device camera test; no password reset afterwards; existing-account KYC policy undecided |
| 2 | Company: register → verify → activate → dashboard | **End to end in ISO** | Representative variant only partly covered (scopes) |
| 3 | Creator: social connection → analytics → AI insights | OAuth start, forged-callback refusal | No live YouTube sync. Google verification status unknown. AI insights need NVIDIA. Every platform except YouTube is self-reported or blocked. |
| 4 | Company: brief → discovery → comparison → invitation | Discovery lists creators (ISO); invitation functions (SQL) | **Comparison exists only in G**; no real-app run of the whole path |
| 5 | Invitation → acceptance → deal room → communication → completion | Each step (SQL lifecycle test); relay (ISO) | Never run end to end in the app. **The other party is not emailed** about invitations, acceptance or new in-app messages. No read state. Payment is manual. |
| 6 | Media Kit → privacy settings → public sharing | Pages load (ISO); visibility enforced in RPC (SQL) | Toggle → public page not run in ISO; portfolio consent wording undecided |
| 7 | Admin review → approve/reject → audit trail | Approve (ISO); `verification_events` | Reject and request-info not run in ISO; other admin actions lack a durable audit |
| 8 | G chat → confirmation → authorized action → result | Confirm forms and grounding (UNIT) | **No proposals without NVIDIA**; never run against the real model with real data; voice untested on a real mic |
