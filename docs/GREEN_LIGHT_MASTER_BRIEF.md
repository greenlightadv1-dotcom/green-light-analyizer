# GREEN_LIGHT_MASTER_BRIEF

> **Status note, updated 2026-10-31 (supersedes the database and deployment facts below).**
> This document is a snapshot from 2026-10-29. Since then, migration 0022 was
> applied on 2026-10-29 and 0023 on 2026-10-30 (version `20261030171145`), so
> 0001–0023 are all live. Production runs `main` at `5580a78` (deployment
> `dpl_mBdwmQuq6HS8n32i7aRMYPWMKTfy`, 2026-10-31), which includes D2–D6, G1, G2,
> the negotiation co-pilot, the §7.4 high-value rule and the platform-sync rate
> limit.
> `CRON_SECRET` is not set, so the daily YouTube cleanup is inactive. Anything
> below that says 0022 is unapplied, or that these items are branch-only, is
> historical. CLAUDE.md §16 is the current record.

**Handover brief for an AI assistant continuing work on Green Light.**
Prepared 2026-10-29 from a read-only investigation of repository `greenlightadv1-dotcom/green-light-analyizer`, plus read-only checks against the live Supabase project and GitHub Actions. No application code, database, migration or deployment was changed to produce it.

**Second pass (2026-10-29, same day).** Corrected the earlier claim that the live database is empty: exact counts show real pilot data (§9). Added the confirmed integration defects F1, F2, M1–M3 and I1–I3 (§10.1). Companion documents in `docs/`:
- `GREEN_LIGHT_IMPLEMENTATION_ROADMAP.md`: stages, decisions, acceptance criteria;
- `GREEN_LIGHT_INTEGRATION_STATUS.md`: email, social and AI evidence;
- `GREEN_LIGHT_VERIFICATION_AND_ONBOARDING.md`: features A–D and J;
- `GREEN_LIGHT_AI_PRODUCT_SPEC.md`: features E, H and I.

## How to read this document

Every claim carries one of these evidence labels.

| Label | Meaning |
|---|---|
| **[V]** | **Verified** in this investigation (2026-10-29), by running a command or by a read-only live query. |
| **[C]** | **Code-based**: established by reading source or migration SQL, not executed end to end. |
| **[D]** | **Documented**: stated in repository docs (CLAUDE.md, README.md, DEPLOYMENT.md, PRODUCT.md) and not re-verified. Some of these docs are stale (see §10.4). |
| **[U]** | **Unknown / unverified**: the available evidence does not establish it. |

Section numbers like "§6.1" without a document name refer to `CLAUDE.md`, the project's own spec ("single source of truth").

---

## 1. Executive summary

- **What it is [D][C].** Green Light ("Your Personal Business Manager") is a closed, admin-vetted web marketplace that connects content **creators** with **companies/sponsors** for paid sponsorship deals.
  - The platform takes a 5–15% commission per deal, settled through a manually reconciled "internal escrow".
  - Its three selling points are:
    1. creator stats come from official platform APIs or are labelled self-reported;
    2. a creator's real email and phone never reach a company, because all contact runs through masked in-app chat and a platform email relay;
    3. an AI **Deal Co-Pilot** prices every inbound offer and rates its risk green/yellow/red.
- **Stack [V][C].** Next.js 16.3.4 (App Router, TypeScript, Tailwind v4) on Vercel, with Supabase (Postgres + RLS + Realtime + Auth). The AI provider is NVIDIA NIM (`meta/llama-3.3-70b-instruct`). Email goes through Resend (inbound webhook plus outbound relay). Optional integrations: YouTube/Instagram APIs, WHOIS, Google Safe Browsing, WhatsApp Cloud API and Discord.
- **Maturity [V][C].** The codebase is large: about 214 source files and roughly 23.8k lines of TS/TSX under `src/`, plus 22 SQL migrations. Almost every spec'd feature exists in code. Status on 2026-10-29:
  - The build passes, typecheck and lint are clean, all **206/206** unit tests pass, and the webhook end-to-end check passes 8/8 against a local build.
  - CI is green on both `main` and the working branch.
- **Not launched [V][D].**
  - **Live data [V], exact counts:**
    - 10 profiles (4 creator, 2 company, 4 admin);
    - 2 media kits, 6 deal rooms (0 from Discover, 0 paid) and 16 messages;
    - 5 inbound deliveries (last on 2026-09-29), 1 OAuth connection and 4 unreviewed violations.

    This is pilot or test use, not an empty database. (An earlier version of this brief read the planner's "0 rows" estimate as a count; that was wrong.)
  - **Core flows are broken [V][D][C]:**
    - the inbound email body is never fetched, so offers are rated on the subject alone (F1);
    - the YouTube verified-geo query is invalid (M1);
    - one kit shows "verified" with no OAuth token behind it (M2).

    See §10.1.
  - **Feature freeze:** in effect since 2026-10-22 (§16).
  - **Owner sign-off pending:**
    - the latest hardening commits are on branch `claude/eager-gauss-dox9tq`, **5 commits ahead of `main`**, and unmerged;
    - **migration 0022 is NOT applied to the live database [V]**;
    - the legal operator fields are empty [V].
- **Security posture [C].** The design is security-conscious: server-side masking, column grants on top of RLS, signed Discover quotes, Svix-verified webhooks and a PII-safe logger.
  - A structured security audit is in progress. It has raised about 22 **unverified** candidate issues, several of them medium-severity candidates.
  - The main candidates: bans not enforced at the database layer, mask gaps for Arabic-Indic digits and grouped MENA phone formats, unthrottled paid side effects, and the verified-audience OAuth link not bound to the creator's own channel.
  - None has been independently verified yet (§10).

---

## 2. Product purpose and business concept

**Problem [D].** Creator sponsorships are usually negotiated informally over DMs and email, with stats "proven" by screenshots. That invites fraud and lets brands and creators go around any intermediary. Green Light wants to be the trusted, commission-protected channel instead (PRODUCT.md, §1).

**Business model [D].**
- The commission per deal depends on the creator's plan:
  - Starter: 15%;
  - Pro: 8–10%;
  - Elite/Agency: 5%.
- Companies browse for free; commission is charged on the deal.
- Subscriptions (§8):

  | Plan | MENA price | International price |
  |---|---|---|
  | Starter | free | free |
  | Pro | $12–15 | $29 |
  | Elite | $49 | $99 |

- Billing, plan changes and payment confirmation happen **manually through Discord support tickets**. There is deliberately no in-app billing or payment processor.
- Escrow is modelled only as `deal_status` (`agreed → paid`) and reconciled by an admin.
- Payment rails named for support flows: Vodafone Cash, InstaPay and Meeza (MENA), PayPal and crypto (international).

**Primary market [D][C].** MENA, with Egypt explicitly: Egyptian governing law and Cairo courts in `src/lib/constants/legal.ts`, the Egyptian mobile pattern in the mask, and a first-class Arabic RTL locale.

**Three core value propositions [D]** (§1, PRODUCT.md):
1. **Kill screenshot fraud.** Stats come from an API sync or are clearly labelled "self-reported". Audience geography has separate `declared_top_countries` and `verified_top_countries` fields.
2. **Protect platform commission structurally.** A creator's contact details are never shown to a company. Chat is regex-masked server-side before storage. Creator replies are relayed by platform email. Off-platform contact exchange means a permanent ban.
3. **AI Deal Co-Pilot.** It gives an instant price recommendation and a green/yellow/red risk rating. Unverified (self-reported) audience data can never by itself produce **green** on a high-value deal (≥ $1,000): the §7.4 cap.

---

## 3. Target users and core workflows

### 3.1 Roles [C] (`profiles.role CHECK IN ('creator','company','admin')`)

| Role | Purpose | Main surfaces (sidebar, `src/components/dashboard/Sidebar.tsx`) |
|---|---|---|
| `creator` | Primary user. Receives offers, maintains a media kit, negotiates. | Dashboard, Deal Inbox, Manual Analyzer, Media Kit, Pricing, Settings |
| `company` | Sponsor. Browses creators, sends offers, negotiates. | Dashboard, Deal Inbox, **Discover**, Pricing, Settings |
| `admin` | The only role that creates accounts. Manages plans, bans, promo codes and violations, and marks deals paid. | Everything above plus `/admin/users`, `/admin/promo-codes`, `/admin/violations`, `/admin/system` |

There is **no self-signup anywhere** (§4) [C]. That is a deliberate trust decision, not a gap to fix.

### 3.2 Core journeys [C] (as implemented; end-to-end production verification: [U])

1. **Onboarding**
   1. The first admin is created with `scripts/bootstrap-admin.mjs`.
   2. An admin creates each creator or company at `/admin/users`. The system generates a temporary password and sets `app_metadata.must_change_password`.
   3. At first login the proxy pins the user to `/set-password` until they change it (`src/lib/supabase/session.ts`, `src/app/(auth)/set-password/actions.ts`).
2. **Inbound email offer (creator)**
   1. The creator gets an alias `{handle}.{4-char random}@analyze.greenlightadvs.com` and sets up a one-time Gmail auto-forward to it.
   2. Resend receives the mail and POSTs to `/api/webhooks/resend`, which checks the Svix signature.
   3. `processInboundEmail` (`src/lib/email/intake.ts`) then:
      - takes the idempotency claim;
      - resolves the alias;
      - runs the spam screener (`accept|flag|reject`);
      - masks the content;
      - runs the NVIDIA evaluation;
      - runs WHOIS + Safe Browsing;
      - creates a deal room, or appends to an open room from the same sender;
      - posts a Co-Pilot summary;
      - sends an optional WhatsApp alert.
3. **Manual Analyzer (creator)**
   1. On `/analyzer`, the creator pastes sender, message, type and target countries. They get a price and risk rating, rate-limited to 12/hour and 50/day.
   2. They can optionally open a deal room from the result.
4. **Discover offer (company)**
   1. On `/discover`, the company browses the creator directory (`creator_directory()` RPC).
   2. A preview step evaluates the offer and returns an HMAC-signed quote.
   3. A send step verifies the signature (30-minute TTL), applies the `offer_send` rate limit, and creates the room and opening message.
5. **Negotiation (both)**
   1. In `/inbox/[chatId]`, Realtime chat runs: `sendMessage` masks server-side, stores the message and logs violations.
   2. A creator's reply in an email-sourced room is relayed to the sponsor by platform email (`relayMessageToCompany`).
   3. Helpers: an AI reply draft (with template fallback), a company-intelligence panel (WHOIS/trust and an AI brief) and a one-click direct reply.
6. **Deal lifecycle.**
   - Parties move a deal between `new`, `negotiating`, `agreed` and `disputed`.
   - Only an admin sets `paid`, and a paid deal is locked. This rule is on the branch only [C].
7. **Media kit & verification.**
   - Per-platform self-reported stats.
   - YouTube Data API stats sync.
   - Optional YouTube Analytics / Instagram Graph OAuth for verified audience geography (Pro/Elite).
   - AI niche detection.
   - A profile card and a public `/p/[slug]` page.
8. **Ban.**
   - A masking violation is logged to `violation_logs`.
   - An admin reviews it at `/admin/violations` and may ban the account (`profiles.banned_at`).
   - `requireProfile()` then redirects the banned user to `/suspended`.

---

## 4. Confirmed requirements

These are the project's own stated requirements, taken from `CLAUDE.md`, `PRODUCT.md` and `DESIGN.md` [D]. Where an implementation exists, it is cited.

| # | Requirement | Source | Implemented? |
|---|---|---|---|
| R1 | Admin-only account creation; no self-signup | §3, §4 | Yes [C] |
| R2 | Forced password change on first login, enforced server-side | §4, §12 | Enforced by the proxy only; `requireProfile` and RLS do not re-check it (audit lead, §10) [C] |
| R3 | Plans and billing only via Discord ("manage via Discord" CTAs), no in-app billing | §4 | Yes, `/pricing` [C] |
| R4 | Inbound email via alias + Gmail forward; no Gmail OAuth or CASA | §5 | Yes [C]; real Resend payload shape never verified [D] |
| R5 | Server-side contact masking before persistence (email, phone incl. Egyptian `01[0125]XXXXXXXX`, messenger links) | §6, §6.1 | Yes, `src/lib/mask.ts` [V unit tests]; gaps under audit (§10) |
| R6 | A creator's real email/phone is never shown to a company; replies are relayed from the platform address | §6, §12 | Yes for chat and relay [C]; display-name and media-kit text are unmasked (audit lead) |
| R7 | Off-platform contact exchange → permanent ban, logged | §6, §12 | Logging is automatic; the ban is an admin action [C]; not enforced at the DB layer (audit lead) |
| R8 | Verified vs self-reported data always labelled | §1, §7.2 | Yes for geography [C]; reach labelling gap on Discover (audit lead) |
| R9 | §7.4 cap: unverified geo never yields green on a high-value deal | §7.4 | Yes, `src/lib/ai/rules.ts` [V unit tests]; keyed on the engine's own price (audit lead) |
| R10 | Disconnecting OAuth immediately sets `audience_verified=false` and clears `verified_top_countries` | §12 | Yes [C] |
| R11 | AI text is evaluation-only and never used for training | §12 | NVIDIA trial ToS says no training, but retention of up to 30 days is possible [D] |
| R12 | RLS on every table holding user or deal data | §12 | All 10 public tables have RLS enabled [V] |
| R13 | Exact brand palette `#293E61`, `#1F2E47`, `#62E823`, `#FFFFFF`, `#231F20`; "Liquid Glass" UI; Framer Motion | §2 | Yes [C] |
| R14 | Zero-cost MVP stack: Vercel Hobby, Supabase free, Resend free, NVIDIA; no second AI provider without approval | §9 | Yes [C] |
| R15 | Feature freeze from 2026-10-22: only launch blockers | §16 | Policy |
| R16 | Escrow: `agreed → paid` only by an admin; paid is final | §12 | On the branch only (`6c49e0b`), not on `main` [V git] |

---

## 5. Complete feature inventory

Statuses use the requested scale. "Verified" means verified working in this investigation or by an executed test. Unit tests verify isolated logic, not the deployed feature, so most user-facing features are **"Implemented but not verified"** end to end.

| # | Feature | Status | Purpose / how it works | Key code (frontend · backend · DB) | Known limitations |
|---|---|---|---|---|---|
| F1 | Public landing page | Implemented but not verified (production) | Marketing page. Every CTA routes to Discord/WhatsApp, with no signup. | `src/app/page.tsx`, `src/components/landing/*`, `src/lib/constants/contact.ts` | Pre-launch copy; must not fabricate social proof (PRODUCT.md) |
| F2 | Admin-gated onboarding + forced reset | Implemented but not verified | Admin creates the account; a temporary password is issued; the proxy pins the user to `/set-password` | `admin/users/actions.ts` (`createUser`), `(auth)/set-password/*`, `lib/supabase/session.ts`, `scripts/bootstrap-admin.mjs`; Auth `app_metadata.must_change_password`, `profiles.must_change_password` (mirror, 0002) | Reset enforced by the proxy only (audit lead A9) |
| F3 | Login / logout / session guard | Implemented but not verified | Supabase Auth password login; `src/proxy.ts` refreshes the session and guards routes | `(auth)/login/*`, `auth/signout/route.ts`, `src/proxy.ts`, `lib/supabase/{server,client,session}.ts`, `lib/auth.ts` (`requireProfile`, `requireRole`) | Login `next` open-redirect candidate (A8). Proxy skips image-extension and `/preview*` paths |
| F4 | Admin: account management | Implemented but not verified | Edit role/plan/region, ban/unban, renew subscriptions; audit trail | `admin/users/{page,actions}.ts`; tables `admin_actions` (0012, 0014), `profiles` | Banning another admin leaves the role in place (A1, A2) |
| F5 | Admin: promo/trial codes | Implemented but not verified | Admin generates single-use codes; users redeem on `/pricing` (atomic claim) | `admin/promo-codes/*`, `pricing/actions.ts` (`redeemCode`); table `promo_codes` (0013) | No rate limit on redemption; companies can redeem (hardening) |
| F6 | Admin: violation queue | Implemented but not verified | Review masking violations; ban or dismiss | `admin/violations/*`; table `violation_logs` (0006) | Inbound-email violations are attributed to the receiving creator (hardening) |
| F7 | Admin: system readiness page | Implemented but not verified | Shows presence (never values) of every env var and what is degraded | `admin/system/page.tsx`, `lib/config.ts` | — |
| F8 | Subscription expiry | Implemented but not verified | `requireProfile` lazily downgrades an expired plan to Starter | `lib/auth.ts`, `lib/subscription.ts` [V unit tests]; `profiles.subscription_expires_at` (0013) | Expiry does not stop verified-geo syncs (A13) |
| F9 | Inbound email intake (§5) | Implemented but not verified | Svix-verified webhook → screener → mask → AI → WHOIS/Safe Browsing → deal room → summary → WhatsApp | `api/webhooks/resend/route.ts`, `lib/email/{verify,parse,intake}.ts`, `lib/ai/spam-filter.ts`, `lib/alias.ts`; tables `inbound_emails` (0008, 0021), `deal_chats`, `messages` | Real Resend payload never observed [D]. The signature gate is verified 8/8 [V]. Audit leads A4, A5, A10, A16, A17 |
| F10 | Inbound alias + rotation | Implemented but not verified | `{handle}.{4 chars from a 32-glyph alphabet}@analyze.greenlightadvs.com`; the previous alias stays accepted | `lib/alias.ts` [V unit tests], `scripts/rotate-inbound-aliases.mjs`; `profiles.inbound_alias`, `previous_inbound_alias` (0020) | No in-app rotation |
| F11 | Inbound spam screener + held-mail panel | Implemented but not verified | `accept/flag/reject` (reject only for machine-declared bulk mail with no sponsorship wording); creators see held mail from the last 30 days | `lib/ai/spam-filter.ts` [V unit tests], `lib/email/{held,held-queries}.ts` [V unit tests for `held.ts`], `components/deals/HeldDeliveriesPanel.tsx` | — |
| F12 | Manual Analyzer (§5.1) | Implemented but not verified | Paste an offer → `evaluateOffer` → price and risk; optional "open deal room" | `(app)/analyzer/*`, `components/views/AnalyzerView.tsx`, `lib/ai/evaluate.ts` | Create-deal step skips the rate limit, length cap and role gate (A6); rating is posted unsigned |
| F13 | AI Deal Co-Pilot / pricing | Implemented, partially verified | NVIDIA chat JSON → validated → §7.4 cap; rule-based fallback labelled "heuristic" | `lib/ai/{chat,price-model,evaluate,rules,types,nvidia-config}.ts` | Cap and config unit-tested [V]. Live NVIDIA response format never verified [D]. `CATEGORY_CPM` values are placeholders [D] |
| F14 | Rate limiting | Implemented but not verified | Fixed-window counters per action via the `consume_rate_limit` RPC; fails closed | `lib/rate-limit.ts`; table `rate_limits` + function (0019) | Only 6 actions limited: `ai_analyze_offer`, `ai_offer_preview`, `offer_send`, `ai_reply_draft`, `ai_detect_niche`, `ai_company_intel`. Several paid paths are unthrottled (A6, A7, A16) |
| F15 | Discover (company browse + offer) | Implemented but not verified | Directory RPC → preview (signed quote) → send (verify, rate limit, insert) | `(app)/discover/{page,actions,OfferPanel}.tsx`, `components/views/DiscoverView.tsx`, `lib/deals/{directory,offer-quote,queries}.ts`; RPC `creator_directory()` (0010) | Signed quote is on the branch only. Leads A11, A12, A20 |
| F16 | Deal Inbox + Deal Chat Room | Implemented but not verified | Lists rooms by RLS; Realtime chat; server-side mask + violation log; relay | `(app)/inbox/*`, `components/views/{InboxView,DealRoomView}.tsx`, `inbox/[chatId]/DealRoom.tsx`, `lib/deals/queries.ts`; tables `deal_chats`, `messages` | Rooms are labelled by `sender_email`, not counterparty name [D]. No re-evaluation when replies arrive [D] |
| F17 | Masking utility (§6.1) | Implemented, unit-verified | Span-merge of email/phone/link matches; label precedence link > email > phone | `src/lib/mask.ts` + `mask.test.ts` [V] | Arabic-Indic digits, invisible characters and grouped MENA formats bypass it (A3, A14) |
| F18 | Outbound relay email (§6) | Implemented but not verified | Creator reply → Resend from the platform address; `reply_to` = alias; per-message `relayed_at` / `relay_error` | `lib/email/{outbound,from,format}.ts`, `lib/resend.ts`; `messages.relayed_at`, `relay_error` (0009) | Unthrottled; recipient chosen by the caller in analyzer rooms (A7) |
| F19 | Deal status / escrow | Implemented but not verified (branch only) | Parties: new/negotiating/agreed/disputed; admin-only `paid`; paid is locked | `inbox/[chatId]/actions.ts` (`updateDealStatus`), `StatusControl.tsx` | `main` lacks it; on the live DB, pre-0022 grants still allow direct writes [V migration list] |
| F20 | AI reply draft + templates | Implemented but not verified | NVIDIA draft from the latest offer, price and risk; deterministic template fallback; copy button | `lib/ai/reply-draft.ts`, `lib/deals/reply-template.ts` [V unit tests] | — |
| F21 | Company intelligence panel | Implemented but not verified | Measured WHOIS/Safe Browsing trust (`security_check`) + AI company brief (`company_profile`, cached) + own history with the domain | `components/deals/CompanyIntelligencePanel.tsx`, `lib/security/*` (trust score [V unit tests]), `lib/ai/company-intel.ts`, `lib/deals/company-intelligence.ts`; `deal_chats.security_check` (0017), `company_profile` (0021) | Spoofed `From` launders domain trust (A4) |
| F22 | Direct reply panel | Implemented but not verified | Prefilled reply sent through `sendMessage` (deliberately not `mailto:`) | `components/deals/DirectReplyPanel.tsx` | — |
| F23 | Media kit (self-reported stats) | Implemented but not verified | Per-platform avg views/CCV/engagement/category/language/declared geo | `(app)/media-kit/page.tsx`, `components/views/MediaKitView.tsx`, `components/media-kit/*`, `lib/media-kit/{actions,platforms,countries,helpers,queries}.ts` [V unit tests for `platforms`/`countries`]; table `media_kits` (0001, 0003, 0007) | Platforms limited to `youtube, twitch, kick, instagram` (TikTok cannot be stored) [C]. Starter 2-platform limit bypassable via PostgREST (A19) |
| F24 | YouTube stats sync | Implemented but not verified | YouTube Data API v3 by `platform_handle` → subscriber/view/media counts; engagement | `lib/youtube/{client,engagement}.ts` [V unit tests for `engagement`], `syncYoutubeStats`; columns from 0014/0016 | Handle not proven to be owned by the creator; labelled "Verified" (hardening) |
| F25 | Verified audience geo via OAuth (YouTube Analytics, Instagram Graph) | Implemented but not verified; blocked operationally | Start/callback routes with HMAC state; tokens in `oauth_connections`; `syncVerifiedGeo` sets `audience_verified` | `api/oauth/[platform]/{start,callback}/route.ts`, `lib/oauth/*`, `components/settings/SocialConnections.tsx`; table `oauth_connections` (0015) | Needs a Google OAuth verification / Meta App Review that has not been done [D]. Linked account is not bound to the kit (A12). Plan lapse doesn't stop syncs (A13). Spec says post-launch fast-follow (§16) |
| F26 | OAuth placeholders (X, TikTok, Twitch, Facebook) | Planned but not implemented | Start route returns 501 | `lib/oauth/platforms.ts`, `components/media-kit/OAuthPlaceholderCard.tsx` | `TWITCH_CLIENT_*` env vars are read by no code [C] |
| F27 | AI niche detection | Implemented but not verified | Classifies channel titles → writes `content_category` / `content_tags` | `lib/ai/niche.ts`, `components/media-kit/NicheDetector.tsx` | — |
| F28 | Creator profile + public page `/p/[slug]` | Implemented but not verified | Bio, avatar, country, language, base rate, social links; public page via a SECURITY DEFINER RPC with a fixed column list | `components/media-kit/{CreatorProfileCard,ShareableLinkCard}.tsx`, `app/p/[slug]/page.tsx`, `saveCreatorProfile`; RPC `creator_public_profile` (0017) | Shareable link uses `greenlight.com/p/<slug>` wording in docs vs the real domain [D]. `bio` / `social_links` are unmasked |
| F29 | Settings | Implemented but not verified | Display name, password change, inbound alias card, WhatsApp settings, social connections | `(app)/settings/*`, `components/settings/*` | Password change does not ask for the current password (hardening) |
| F30 | Pricing page | Implemented but not verified | Plan cards (MENA/Intl), Discord CTAs, promo code redemption | `(app)/pricing/*`, `components/views/PricingView.tsx`, `lib/plans.ts` | — |
| F31 | Dashboard (creator & company) | Implemented but not verified | Overview, profile-completeness banner, alias card, expiry warning | `(app)/dashboard/page.tsx`, `components/views/{DashboardView,CompanyDashboardView}.tsx`, `lib/media-kit/profile-completeness.ts`, `components/dashboard/ExpiryWarningBanner.tsx` | Old "AI Assistant – Coming Soon" card was removed [D] |
| F32 | WhatsApp new-deal alerts | Implemented but not verified | Opt-in number → Meta WhatsApp Cloud API on every deal-creation path | `lib/whatsapp.ts`, `components/settings/WhatsAppSettingsCard.tsx`; `profiles.whatsapp_*` (0017) | Number ownership is never verified (hardening) |
| F33 | Admin email outreach | Implemented but not verified | Admin sends React Email templates via `POST /api/emails/send` (TopBar modal) | `components/outreach/SendInviteModal.tsx`, `api/emails/send/route.ts`, `components/emails/*`, `lib/resend.ts` | Banned admins can still send; arbitrary `from` (A1) |
| F34 | Supabase DB webhook → Discord | Implemented but not verified | Bearer-authenticated endpoint forwards changed rows to Discord | `api/webhooks/supabase/route.ts`, `lib/discord/logger.ts` | Forwards whole unmasked rows (A15). Which tables are wired is set in the dashboard [U]. GitHub/deploy Discord channels have no sender [C] |
| F35 | Legal pages (Terms, Privacy) | Partially implemented | Final-form text | `app/{terms,privacy}/page.tsx`, `components/legal/LegalPage.tsx`, `lib/constants/legal.ts` | `ENTITY_REGISTERED_NAME`, `ENTITY_ADDRESS`, `ENTITY_REGISTRATION` are empty strings [V], a §16 launch blocker |
| F36 | Theming (light/dark/system) | Implemented but not verified | `next-themes` + a `--color-fg` token | `components/ThemeProvider.tsx`, `ui/ThemeMenu.tsx`, `app/globals.css` | — |
| F37 | i18n (en, ar, fr, es, de) + RTL | Partially implemented (by design) | Custom non-routing provider; typed dictionaries | `components/LocaleProvider.tsx`, `ui/LanguageMenu.tsx`, `lib/i18n/*` | Admin pages, data strings in `lib/` and user content are not translated [D] |
| F38 | UI preview mode `/preview/*` | Implemented but not verified | Mock-data UI with no DB; on only when Supabase is unconfigured or `NEXT_PUBLIC_ENABLE_UI_PREVIEW=1` | `app/preview/*`, `lib/preview/mock.ts` | No `/discover` preview [D] |
| F39 | Structured PII-safe logging | Implemented, unit-verified | One JSON line per event; masks strings; reduces errors | `lib/log.ts` + `log.test.ts` [V] | Inherits mask gaps; no error-tracking service |
| F40 | Security headers / robots / sitemap / error boundaries | Implemented, build-verified | CSP, HSTS preload, X-Frame-Options DENY, nosniff; robots disallows the app | `next.config.ts`, `app/{robots,sitemap}.ts`, `app/{error,global-error}.tsx` | CSP allows `'unsafe-inline'` scripts (hardening) |
| F41 | Dev email test route | Implemented (dev only) | Sends a test email; returns 404 in any production build | `api/dev/send-test/route.ts` | Unauthenticated under `next dev` |
| F42 | Growth-research skill + market brief | Documentation only | Weekly market-research process and 5 ranked post-launch proposals | `.claude/skills/growth-research/SKILL.md`, `docs/research/2026-10-22-market-brief.md` | Nothing built |
| F43 | Automated payments / payout | Planned but not implemented | Escrow is manual; whether to automate is an open question (§13) | — | — |
| F44 | Twitch Helix / Kick / TikTok stats | Planned but not implemented | §9 names Twitch Helix; no code reads Twitch credentials | — | — |
| F45 | §11 roadmap (script ideas, copyright check, thumbnails, posting times) | Planned but not implemented | Post-launch | — | — |

---

## 6. Technical architecture

### 6.1 Stack (versions read from `node_modules`, 2026-10-29) [V]

| Layer | Technology |
|---|---|
| Language | TypeScript 5.9.3 (strict); SQL (Postgres) for migrations |
| Frontend / server | **Next.js 16.3.4** (App Router, Turbopack build), React 19.2.8, Tailwind CSS 4.3.3 (CSS-configured tokens in `src/app/globals.css`), Framer Motion 13.2.0, next-themes 0.4.6, `next/font/google` **Inter** |
| Backend | Next.js server actions (`src/app/**/actions.ts`) + route handlers (`src/app/api/**/route.ts`); `src/proxy.ts` (Next 16's replacement for `middleware.ts`) |
| Database / Auth / Realtime | Supabase: Postgres + RLS + column grants, Supabase Auth (email/password), Realtime on `messages` and `deal_chats`. Clients from `@supabase/ssr` 0.12.6 and `@supabase/supabase-js` 2.115.0 |
| AI | NVIDIA NIM, OpenAI-compatible chat completions, default model `meta/llama-3.3-70b-instruct` (`NVIDIA_DEFAULT_MODEL` in `src/lib/ai/nvidia-config.ts`, overridable via `NVIDIA_MODEL`). **Single provider by owner decision** |
| Email | Resend (outbound via REST in `src/lib/resend.ts` / `lib/email/outbound.ts`; inbound via webhook); React Email templates (`@react-email/components` 1.0.12, `@react-email/render`) |
| Runtime | Node 22 (CI and local v22.22.0) |
| Lint | ESLint 9 + `eslint-config-next` 16.3.4 |
| Hosting | Vercel (Hobby tier per spec) [D]; production domain `greenlightadvs.com` [D] |
| CI | GitHub Actions `.github/workflows/ci.yml`: npm ci → `tsc --noEmit` → eslint → `npm test` → `next build` (placeholder env) → `next start` + `scripts/webhook-e2e.mjs` |

No ORM; the app uses the Supabase query builder. No file/object storage bucket is used: email attachments are catalogued, not stored, and avatars are external URLs [C].

### 6.2 Directory map

```
src/
  proxy.ts                     route guard: session refresh, public paths, forced-reset pin
  app/
    page.tsx                   public landing
    (auth)/login, set-password login + forced reset
    (app)/                     authenticated shell (layout runs requireProfile)
      dashboard, inbox, inbox/[chatId], analyzer, discover, media-kit,
      pricing, settings, admin/{users,promo-codes,violations,system}
    api/webhooks/resend        inbound email (Svix-signed, public)
    api/webhooks/supabase      DB webhook → Discord (bearer)
    api/emails/send            admin email send
    api/oauth/[platform]/{start,callback}  YouTube/Instagram analytics OAuth
    api/dev/send-test          dev-only
    auth/signout               POST sign-out
    p/[slug]                   public creator profile (anon RPC)
    preview/*                  mock UI (no DB)
    terms, privacy, suspended, robots.ts, sitemap.ts
  components/                  views/*, dashboard/*, deals/*, media-kit/*, settings/*,
                               landing/*, legal/*, emails/*, brand/*, ui/*
  lib/
    supabase/{client,server,admin,session,is-configured,like}.ts
    auth.ts                    requireProfile / requireRole (+ ban + plan-expiry downgrade)
    ai/                        chat, nvidia-config, price-model, evaluate, rules (§7.4),
                               spam-filter, reply-draft, company-intel, niche, types
    email/                     verify (Svix), parse, intake, outbound, held, format, from
    deals/                     queries, directory, offer-quote (HMAC), reply-template,
                               company-intelligence
    media-kit/                 actions, platforms (tier rules), countries, queries, ...
    oauth/                     state (HMAC), tokens, youtube, instagram, platforms, config
    security/                  whois, safebrowsing, trust-score, check
    mask.ts, alias.ts, log.ts, rate-limit.ts, whatsapp.ts, resend.ts, plans.ts,
    subscription.ts, config.ts, i18n/*, constants/{contact,legal,site}.ts, types/database.ts
supabase/migrations/0001–0022  schema, RLS, grants, RPCs
supabase/tests/*.sql           9 rolled-back RLS/behaviour suites (need a Postgres URL)
scripts/                       bootstrap-admin, rotate-inbound-aliases, check-nvidia, webhook-e2e
docs/                          specs (2026-09-08), market brief (2026-10-22)
```

### 6.3 How the components communicate [C]

- **Browser → Next.js.**
  - Pages are server components. Mutations are server actions; Next 16 checks the request `Origin` against the host, and `next.config.ts` sets no `allowedOrigins`.
  - The browser also holds a Supabase client (anon key + user JWT) for Realtime subscriptions (`DealRoom.tsx`).
- **Next.js → Supabase.** Three clients:
  - **server client**: the user's cookies, subject to RLS (`lib/supabase/server.ts`);
  - **admin client**: the service role, bypasses RLS (`lib/supabase/admin.ts`), used for all deal and message writes after masking;
  - **browser client**.
  - Authorization layers:
    - `requireProfile` / `requireRole` read `profiles.role` from the DB;
    - RLS and column grants are the database layer;
    - SECURITY DEFINER RPCs (`creator_directory`, `creator_public_profile`) give fixed column projections.
- **Resend → Next.js.** `POST /api/webhooks/resend`, Svix HMAC over the raw body, ±5-minute window. Next.js calls Resend's REST API for relay and outreach.
- **Next.js → NVIDIA.** `chatJson()` runs with a 50s deadline, 32s per attempt and one retry. The fallback is rule-based pricing and templates.
- **Next.js → third parties.** IP2Whois, Google Safe Browsing, YouTube Data/Analytics, Meta Graph and WhatsApp Cloud API, all fixed hosts.
- **Supabase → Next.js → Discord.** A DB webhook (configured in the dashboard [U]) calls `/api/webhooks/supabase`.

### 6.4 Environment variables (names only; never values)

These are from `.env.example` and `lib/config.ts`.
- **Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_INBOUND_DOMAIN`, `NVIDIA_API_KEY`, `RESEND_API_KEY`, `RESEND_INBOUND_WEBHOOK_SECRET`, `RESEND_FROM_ADDRESS`.
- **Optional:** `NVIDIA_MODEL`, `NVIDIA_REASONING_EFFORT`, `YOUTUBE_API_KEY`, `GOOGLE_SAFE_BROWSING_API_KEY`, `IP2WHOIS_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET`, `META_APP_ID` / `META_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `SUPABASE_WEBHOOK_SECRET`, `DISCORD_SUPABASE_WEBHOOK_URL`, `DISCORD_GITHUB_WEBHOOK_URL`, `DISCORD_DEPLOYS_WEBHOOK_URL`, `NEXT_PUBLIC_ENABLE_UI_PREVIEW` (must be unset in production).
- **Read by no code:** `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`.

Two notes:
- All secrets are read at request time, never at build time [D][C].
- `SUPABASE_SERVICE_ROLE_KEY` also keys the OAuth-state and offer-quote HMACs [C].

---

## 7. Database and migration overview

### 7.1 Tables (all in `public`, all RLS-enabled [V]; exact live counts in §9)

| Table | Purpose | Key columns / rules |
|---|---|---|
| `profiles` | One row per auth user (PK = `auth.users.id`) | `role`, `region` (MENA/International), `subscription_plan` (Starter/Pro/Elite), `subscription_expires_at`, `inbound_alias` (unique), `previous_inbound_alias`, `primary_email`, `must_change_password`, `banned_at` / `banned_reason`, profile fields (`bio`, `avatar_url`, `country`, `primary_language`, `base_rate_usd`, `social_links` JSONB, `shareable_slug`), `whatsapp_number`, `whatsapp_notifications_enabled` |
| `media_kits` | Per creator × platform stats | `platform` CHECK (youtube, twitch, kick, instagram); self-reported `avg_views`, `avg_ccv`, `engagement_rate`, `content_category`, `content_language`, `declared_top_countries` JSONB; server-only `verified_top_countries`, `audience_verified`, `analytics_oauth_connected`, `last_synced_at`, `subscriber_count`, `channel_view_count`, `media_count`, `content_tags`; `platform_handle` |
| `deal_chats` | Deal room | `creator_id`, `company_id` (null = email/manual deal), `sender_email`, `deal_status` (new, negotiating, agreed, paid, disputed), `offered_amount`, `ai_evaluation` (green, yellow, red), `recommended_price_usd`, `sponsorship_type`, `target_countries[]`, `security_check`, `is_likely_sponsorship`, `company_profile` |
| `messages` | Chat messages | `chat_id`, `sender_id` (null = platform or inbound email), `message_text` (masked), `is_masked`, `relayed_at`, `relay_error` |
| `violation_logs` | §6 audit trail | `profile_id`, matched rules, `redacted_excerpt` (post-mask only), `reviewed_at` / `reviewed_by` |
| `inbound_emails` | One row per inbound delivery | `provider_message_id` UNIQUE (idempotency key), `status`, `detail`, `subject`, `spam_score`, `spam_reasons`; admin-read only; offer body never stored |
| `admin_actions` | Admin edit audit trail | action (incl. renewal), old/new values |
| `promo_codes` | Single-use trial codes | `code` PK, `is_used`, `expires_at`; atomic conditional UPDATE to redeem |
| `oauth_connections` | YouTube/Instagram tokens | UNIQUE (`creator_id`, `platform`); `access_token` / `refresh_token` in plaintext (no app-layer encryption); service-role only |
| `rate_limits` | Fixed-window counters | service-role only |

**Relationships [C].**
- `profiles.id → auth.users.id`, with cascade.
- `media_kits.creator_id`, `deal_chats.creator_id` and `deal_chats.company_id` reference `profiles` (cascade).
- `messages.chat_id → deal_chats`; `messages.sender_id → profiles`.
- The `violation_logs`, `admin_actions` and `oauth_connections` foreign keys go to `profiles`.

### 7.2 Functions, triggers, RPCs [C]

- `private.is_admin()`, `private.is_company()`, `private.is_deal_participant(uuid)`: SECURITY DEFINER helpers used by policies. They live in the non-exposed `private` schema; **`private` must never be added to the exposed schemas** [D].
- `public.creator_directory()`: SECURITY DEFINER with a fixed column list. Callable by signed-in users; returns rows only to company/admin callers; excludes banned creators.
- `public.creator_public_profile(p_slug)`: SECURITY DEFINER with a fixed column list. Callable by anon (public page).
- `public.consume_rate_limit(...)`: SECURITY INVOKER, `service_role` only.
- **No triggers** exist in any migration [V grep].

### 7.3 Authorization model [C] (final repo state)

- **anon:** no table grants (0005, 0011); only `creator_public_profile`.
- **creator / company:**
  - SELECT on their own profile, and on rooms and messages they are party to.
  - Companies can SELECT every `media_kits` row (0010).
  - UPDATE on their own `profiles` row, limited by column grants to `full_name` (0003) and the 0017 profile/WhatsApp columns.
  - INSERT/UPDATE on their own `media_kits` self-reported columns.
- **admin:** all rows via `private.is_admin()`.
- **Deal writes:**
  - In the final repo state (0022), `authenticated` has **no** INSERT/UPDATE on `deal_chats` and no INSERT on `messages`; all writes go through the service role after masking.
  - **0022 is not applied live** [V]. The live DB therefore still has the older client-write grants and policies (0003/0004/0010), which CLAUDE.md says were reproduced as exploitable (unmasked direct inserts; rooms opened in another creator's inbox) [D].
- **Live linter (2026-10-29) [V]:**
  - INFO: `oauth_connections`, `promo_codes` and `rate_limits` have RLS enabled but no policy. This is intended: service-role only.
  - WARN: `creator_public_profile` is executable by anon, and `creator_directory` / `creator_public_profile` by authenticated, as SECURITY DEFINER. Intended per README.
  - WARN: **leaked-password protection is disabled**. It is a Pro-plan feature per §16.

### 7.4 Migration history

Repo files `supabase/migrations/`, with the live state from `list_migrations` [V].

| # | File | Adds | Live? |
|---|---|---|---|
| 0001 | `init` | profiles, media_kits, deal_chats, messages | ✅ |
| 0002 | `forced_password_reset` | `profiles.must_change_password` | ✅ |
| 0003 | `rls_policies` | RLS policies + column grants | ✅ |
| 0004 | `rls_helper_schema` | move helpers to `private` | ✅ |
| 0005 | `revoke_anon_grants` | anon grants revoked, default privileges | ✅ |
| 0006 | `chat_and_violations` | violation_logs, `banned_at`, Realtime publication | ✅ |
| 0007 | `media_kit` | `platform_handle`, kit grants | ✅ |
| 0008 | `email_intake` | inbound_emails | ✅ |
| 0009 | `outbound_relay` | `relayed_at` / `relay_error` | ✅ |
| 0010 | `company_access` | company policies, `creator_directory()` | ✅ (recorded **twice** live) |
| 0011 | `company_access_revoke_anon_directory` | revoke anon on directory | ✅ (recorded **twice**) |
| 0012 | `admin_account_management` | admin_actions | ✅ |
| 0013 | `subscription_expiration_and_promo_codes` | expiry, promo_codes | ✅ |
| 0014 | `youtube_stats_and_renewal_action` | subscriber/view counts, renewal action | ✅ |
| 0015 | `oauth_connections` | token table | ✅ |
| 0016 | `content_tags_and_media_count` | `media_count`, `content_tags` | ✅ |
| 0017 | `creator_profile_and_deal_intelligence` | profile fields, WhatsApp, `security_check`, `creator_public_profile()` | ✅ (applied live *after* 0018) |
| 0018 | `deal_recommended_price` | `recommended_price_usd` | ✅ |
| 0019 | `rate_limits` | rate_limits + `consume_rate_limit()` | ✅ |
| 0020 | `alias_rotation` | `previous_inbound_alias` | ✅ |
| 0021 | `inbound_screening_and_company_profile` | subject / spam fields, `company_profile` | ✅ |
| **0022** | `server_only_deal_writes` | revoke client INSERT/UPDATE on deal_chats and messages; drop write policies | ❌ **NOT applied** [V] |

Note: README.md says "all migrations applied" and DEPLOYMENT.md says "all 21". Both are **stale** relative to the repo's 22.

### 7.5 Known schema issues / open questions

- **0022 is unapplied.** It is the single most important database gap [V]. An earlier attempt to apply it through the Supabase tools timed out on a confirmation gate. The owner should apply it in the SQL editor and then verify with `list_migrations` [D session history].
- TikTok is in the §7.3 matrix but not in the `platform` CHECK [C].
- No DB-level shape checks on JSONB (`declared_top_countries`, `social_links`). This drives audit lead A18.
- OAuth tokens are stored in plaintext [C].
- `authenticated` keeps default TRUNCATE/REFERENCES/TRIGGER table privileges (hardening note from the audit) [C].
- Which tables the Supabase **Database Webhook** forwards to Discord is configured outside the repo [U].
- The duplicated live migration entries for 0010/0011 are harmless history noise, but should be understood before any `supabase db push` [V].

---

## 8. Development history

All 76 commits are in the 2026-09-07 → 2026-10-22 range; GitHub PRs #1–#5 were merged in September [V git].

| Phase | Dates | What happened (evidence: commits + migrations + code) |
|---|---|---|
| **0. Spec & scaffold** | 2026-09-07 | `3f7fd3a` spec + brand assets. `8e566c2`: an initial 130-file, ~17.5k-line drop with the app shell, auth and forced reset, deal rooms, analyzer, media kit and migrations 0001–0009. `1047314` **replaced Gemini with NVIDIA** (Kimi K3) on the client's instruction. `a43a2f3` company-side access (0010/0011, Discover). |
| **1. Admin, monetization, integrations, UI overhaul** | 2026-09-08 | Admin account management (0012); subscription expiry + promo codes (0013); renewal (0014); WHOIS/Safe Browsing analysis; YouTube stats sync; OAuth placeholders; YouTube/Instagram OAuth connectors (0015); live metrics + niche detection (0016); landing page; app-wide theming; icon-only transparent logo; 5-language i18n + RTL; Discord webhook system. Design specs in `docs/superpowers/specs/`. |
| **2. Email, deal intelligence, policy pages** | 09-09 → 09-11 | Resend infra + React Email + `/api/emails/send` + SendInviteModal; refactor of Dashboard, Inbox, Media Kit and Settings plus a Pricing page (0017, 0018); PRODUCT.md and DESIGN.md; fix for the offer/recommendation mix-up (`5ae1824`); error boundaries + security headers; rate limits on AI spend (0019); Terms + Privacy. |
| **3. Launch readiness** | 09-13 → 09-15 | Social connections moved to Settings; dev-only email route; RLS suites made valid against a populated live project; all defaults pointed at `greenlightadvs.com`; HSTS preload; **PR #1 "production readiness for the greenlightadvs.com launch"**; verified sending domain; base64 attachments; reversible alias rotation onto the live inbound domain (0020); PRs #2–#3. |
| **4. Inbound screening + AI reliability** | 09-22 → 09-24 | Inbound spam screener and sender brief (0021, PR #4). Groq failover was **added (`ea40e00`) then removed two days later (`e32f9f7`)** on the owner's instruction, leaving NVIDIA as the only provider (model `z-ai/glm-5.3` at that time). NVIDIA diagnostics, then a time budget and retry policy (PR #5). Legal pages made final-form. |
| **5. Review fixes** | 10-17 → 10-18 | Budget-leak fix; held-deliveries panel for creators; overlap-merged contact masking (links win over phones); structured PII-safe logger. Merged to `main` (`ab34393`, 2026-10-22). |
| **6. Pre-launch hardening (branch only)** | 10-22 | `c6f7464` linear-time email mask; `6c49e0b` company-flow fixes: signed Discover quote, admin-only `paid`, and migration **0022**; `37204c4` / `e0acf19` CLAUDE.md §16 feature freeze + Definition of Done, model name updated to `meta/llama-3.3-70b-instruct`; `ea1b98f` growth-research skill + market brief. **Not merged to `main`.** |
| **7. Security audit (in progress, outside the repo)** | 10-23 → | Cloudflare-style security-audit workflow; artifacts live only in the session scratchpad, not the repo. Status in §10.2. |

**Model history [V git][D].** Gemini (spec) → NVIDIA `moonshotai/kimi-k3` → (Groq failover, removed) → `z-ai/glm-5.3` → `meta/llama-3.3-70b-instruct` (current code default).

**Superseded approaches [V].**
- Gemini.
- The Groq secondary provider.
- The dashboard "Coming Soon" AI card.
- Wordmark logos (replaced by the icon-only `icon_dark.webp` / `icon_light.webp`).
- Plan & billing inside Settings (moved to `/pricing`).
- The `connectAnalytics` stub described in the README (superseded by the real OAuth routes).

**Unfinished [C][D].**
- The OAuth provider apps have not been reviewed or approved.
- Twitch/Kick/TikTok stats.
- Re-evaluating a deal when a reply arrives.
- Real `CATEGORY_CPM` benchmarks.
- Labelling rooms by counterparty name.
- A Discover preview route.
- Legal entity details.
- Applying 0022.

---

## 9. Current verified implementation status (2026-10-29)

| Check | Result | Evidence |
|---|---|---|
| Working tree | Clean; branch `claude/eager-gauss-dox9tq` @ `ea1b98f`, 5 commits ahead of `origin/main` @ `ab34393` | [V] `git status`, `git rev-list` |
| Unit tests (`npm test`, 19 files) | **206 / 206 pass**, 0 fail | [V] |
| Typecheck (`tsc --noEmit --incremental false`) | **Pass**, 0 errors | [V] |
| Lint (`eslint`) | **Pass**, 0 problems | [V] |
| Production build (`next build`, clean copy of `ea1b98f`, placeholder env) | **Pass**: 37 routes + proxy | [V] |
| Webhook E2E (`scripts/webhook-e2e.mjs` vs local build) | **8 / 8 pass** | [V] |
| GitHub Actions CI | Latest runs **success** on `ea1b98f` (branch, run #123) and `ab34393` (`main`, run #116) | [V] GitHub API |
| SQL suites `supabase/tests/*.sql` (9 files) | **Not run** in this investigation (they need a Postgres URL); README reports earlier pass counts | [D] |
| Live DB migrations | 0001–0021 applied; **0022 not applied** | [V] |
| Live DB data | Exact counts: profiles 10 (creator 4, company 2, admin 4; 1 still `must_change_password`, 0 banned), media_kits 2 (1 `audience_verified`), deal_chats 6 (0 Discover, 0 paid; ratings red 4 / yellow 2), messages 16 (1 relay error: "RESEND_API_KEY is not configured"), violation_logs 4 (all unreviewed), inbound_emails 5 (last 2026-09-29), oauth_connections 1, promo_codes 1, admin_actions 15, storage buckets 0 | [V] `count(*)` |
| Live Resend history | 0 received emails and 0 webhook events visible through the API (retention window [U]) | [V] |
| Production deployment | **Not verifiable**: the Vercel API returned 403 and the site was unreachable through the sandbox proxy. Last observed (2026-10-22, earlier session) production built from `main` @ `ab34393` | [U] / [D] |
| Live Resend inbound payload | Never observed directly. Per Resend's docs the `email.received` webhook carries **metadata only**, and all 4 stored inbound offers equal the subject repeated, with 0 body characters (F1) | [D][V] |
| Live NVIDIA call / JSON format | Never verified from this environment | [D] |
| End-to-end production smoke test (§16 DoD item 3) | No evidence it has been run | [U] |

**What works, by level of evidence:**
- **Verified:** core logic (masking, the §7.4 cap, parsing, Svix verification, tier rules, quote signing, logger), the build, and the webhook signature gate.
- **Code-based only:** everything that touches Supabase, Resend, NVIDIA or the OAuth providers in a deployed environment.

---

## 10. Known bugs and unresolved risks

### 10.1 Confirmed issues [V or C, not speculative]

| ID | Issue | Feature | Files | Severity | Evidence | Status |
|---|---|---|---|---|---|---|
| K1 | Migration 0022 not applied; the live DB still allows signed-in clients to INSERT/UPDATE `deal_chats` and INSERT `messages` directly (bypassing the mask, spoofing rooms, un-paying deals) | Deal rooms, escrow | `supabase/migrations/0022_server_only_deal_writes.sql`; 0003, 0004, 0010 | **High** (per CLAUDE.md §12, reproduced earlier in a rolled-back transaction) | `list_migrations` [V]; CLAUDE.md §12 [D] | Open; owner must apply |
| K2 | Hardening commits not on `main` (signed quote, admin-only paid, linear email mask) | Discover, escrow, mask | commits `c6f7464`, `6c49e0b` | High (production lacks the fixes, if it runs `main`) | `git` [V] | Awaiting owner merge approval |
| K3 | Legal operator details empty | Terms/Privacy | `src/lib/constants/legal.ts` (`ENTITY_REGISTERED_NAME`, `ENTITY_ADDRESS`, `ENTITY_REGISTRATION` = `""`) | Launch blocker (§16.6) | [V] | Needs owner data; must not be invented |
| K4 | Leaked-password protection off | Auth | Supabase Auth settings | Medium | Advisor [V] | Pro-plan only; owner decision (§16.5) |
| K5 | Documentation drift: README/DEPLOYMENT say "all migrations applied"; DEPLOYMENT names default model `z-ai/glm-5.3`; README says OAuth and stats sync are "not built" and "company role has no RLS policy"; test counts disagree (105 / 143 / actual 206) | Docs | `README.md`, `DEPLOYMENT.md` | Low (but misleads operators) | [V] diff vs code | Open |
| K7 | TikTok is in the spec matrix but cannot be stored (`platform` CHECK) | Media kit | `0001_init.sql` | Low (product decision) | [V] | Flagged; product call |
| K8 | Supabase Free plan pauses after ~7 days of low activity; while paused, inbound offers fail | Ops | — | Medium | §16 [D] | Owner decision (Pro at $25/mo vs accept) |
| F1 | **Inbound email body never fetched.** Resend's webhook carries metadata only; the code reads `data.text`/`data.html` from the payload and never calls `GET /emails/receiving/:email_id` | §5 intake, Co-Pilot | `src/lib/email/parse.ts:319-347`, `intake.ts` | **High** (core flow broken; launch blocker) | Resend docs [D]; code [C]; live: all 4 stored inbound offers are subject-only [V] | Open; first proposed task |
| F2 | Idempotency key prefers `data.message_id` (the RFC Message-ID), so the same email forwarded to two creators collides and the second is dropped | §5 intake | `parse.ts:328-333` | Medium | Resend payload example [D]; code [C] | Open |
| M1 | YouTube Analytics query `dimensions=country&metrics=viewerPercentage` is not a supported report (`viewerPercentage` is demographics-only) | Verified geo (§7) | `src/lib/oauth/youtube.ts` | **High** for §7 (verified geo can never sync) | Google docs [D]; code [C]; the 1 connected creator never verified [V] | Open |
| M2 | 1 media kit has `audience_verified = true` and `analytics_oauth_connected = true` with **no** `oauth_connections` row: a "Verified" badge with no API behind it | §1/§7.2 anti-fraud promise | live data | **High** (makes a verified claim untrue) | [V] | Needs an owner-approved one-row data fix |
| M3 | Instagram code is pinned to Graph API v19.0, which Meta lists as available until 2026-05-21 (expired) | Instagram OAuth | `src/lib/oauth/instagram.ts` (5 places) | Medium (0 live connections) | Meta docs [D]; code [C] | Open; also needs Meta App Review |
| I1 | `extractOfferedAmount` handles only `$`/USD/dollars; misses EGP, جنيه, SAR, AED, €, and Arabic-Indic digits | Co-Pilot, deal data | `src/lib/email/parse.ts` | Medium (MENA offers lose their amount) | Local run, 6 of 10 cases null [V] | Open |
| I2 | Rule-based fallback rates **red** whenever reach data is missing (`evaluate.ts:100-103`), so "unknown" reads as "risky" | Co-Pilot | `src/lib/ai/evaluate.ts` | Medium | [C]; 2 of 4 creators have no kit [V] | Open |
| I3 | §7.4 cap tests `recommended_price_usd`, not the sponsor's offered amount | Co-Pilot | `evaluate.ts:105,144-147`, `rules.ts` | Spec interpretation | [C] | Owner decision D11 |

### 10.2 Security audit candidates (UNVERIFIED leads)

These came from independent "hunter" agents. Many hunters ran local sandboxed harnesses, but **no candidate has been through the audit's independent verifier stage yet**, so none is a confirmed finding. "Proposed" severity is the hunter's own estimate. Status: wave 2 is partly done (3 reviewers paused on usage limits); critics and verifiers are pending.

| ID | Proposed | Lead (short) | Main files |
|---|---|---|---|
| A1 | confirmed / medium | Banned admins can still use `POST /api/emails/send` (route checks role, not `banned_at`); arbitrary `from` | `src/app/api/emails/send/route.ts` |
| A2 | confirmed / medium | A ban is enforced only in `requireProfile`: RLS helpers and `creator_directory()` ignore `banned_at`, and banning never revokes Supabase Auth sessions, so direct PostgREST/Realtime access continues | `supabase/migrations/0004, 0010`; `admin/users/actions.ts`; `admin/violations/actions.ts` |
| A3 | confirmed / medium | Mask misses Arabic-Indic, Persian and full-width digits and invisible-character splits | `src/lib/mask.ts` |
| A14 | confirmed / medium | Mask misses grouped MENA formats (`+20 10 1234 5678`, `010 1234 5678`, `+966 50 …`, `+971 50 …`) | `src/lib/mask.ts` |
| A20 | confirmed / medium | Display name and media-kit text reach companies and relay emails unmasked | `settings/actions.ts`, `media-kit/actions.ts`, `email/outbound.ts`, 0010 |
| A6 | confirmed / medium | `createDealFromAnalysis` lacks the analyzer's rate limit, 20k-character cap and role gate; rating and price come unsigned from hidden fields | `src/app/(app)/analyzer/actions.ts` |
| A7 | needs validation | Relay email unthrottled to a caller-typed `sender_email` (shared Resend quota, domain reputation) | `inbox/[chatId]/actions.ts`, `email/outbound.ts` |
| A8 | confirmed / low | Login `next` accepts `//host` and `/\host` (open redirect) | `src/app/(auth)/login/actions.ts` |
| A9 | lead (re-review pending) | `must_change_password` enforced only by the proxy; `requireProfile` and RLS never check it; the proxy skips image-extension and `/preview*` paths | `src/proxy.ts`, `lib/supabase/session.ts`, `lib/auth.ts` |
| A10 | confirmed / low | A failed inbound delivery is never reprocessed (a failed claim makes the provider's retry look like a duplicate) | `src/lib/email/intake.ts` |
| A11 | confirmed / medium | Inbound sender text is stored and rendered with the same "via Green Light" provenance as the Co-Pilot verdict (counterfeit verdicts possible) | `intake.ts`, `DealRoom.tsx` |
| A12 | confirmed / medium | OAuth link accepts any channel or IG account the user can authorize; not bound to the kit's `platform_handle`; shareable across creators | `api/oauth/[platform]/callback/route.ts`, `lib/oauth/*`, `media-kit/actions.ts` |
| A13 | confirmed / low | Verified-geo syncs continue after the plan lapses (gate only at OAuth start) | `media-kit/actions.ts` |
| A15 | needs validation | Supabase DB webhook forwards whole unmasked rows (emails, phones, OAuth tokens) to Discord; depends on dashboard config | `api/webhooks/supabase/route.ts`, `lib/discord/logger.ts` |
| A16 | needs validation | Unauthenticated inbound mail drives unbounded paid NVIDIA, WHOIS, Safe Browsing and WhatsApp work | `intake.ts`, `rate-limit.ts` |
| A4 | needs validation | Deal-room assignment and domain trust are bound to the unauthenticated `From` header (spoofing into open rooms) | `intake.ts`, `spam-filter.ts` |
| A5 | needs validation | Idempotency key prefers the sender-chosen RFC Message-ID, so one creator's copy can suppress another's | `src/lib/email/parse.ts` |
| A17 | confirmed / low | §7.4 cap is keyed on the engine's own recommended price, not the offered amount | `src/lib/ai/evaluate.ts`, `types.ts` |
| A21 | needs validation | Prompt builders interpolate party-controlled text raw (section markers forgeable) | `src/lib/ai/{price-model,company-intel,reply-draft}.ts` |
| A18 | confirmed / medium | A malformed `declared_top_countries` (writable via PostgREST) crashes the whole company Discover page | `CountryShareList.tsx`, `DiscoverView.tsx`, 0003 |
| A19 | confirmed / low | Starter 2-platform limit bypassable by a direct `media_kits` INSERT | 0003/0004, `media-kit/actions.ts` |
| A22 | confirmed / low | Discover shows creator-typed `avg_views` on a card the header calls "verified" when geography is verified; conflicts with the Terms §5 promise | `DiscoverView.tsx`, `app/terms/page.tsx` |

Cleared in the same audit (no issue found) [C]:
- no live credentials anywhere in the 76-commit git history;
- the CI workflow cannot leak secrets to PR code;
- HMAC keys are separated and compared in constant time;
- admin server actions are correctly role-gated;
- the dev route is dead in production builds;
- React escaping holds (no XSS sink found);
- RLS isolates other users' `profiles` rows;
- verified media-kit columns are not client-writable;
- Realtime is scoped by RLS.

Audit working files (session-local, not in the repo): `security-audit/green-light-analyizer/run-1/` in the session scratchpad (`coverage-ledger.json`, `candidates/`, `results/`, `agents/*/artifacts/evidence/`).

---

## 11. Testing and build status

| Suite | Command | Last result | Notes |
|---|---|---|---|
| Unit (node:test) | `npm test` | **206/206 pass [V]** | Covers mask, log, alias, config, subscription, AI config/rules/spam-filter, deals (offer-quote, reply-template), email (format, held, parse, verify), media-kit (countries, platforms), security trust score, supabase `like`, youtube engagement |
| Typecheck | `npx tsc --noEmit` | **Pass [V]** | tsconfig `incremental: true` writes `tsconfig.tsbuildinfo` (gitignored) unless `--incremental false` |
| Lint | `npx eslint` | **Pass [V]** | — |
| Build | `npm run build` | **Pass [V]** | `next/font/google` (Inter) needs network at build time |
| Webhook E2E | `npm run build && npm run start -- -p 3666 &` then `node scripts/webhook-e2e.mjs` | **8/8 [V]** | Needs `RESEND_INBOUND_WEBHOOK_SECRET` set to a throwaway Svix-format secret (CI defines one) |
| DB suites | `psql "$DATABASE_URL" -f supabase/tests/<file>.sql` | Not run [U]; README claims passes | They roll back by design, but running them against production is still an owner decision |
| CI | `.github/workflows/ci.yml` | Green [V] | No `permissions:` block; actions pinned by tag (hardening) |

No component, browser or integration test suite exists for the UI [C].

---

## 12. Production readiness

### 12.1 Verified launch blockers (from the §16 Definition of Done)

1. **Migration 0022 not applied** [V].
2. **Branch not merged to `main`, so production lacks the hardening** [V git]. Production deployment state itself: [U].
3. **Legal pages lack the operator's registered name, address and registration** [V].
4. **Production smoke test not evidenced** [U]: admin creates accounts → forced reset → alias mail opens a room → Discover offer → masked chat → agreed → admin marks paid.
5. **Supabase Auth:**
   - password policy hardening and Site/redirect URLs [U];
   - leaked-password protection off [V], Pro-only.

### 12.2 Potential risks (unverified)

- **Security-audit leads A1–A22** (§10.2), especially:
  - ban enforcement (A2);
  - mask gaps (A3, A14, A20);
  - paid-spend amplification (A6, A7, A16);
  - OAuth binding (A12).
- **Provider behaviour never observed live:** the Resend inbound payload shape, NVIDIA JSON-mode behaviour and the WhatsApp template rules.
- **Supabase Free plan:** auto-pause, and no point-in-time backups on Free [U].
- **NVIDIA trial terms:** up to 30 days of retention, which may conflict with §12's "not logged/forwarded anywhere" [D].

### 12.3 Area summary

| Area | State |
|---|---|
| AuthN/AuthZ | Supabase Auth + `requireProfile` / `requireRole` + RLS + column grants + DEFINER RPCs [C]. Weak spots: bans and the forced-reset pin are app-layer only (A2, A9) |
| Data integrity | Server-authoritative columns are withheld from clients by grant [C]. 0022 not live [V]. Signed Discover quote is branch-only [V] |
| DB security | RLS on all tables [V]; `private` schema helpers; advisor warnings are intended, except leaked-password protection [V] |
| Secrets | Env-only, request-time reads; none in git history (audit scan) [C]. Service-role key doubles as the HMAC root (rotation invalidates OAuth state and quotes) [C] |
| Error handling | Error boundaries render a digest only; integrations degrade quietly; AI falls back to labelled heuristics [C] |
| Logging / monitoring | JSON-line logger with masking (`src/lib/log.ts`) [V unit]; no Sentry or other error service [D]; `/admin/system` shows env presence |
| Backups / recovery | Nothing in the repo. Depends on the Supabase plan [U] |
| Deployment config | Vercel Git integration (not in repo); no `vercel.json` [C]; Preview-environment secret scoping [U]; `NEXT_PUBLIC_ENABLE_UI_PREVIEW` must be unset |
| Production env requirements | See §6.4; DNS needs apex/www to Vercel, MX for `analyze.` to Resend, SPF/DKIM/DMARC for sending [D] |

---

## 13. Product decisions and constraints (do not change without owner approval)

These come from CLAUDE.md and PRODUCT.md [D].

- **No self-signup**, ever. All access CTAs go to Discord or WhatsApp.
- **No in-app billing or payment processor** for the MVP; plans are handled via Discord; escrow is manual.
- **NVIDIA is the only AI provider.** Do not add a second one (Groq was removed on instruction). Default model `meta/llama-3.3-70b-instruct`.
- **Email intake stays OAuth-free:** no Gmail API, no CASA review.
- **Never use `mailto:`** for creator replies; always the platform relay (it protects the creator's address).
- **The §6.1 mask runs server-side before persistence.** Link > email > phone precedence; keep the Egyptian pattern.
- **Data is "verified" only if an API wrote it**; everything else is labelled self-reported.
- **The §7.4 cap is enforced in code**, after the model answers, not in the prompt.
- **`inbound_emails` stays admin-only.** Creators see held mail only through the service-role projection in `held.ts` (no creator RLS policy, because RLS can't gate columns).
- **Brand:**
  - exact palette;
  - "Liquid Glass" design;
  - icon-only transparent logo switching with the theme;
  - Inter;
  - five languages with Arabic RTL;
  - theme-reactive `--color-fg` token.
- **Zero-cost stack** (§9); bending it (Supabase Pro, for example) is the owner's call.
- **Feature freeze** (§16): only launch blockers until launch.
- **Never invent the legal entity details**; never fabricate testimonials or usage numbers.
- **Never expose a creator's `primary_email`, `whatsapp_number` or `inbound_alias` to a company.** Never prefix `SUPABASE_SERVICE_ROLE_KEY` with `NEXT_PUBLIC_`.

---

## 14. Planned features and preliminary roadmap

**Everything in this section is a recommendation**, except where it is labelled as an existing requirement. Nothing here has been implemented.

### P0: Critical safety, security and data integrity

| Task | Why | Depends on | Modules |
|---|---|---|---|
| Apply migration 0022 to the live DB; re-run `list_migrations` and the SQL suites | Live client write path bypasses masking and escrow (K1) | Owner access to the SQL editor | `supabase/migrations/0022_*.sql` |
| Merge the 5 branch commits to `main` and confirm the production deploy | Production lacks the signed quote, paid lock and linear mask (K2) | Owner approval | — |
| Finish the security audit: resume the 3 paused reviewers, run the gap check, independent verifiers, then the report | Turn A1–A22 into confirmed or rejected findings with fixes | — | audit run directory |
| Then fix the verified ban, mask and authorization findings (likely A2, A3/A14/A20, A1, A6, A9) | Commission protection and permanent-ban promises | Audit verification; §16 allows launch-blocker fixes | `mask.ts`, `auth.ts`, 0004/0010 helpers, `analyzer/actions.ts`, `emails/send/route.ts` |

### P1: Core functionality and launch blockers (§16 DoD = existing requirements)

- Fill the legal entity fields with the owner's real data (K3).
- Run the production smoke test with real test accounts.
- Supabase Auth: Site URL, redirect URLs, password rules; decide Pro vs Free (pause risk, leaked-password protection).
- Confirm every required env var on `/admin/system`; keep `NEXT_PUBLIC_ENABLE_UI_PREVIEW` unset.
- **Fix F1** (fetch the email body from Resend's Received Emails API), then observe one real delivery to a test alias.
- Send one real NVIDIA evaluation and check the output.
- Owner decision §16.7: should Discover deals keep showing the company's real `sender_email` to the creator?

### P2: Incomplete features and important improvements (recommended)

- Rate limits on unthrottled paid paths: relay, inbound intake, syncs, `createDealFromAnalysis`, `redeemCode`.
- Fix inbound retry-claim recovery (A10) and the idempotency key (A5).
- Separate provenance for platform messages vs inbound email (A11).
- JSONB shape checks / render normalisation (A18).
- Correct the docs (K5).
- Label deal rooms by counterparty name; add a Discover preview route.
- Re-evaluate deals when replies arrive; real `CATEGORY_CPM` benchmarks.

### P3: New product features (post-launch; from `docs/research/2026-10-22-market-brief.md`, plus §11)

1. Verified reach: price on engaged views.
2. Go-live verification + verified 7/30/90-day reports.
3. Licensed-creator badge (UAE Advertiser Permit).
4. Usage rights and exclusivity, priced by the Co-Pilot.
5. "Payment-protected" positioning.

Also:
- verified audience geo once Google/Meta reviews pass (§16 fast-follow);
- the §11 roadmap: script/video ideas, copyright check, thumbnails, posting times;
- Twitch/Kick/TikTok data if APIs allow;
- automated escrow/payouts (open question §13).

### P4: Performance, maintainability, long term (recommended)

- Error-tracking service, or a Vercel log drain.
- Encrypt OAuth tokens at the application layer.
- Derive separate, labelled HMAC keys instead of reusing the service-role key raw.
- Nonce-based CSP (drop `'unsafe-inline'`).
- CI: a `permissions:` block and SHA-pinned actions; a dependency-advisory check (needs network).
- Browser/E2E UI tests.
- Revoke stray table privileges (`TRUNCATE` / `REFERENCES` / `TRIGGER`).
- Consolidate the duplicate migration history entries before any `supabase db push`.

---

## 15. Open questions for the project owner

These are things the repository cannot answer.

1. Which commit is production serving right now, and is the Vercel project healthy? (Not verifiable from here.)
2. Will you apply migration 0022 and approve merging the 5 branch commits to `main`?
3. What are the operator's registered legal name, address and registration number for the Terms and Privacy pages?
4. Supabase Pro ($25/month) or Free with the pause and leaked-password risks accepted?
5. Should Discover deals keep showing the company's real email to the creator (§16.7)?
6. Escrow and payout mechanics after `paid`: stay manual via Discord, or be automated later? (§13)
7. Is `region` (MENA/International) chosen by an admin at account creation, or auto-detected? (§13)
8. Does verified audience geography ship at launch or as a fast-follow? Have the Google OAuth verification and Meta App Review been started?
9. Which tables, if any, is the Supabase Database Webhook to Discord attached to, and who can read that Discord channel?
10. Has a creator forwarded any mail since 2026-09-29 (the last recorded delivery)? Is the Google OAuth consent screen in "Testing" (7-day refresh tokens) or "In production"?
11. Should "external links" (non-messenger URLs) be masked too? §6 prose says yes; the reference rule covers only five link shapes.
12. Should TikTok be storable as a media-kit platform?
13. Which of the 10 live profiles and 6 deal rooms are test accounts, and may they be cleared before launch? (Counts in §9; no personal data was read.)
14. Company name: a list of "Green Light + suffix" names was discussed (for example "Green Light Nexus"). Has an official registered name been chosen?

---

## 16. Important file and directory references

| Purpose | Path |
|---|---|
| Spec / single source of truth | `CLAUDE.md` (§1–§16; note §16 feature freeze) |
| Product context | `PRODUCT.md` |
| Design system | `DESIGN.md`, `src/app/globals.css` |
| Setup / deploy (partly stale) | `README.md`, `DEPLOYMENT.md`, `.env.example` |
| Route guard | `src/proxy.ts`, `src/lib/supabase/session.ts` |
| Auth helpers | `src/lib/auth.ts` |
| Masking | `src/lib/mask.ts` (+ `mask.test.ts`) |
| AI engine | `src/lib/ai/chat.ts`, `nvidia-config.ts`, `price-model.ts`, `evaluate.ts`, `rules.ts` |
| Inbound email | `src/app/api/webhooks/resend/route.ts`, `src/lib/email/{verify,parse,intake}.ts`, `src/lib/ai/spam-filter.ts` |
| Outbound relay | `src/lib/email/outbound.ts`, `src/lib/resend.ts` |
| Deal room actions | `src/app/(app)/inbox/[chatId]/actions.ts` |
| Discover | `src/app/(app)/discover/actions.ts`, `src/lib/deals/offer-quote.ts` |
| Analyzer | `src/app/(app)/analyzer/actions.ts` |
| Media kit / OAuth | `src/lib/media-kit/actions.ts`, `src/lib/oauth/*`, `src/app/api/oauth/[platform]/*` |
| Rate limits | `src/lib/rate-limit.ts`, `supabase/migrations/0019_rate_limits.sql` |
| Logging | `src/lib/log.ts` |
| Config readiness | `src/lib/config.ts`, `src/app/(app)/admin/system/page.tsx` |
| Legal constants | `src/lib/constants/legal.ts`; contact links `src/lib/constants/contact.ts` |
| Schema & policies | `supabase/migrations/0001…0022` |
| DB tests | `supabase/tests/*.sql` |
| Scripts | `scripts/bootstrap-admin.mjs`, `rotate-inbound-aliases.mjs`, `check-nvidia.mjs`, `webhook-e2e.mjs` |
| CI | `.github/workflows/ci.yml` |
| Specs & research | `docs/superpowers/specs/*.md`, `docs/research/2026-10-22-market-brief.md`, `.claude/skills/growth-research/SKILL.md` |

Supabase project ref: `kpuecrvdrkhemyvibyfa` (eu-central-1) [D]. Production domain: `greenlightadvs.com`; inbound domain: `analyze.greenlightadvs.com` [D].

---

## 17. Exact commands

```bash
# Install (CI uses npm ci with the committed lockfile; needs registry access)
npm ci

# UI only, no keys: renders /preview with mock data (works only while Supabase is unconfigured)
npm run dev                         # http://localhost:3000

# Real product locally
cp .env.example .env.local          # fill in the Supabase keys (never commit .env.local)
node scripts/bootstrap-admin.mjs "Your Name" you@example.com   # first admin; prints a temporary password
npm run dev

# Checks (all read-only)
npm test                            # 206 unit tests (node --experimental-strip-types --test ...)
npx tsc --noEmit --incremental false
npx eslint
npm run build                       # needs network for next/font/google; secrets are read at request time
                                    # CI builds with NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
                                    #             NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key

# Webhook signature gate, end to end against a local build
RESEND_INBOUND_WEBHOOK_SECRET=<throwaway whsec_ value> npm run start -- -p 3666 &
node scripts/webhook-e2e.mjs        # expect 8/8

# DB suites (they roll back; run against production only with owner consent)
for f in supabase/tests/*.sql; do psql "$DATABASE_URL" -f "$f"; done

# NVIDIA diagnostics (makes one real, billable call; needs NVIDIA_API_KEY)
node scripts/check-nvidia.mjs
```

---

## 18. Most useful next steps

0. **Approve the first fix: F1** (inbound body fetch; plan in `docs/GREEN_LIGHT_IMPLEMENTATION_ROADMAP.md` §9). It is a §16 launch blocker and unblocks the Co-Pilot.
1. **Confirm the production baseline.** Which commit is live, and is `/admin/system` clean? Then get the owner to apply **0022** and approve merging the branch (P0).
2. **Finish the security audit** so A1–A22 become verified findings or rejections. Then fix only the verified launch blockers, respecting the §16 freeze.
3. **Close the §16 Definition of Done:**
   - legal entity data;
   - Supabase Auth settings and plan decision;
   - one real Resend inbound delivery and one real NVIDIA evaluation;
   - the full production smoke test with test accounts.
4. **Bring the docs back in line with the code** (README and DEPLOYMENT drift) so the next operator isn't misled.
5. **After launch:** the rate-limit and integrity hardening in P2, then the market-brief features in P3.

*End of brief.*
