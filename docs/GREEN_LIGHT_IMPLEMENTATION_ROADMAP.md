# GREEN_LIGHT_IMPLEMENTATION_ROADMAP

Staged plan for features **A–M** of the Master Product Evolution plan, built on the system as it actually exists on 2026-10-29.
**Nothing in this file has been implemented.** Each stage needs the owner's approval before work starts, and every production migration needs the gate in §6.

Companion documents:
- `GREEN_LIGHT_MASTER_BRIEF.md`: system state.
- `GREEN_LIGHT_INTEGRATION_STATUS.md`: email, social and AI evidence.
- `GREEN_LIGHT_VERIFICATION_AND_ONBOARDING.md`: features A–D.
- `GREEN_LIGHT_AI_PRODUCT_SPEC.md`: features E, H and I.

Evidence labels: **[V]** verified here · **[C]** from code · **[D]** provider docs · **[U]** unverified.

---

## 0. Constraint that governs everything: the §16 feature freeze

CLAUDE.md §16 (from 2026-10-22) allows only **launch-blocker** fixes until launch. A launch blocker is something that:
- leaks contact details;
- bypasses the platform or its commission;
- loses or corrupts deal data;
- breaks §4 onboarding, §5 intake, §6 chat or the Discover → paid flow; or
- makes the legal pages untrue.

By that definition:

| Inside the freeze (launch blockers) | Outside the freeze (need the owner to lift it) |
|---|---|
| F: inbound email body (breaks §5 intake) | A, B, C, D: new onboarding and verification |
| I: the Analyzer defects that corrupt deal data (wrong or missing `offered_amount`; "red" meaning "unknown") | E: AI discovery |
| M-YouTube: the "Verified" badge with no API behind it (makes §1/§7.2 untrue); the broken Analytics query | G: analytics dashboard |
| 0022, the audit-verified security fixes, and the §16 DoD items | H: AI assistant; J, K, L: profile and taxonomy |

**Owner decision D1:** keep the freeze, and run Stages 0–1 only until launch; or lift it for named stages. This roadmap assumes Stages 0–1 first in either case.

---

## 1. Verified starting point (2026-10-29)

**Code and CI**
- Branch `claude/eager-gauss-dox9tq` @ `ea1b98f` is 5 commits ahead of `main` @ `ab34393`.
- Checks: 206/206 unit tests; `tsc`, `lint` and `build` clean; CI green on both commits [V].

**Database** (live counts only; no personal data was read) [V]
- Migrations 0001–0021 are applied; **0022 is not**, and the pre-0022 client write grants are live.

| Data | Live count |
|---|---|
| Profiles | 10 (4 creator, 2 company, 4 admin) |
| Media kits | 2 |
| Deal rooms | 6: 0 from Discover, 0 paid |
| Messages | 16 |
| Violations | 4 (all unreviewed) |
| Inbound deliveries | 5 (last on 2026-09-29) |
| OAuth connections | 1 |
| Storage buckets | 0 |

**Confirmed defects**, with evidence in the companion documents:

| ID | Defect | Evidence | Doc |
|---|---|---|---|
| **F1** | The inbound email body is never fetched. Every inbound room holds the subject only. | [D][C][V] | INTEGRATION §1.2 |
| **F2** | Idempotency is keyed on the RFC `Message-ID`, so one email forwarded to two creators collides. | [D][C] | INTEGRATION §1.3 |
| **M1** | The YouTube Analytics query (`viewerPercentage` by `country`) is unsupported. | [D][C][V] | INTEGRATION §2.1 |
| **M2** | 1 kit is "verified" with no OAuth token behind it. | [V] | INTEGRATION §2.1 |
| **M3** | Instagram is pinned to Graph v19.0, which expired on 2026-05-21. | [D][C] | INTEGRATION §2.2 |
| **I1** | The amount parser ignores EGP, SAR, AED, €, جنيه, ريال and Arabic-Indic digits. | [V] local run | AI SPEC §1 |
| **I2** | The rule-based fallback rates **red** whenever reach data is missing, so "unknown" reads as "risky". | [C][V] | AI SPEC §1 |
| **I3** | The §7.4 cap tests the platform's *recommended* price, not the sponsor's offer. | [C] (spec interpretation; owner to confirm) | AI SPEC §1 |

---

## 2. Features A–M: where they land in the current system

| Feature | Exists today | Reuses | Missing (new) | Depends on |
|---|---|---|---|---|
| **A. Get Started onboarding** | CTA "Request access" → Discord/WhatsApp (`en.ts:47`, `LandingNav.tsx:33`, `Hero.tsx:44`, `lib/constants/contact.ts`). Admin-only account creation (`admin/users/actions.ts`). Forced reset (`(auth)/set-password`, `proxy.ts`). | Admin user creation, forced reset, i18n, rate limits | `onboarding_applications` table + state machine; public application form; admin review queue; anti-abuse (rate limit, captcha) | **D2** (does §4 still forbid self-activation?), K, Storage |
| **B. Creator identity verification** | None | Admin review UI pattern, `admin_actions` audit, logger masking | Provider integration (hosted flow + signed webhook); `verification_cases`; private storage only if documents are held at all | A, D3 (provider), D4 (legal), Storage |
| **C. Sponsor company verification** | None. A company is a `profiles` row with `role='company'`. | Admin review, WHOIS/Safe Browsing (`lib/security/*`) as weak signals only | `companies` entity; jurisdiction rules; document review; KYB provider (optional) | **D** (entity model first), D5 |
| **D. Company representatives** | None. One login = one company. | `requireRole`, RLS helpers in `private` schema | `companies`, `company_members` (role, scopes, status, revocation); invitation flow; every company-side query re-scoped from `profile.id` to membership | A, and the Stage 0 security fixes |
| **E. AI creator discovery** | `/discover` lists every creator via the `creator_directory()` RPC (0010) with **no search or filters** [C] | `creator_directory()` (PII-free columns), `chat.ts`, rate limits, the signed-quote pattern | Structured filters; deterministic ranking; AI explanations; taxonomy | K, M/G (data quality), B/C (trust badges) |
| **F. Incoming email repair** | Full pipeline (INTEGRATION §1) | Everything; the existing REST pattern in `lib/resend.ts` (the Resend SDK is **not** a dependency [V]) | Received-Emails API fetch; `email_id` key; admin diagnostics view | None. **First.** |
| **G. Creator analytics dashboard** | `DashboardView` gets `chats` + `kits` only, with no time series [C] | Media-kit sync, `media_kits` columns | `analytics_snapshots` table; scheduled sync (Vercel Cron, Hobby = daily); charts | M (real data) |
| **H. Creator AI assistant** | `niche.ts` (category detection), `reply-draft.ts` | `chat.ts`, prompt fencing, rate limits, cache pattern (`company_profile`) | Idea → approval → script workflow; source registry per category; usage ledger | K, M/G, D6 (sources/cost) |
| **I. AI Analyzer repair** | `analyzer/actions.ts`, `lib/ai/*` | Everything | Currency-aware parser; "insufficient data" state; real CPM benchmarks; health visibility | F (email path), D7 (benchmarks) |
| **J. Reuse onboarding data** | Profile fields (0017): `bio`, `country`, `primary_language`, `base_rate_usd`, `social_links` | `updateCreatorProfile` | Mapping from application → profile at approval; no re-entry | A, K |
| **K. Category taxonomy** | `content_category` is **free text**; `CATEGORY_CPM` has 7 hard-coded keys (`evaluate.ts:32`); `niche.ts` returns free text | — | `categories` table (admin-managed, i18n labels, active flag); join table; migrate free text by mapping | None (foundation) |
| **L. Avatar drag-and-drop** | `avatar_url` is an external http(s) link (`media-kit/actions.ts:550`) | Profile form | Private or public-read bucket `avatars`; type/size checks; EXIF strip; RLS on `storage.objects` | Storage decision |
| **M. Social integrations** | YouTube Data + Analytics, Instagram Graph (both partially broken); 4 placeholders (501) | OAuth start/callback, `oauth_connections` | Fixed queries; channel binding; token health; encrypted tokens; then new platforms | D8 (Google/Meta reviews) |

---

## 3. Recommended order, and why it differs from the proposed one

Proposed: 0 baseline → 1 reliability → 2 onboarding & trust → 3 profile/analytics → 4 AI discovery → 5 creator AI assistant → 6 production readiness.

**Recommended:**

| Stage | Name | Contents | Why here |
|---|---|---|---|
| **0** | Baseline and safety | Apply 0022 (with the §6 gate); owner merge of the 5 commits; finish audit verification (A1–A22); fix only *verified* findings; correct M2's data row (owner-approved); fill legal fields | Every later stage writes to tables 0022 protects. Building on an unverified security base multiplies the fix cost. |
| **1** | Core reliability (launch blockers) | **F** (body fetch, `email_id` key, retryable failures, admin diagnostics) → **I** (I1/I2, health line, I3 decision) → **M-YouTube** (M1 query, token state, channel binding) | F feeds I. A good Analyzer is useless if it only ever sees the subject. YouTube is the one platform with a real connected user. |
| **1.5** | Launch readiness (was Stage 6) | §16 DoD: Auth settings, Supabase plan, env check, smoke test with test accounts, `NEXT_PUBLIC_ENABLE_UI_PREVIEW` unset | **Moved earlier.** Opening onboarding (Stage 3) to the public before backups, password policy and plan limits are settled would expose real users and identity data to known gaps. |
| **2** | Data foundations | **K** taxonomy → **L** avatar upload (first Storage bucket, lowest-risk way to establish storage RLS patterns) → **D**'s data model (`companies`, `company_members`) | Onboarding (A) writes categories and company data, so their tables must exist first. L proves the storage policies on non-sensitive files before B/C put identity documents there. |
| **3** | Onboarding and trust | **A** (applications + admin approval) → **J** (reuse data) → **B** (creator IDV via provider) → **C** (company verification) → **D** flows (invite, scopes, revoke) | A is the entry point; B/C/D attach verification to accounts that A creates. |
| **4** | Creator analytics | **G** on YouTube data first (snapshots + dashboard); Instagram after Meta review (M3) | Needs M working and needs time-series storage. Analytics also feeds E and H. |
| **5** | AI discovery | **E**: filters first (deterministic), then AI explanation and re-ranking | Ranking quality depends on K + G; trust badges depend on B/C. |
| **6** | Creator AI assistant | **H**: idea → approval → script | Largest scope, new sources and recurring cost, least tied to the commission loop. Reuses everything above. |

**Reasons for the changes:**
1. Production readiness cannot come last: opening onboarding *is* a production event.
2. Profile foundations (K, L, D-model) come *before* onboarding, not after, because onboarding writes them.
3. Within reliability, the order is F → I → M by data dependency.

---

## 4. Stage details and acceptance criteria

Each criterion is measurable and testable before deploy (unit, SQL suite, or local e2e with sanitised fixtures). "Production check" items need the owner's test accounts.

### Stage 0: Baseline and safety
- **0022 applied:**
  - `list_migrations` shows 0022;
  - `has_any_column_privilege('authenticated','public.deal_chats','INSERT')` and the equivalent `UPDATE` / `messages INSERT` checks return false;
  - the app-level smoke test still passes.
- **Branch merged:** `main` contains `ea1b98f`, CI is green, and the production deploy of that commit is READY.
- **Audit:** every A1–A22 candidate ends as `confirmed` (with severity and fix), `rejected` or `needs_validation`. No unverified candidate is fixed as if it were confirmed.
- **M2 data fix (owner-approved, one row):** after the fix, no kit has `audience_verified = true` without a matching `oauth_connections` row. A SQL assertion checks this, and can be added to `supabase/tests`.

### Stage 1: Core reliability
- **F:** see INTEGRATION §1.5 (5 criteria).
- **I:** see AI SPEC §1.4. In summary:
  - the parser handles the 10 listed currency and digit cases;
  - with no reach data the result is "insufficient data", never red;
  - the UI states rule-based vs AI on 100% of results.
- **M-YouTube:** see INTEGRATION §2.5. In summary:
  - the country report uses `views`;
  - the kit is bound to the OAuth channel id;
  - an expired token shows "reconnect" and clears verified state.

### Stage 1.5: Launch readiness
- The §16 DoD items 1–7 are each checked off with evidence (screenshot or query result).
- `/admin/system` shows no unconfigured *required* integration.

### Stage 2: Data foundations
- **K:**
  - `categories` holds admin-managed rows (slug, five i18n labels, active flag).
  - Creators pick from it (multi-select, max N).
  - Existing free-text values are mapped by an approved mapping list.
  - Unmapped values are kept, shown as "other", and never lost.
  - `CATEGORY_CPM` is keyed by slug.
  - Removing a category deactivates it; it never deletes historic references.
- **L:**
  - Accepts PNG/JPEG/WebP ≤ 2 MB by drag-and-drop or picker; checks type by magic bytes, not extension; strips EXIF.
  - The object path is `avatars/<profile_id>/<random>`.
  - Storage RLS: only the owner writes their own folder; a second creator's write is refused (test with two accounts).
  - The old URL field remains valid during transition.
- **D-model:**
  - `companies` and `company_members` exist with RLS.
  - Every existing company profile is migrated to a company with one owner membership.
  - No existing company query changes behaviour (regression tests on Discover, inbox and send).

### Stage 3: Onboarding and trust
See VERIFICATION_AND_ONBOARDING §2.6, §3.6, §4.5 and §5.6 for the full criteria. Headline:
- an applicant can never reach any app route before admin approval;
- a verification status can only be written by the server after a signed provider webhook or an admin action;
- no identity document is ever reachable through a public URL.

### Stage 4: Analytics (G)
- **Snapshots:** a daily job writes one `analytics_snapshots` row per connected kit per day. A failed day writes an error row, never fabricated values. Charts show gaps as gaps.
- **Metrics:** every metric on screen has a definition tooltip naming the API metric it comes from. Self-reported values are labelled as self-reported (§7.2).
- **Isolation:** a creator sees only their own snapshots (RLS test with two creators).
- **Performance:** the dashboard loads in under 2 s with 365 days of data (local measurement).

### Stage 5: Discovery (E)
See AI SPEC §2.6.

### Stage 6: Creator assistant (H)
See AI SPEC §3.7.

---

## 5. Database and security change list (proposals; none applied)

| # | Change | Stage | Notes |
|---|---|---|---|
| S1 | Apply `0022_server_only_deal_writes.sql` | 0 | In repo; owner confirmation required |
| S2 | Data fix: clear verified state on the 1 orphan kit | 0 | One row, owner-approved, done after a backup query |
| S3 | `inbound_emails`: store the provider `email_id` as the idempotency key; keep the RFC `Message-ID` in a separate column for threading | 1 | Additive column + backfill (existing keys stay unique) |
| S4 | `media_kits`: `platform_account_id`, `last_sync_error`, `last_successful_sync_at` | 1 | Additive; server-only grants |
| S5 | `oauth_connections`: `provider_account_id`, `status`; encrypt tokens (Supabase Vault / pgsodium, or app-layer AES-GCM with a dedicated key) | 1–2 | Encryption needs a new secret: owner decision |
| S6 | `categories`, `creator_categories` | 2 | Admin-write, authenticated-read |
| S7 | Storage bucket `avatars` + `storage.objects` policies | 2 | First bucket in the project |
| S8 | `companies`, `company_members` (+ RLS helpers in `private`) | 2 | Re-scopes company queries; highest regression risk |
| S9 | `onboarding_applications` | 3 | Insert via server action only (rate-limited); no anon table grant |
| S10 | `verification_cases` (subject, kind, provider, provider_ref, status, decided_by, decided_at, reason_code) | 3 | **No document bytes and no biometric data stored here**; status is server-only |
| S11 | Private bucket `verification-docs` (only if manual document review is chosen) | 3 | No public URLs; signed URLs ≤ 5 min, admin-only; retention deletion job |
| S12 | `analytics_snapshots` | 4 | Creator-read-own; service-write |
| S13 | `assistant_ideas`, `assistant_scripts`, `ai_usage` | 6 | Approval status server-written; usage ledger for cost |
| S14 | Extend the `media_kits.platform` CHECK (e.g. `tiktok`) | when decided | Product call (K7) |
| S15 | Ban enforcement at the DB layer | 0 | Only if audit candidate A2 is confirmed |

**Rules for every new table:**
- RLS enabled, with an explicit policy per role.
- Column grants for server-authoritative fields.
- A `supabase/tests/*.sql` suite that runs as each role in a rolled-back transaction.

**AI never writes:** `verification_cases.status`, `onboarding_applications.status`, `company_members.status/scopes`, `deal_status`, or any ban field.

---

## 6. Migration gate (required for every production migration)

Each migration PR must contain the following, before anyone asks to apply it:

1. **Purpose:** one paragraph.
2. **Compatibility analysis:** additive or breaking; which app versions can run against it; whether the old code still works during rollout.
3. **Backup:**
   - On Free, there are no point-in-time backups [U for this project]. Take a `pg_dump` of the affected tables (schema + data), or a manual backup through the dashboard, immediately before applying.
   - On Pro, record the restore point.
4. **Test-environment verification:** a Supabase branch or a local `supabase start`, running the full `supabase/tests` suite plus the new one. Note: this project's history has duplicate 0010/0011 entries, which must be reconciled before any `db push`.
5. **Rollout plan:** order of DB vs app deploy, and the feature flag if any.
6. **Rollback or forward-recovery plan:** a reverse SQL script, or a documented forward fix.
7. **Explicit owner approval**, recorded in the PR.

---

## 7. External services, credentials, approvals

| Need | For | Who | Lead time / cost |
|---|---|---|---|
| Resend API key with read access to received emails (the existing key may suffice [U]) | F | Owner (Vercel env) | Free tier: 3,000 emails/mo [D] |
| Google OAuth consent screen → "In production" + verification for `yt-analytics.readonly` (a sensitive scope) | M, G | Owner (Google Cloud) | Days–weeks (§7.3); in Testing mode, tokens expire after 7 days [D] |
| Meta App Review (`instagram_basic`, `instagram_manage_insights`, `pages_show_list`) + Graph version upgrade | M | Owner (Meta) | Weeks [U] |
| Identity verification provider account (Didit / Veriff / Sumsub / Uqudo): API key + webhook secret | B | Owner (contract, DPA) | See VERIFICATION §3.3 |
| KYB source per jurisdiction | C | Owner | See VERIFICATION §4 |
| Token-encryption key (if app-layer) | S5 | Owner (Vercel env) | — |
| CAPTCHA (e.g. Cloudflare Turnstile, free) for the public application form | A | Owner | Free [U] |
| Supabase Pro (backups, no auto-pause, leaked-password protection) | Before Stage 3 | Owner | $25/mo (§16) |
| Vercel Cron (Hobby: daily only [U]) | G | — | Free |
| NVIDIA: paid / production tier vs trial (the trial may retain prompts for up to 30 days [D], against §12) | E, H, I | Owner | Unknown |
| Legal: privacy policy and terms update for identity data (biometrics), retention, processors | B, C, D | Owner + counsel | — |

---

## 8. Owner decisions (each blocks a stage)

| ID | Decision | Options and consequences | Blocks |
|---|---|---|---|
| D1 | Feature freeze | Keep (A–M post-launch) / lift for named stages | 2–6 |
| D2 | Does "Get Started" mean self-signup? | (a) **Application + admin approval** (keeps §4: no account exists until an admin approves) — recommended. (b) Self-signup with restricted access until verified (changes §4/§12 and the legal pages). | A |
| D3 | IDV provider + budget | See VERIFICATION §3.3; no provider has been contacted | B |
| D4 | Is IDV mandatory, and for whom? | Mandatory before the first deal / optional "verified" badge / mandatory for payouts only | B |
| D5 | Company verification standard | Manual document review / KYB provider / domain + email proof only (weak) | C |
| D6 | Assistant data sources and cost ceiling | YouTube Data API only (free quota) / plus a paid trends source | H |
| D7 | Pricing benchmarks | Keep placeholder CPMs labelled as such / commission a benchmark set | I |
| D8 | Submit for Google and Meta reviews | Start now (long lead) / wait | M, G |
| D9 | Platform order after YouTube | Instagram / TikTok / Twitch / Kick | M |
| D10 | M2 orphan row | Clear verified state (recommended) / reconnect first | Stage 0 |
| D11 | I3: what is a deal's "value" for the §7.4 cap? | Offered amount when known, else recommended price (recommended) / recommended only (current) | I |
| D12 | Supabase plan | Pro / Free with the risks accepted | 1.5, 3 |
| D13 | §16.7: Discover rooms show the company's real email to the creator | Keep / mask | 1.5 |
| D14 | NVIDIA tier | Stay on trial/free (repo notes describe up to 30-day content retention, which is in tension with §12) / move to a paid or production tier with confirmed no-retention terms | 5, 6 (more AI traffic) |

---

## 9. First task proposed for approval

**F1 + F2: fetch the inbound email body from Resend's Received Emails API.**

- **Scope:**
  - `src/lib/email/parse.ts`;
  - `src/lib/email/intake.ts`;
  - `src/app/api/webhooks/resend/route.ts`;
  - a new `src/lib/email/fetch-received.ts`;
  - tests.
- **Why first:**
  - it is a §16 launch blocker (intake is broken);
  - it touches no schema in its minimal form (the `email_id` key change can use the existing `provider_message_id` column);
  - it unblocks I.
- **Plan:**
  1. After signature verification, call `GET https://api.resend.com/emails/receiving/:email_id` with the existing `RESEND_API_KEY`, under a timeout. This endpoint was confirmed in the Resend API reference ("Retrieve Received Email") on 2026-10-29 [D].
  2. Normalise the documented response fields (`html`, `text`, `headers`, `message_id`, `attachments`, `authentication`).
  3. Key idempotency on `email_id`.
  4. If the fetch fails, record a retryable failure (`failed`, with diagnosable `detail`).
- **Tests:** sanitised fixtures built from the documented payload shapes; existing suites stay green. No real email is sent during development.
- **Production check:** after deploy, the owner sends one test email to a test creator alias and confirms the room contains the body.
- **Not included:**
  - the admin diagnostics view (E6), which is a separate small task;
  - the RFC Message-ID column (S3);
  - any production configuration change.
