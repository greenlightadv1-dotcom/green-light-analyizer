# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: **Creators** — the content creators who receive sponsorship offers, connect their platform accounts (YouTube/Twitch/Instagram), and negotiate deals through Green Light's masked chat. Their situation: fielding inbound sponsorship interest (via a forwarded email alias or in-app offers) and needing fast, trustworthy pricing/risk guidance without doing the analysis themselves.

Secondary, and explicitly not an afterthought: **Companies/sponsors** — browse and offer to creators via Discover, negotiate through the same masked chat, and never see a creator's real contact info. Confirmed weighting from the user: creators are the primary design priority, but companies are a real second audience whose trust in the same data closes the deal.

Also present: **Admins** — the only role that can create accounts (no self-signup anywhere in the product); they manage users, promo codes, and the violation queue. Internal/operational audience, not a design-priority audience the way creators and companies are.

## Product Purpose

Green Light is an admin-gated sponsorship marketplace connecting Creators and Companies for paid sponsorship deals, taking a 5–15% commission on every deal settled through an internal escrow flow (`deal_status` progression: `agreed → paid`, reconciled manually via Discord for now — no live payment processor is wired up). It exists to replace the informal, screenshot-based, DM-negotiated sponsorship deals creators currently do off-platform with something verifiable and commission-safe.

Success means: creators trust the pricing/risk guidance enough to negotiate through the platform rather than off it, and companies trust the audience data enough to close deals without ever needing a screenshot.

## Positioning

Three things a neighboring sponsorship marketplace could not truthfully copy without becoming this product:

1. **Kill screenshot fraud** — creator stats trace back to an official platform API sync (YouTube Data API, Twitch Helix, platform Analytics/Insights APIs) or are explicitly labeled self-reported; nothing is ever presented as verified unless it actually came from an API.
2. **Protect platform commission structurally, not by policy** — a creator's real email/phone is never rendered anywhere in a company's view; every outgoing message is server-side regex-filtered (email/phone/social handles) before it is stored; a creator's in-app reply is relayed to the company as an official email from the platform's own sending address; off-platform contact exchange is a permanent ban, not a warning.
3. **AI "Deal Co-Pilot"** — every inbound offer gets an instant price recommendation plus a green/yellow/red risk rating, weighted by how verified the underlying audience data actually is (unverified self-reported geography caps the rating at yellow on a high-value deal — it can never alone produce green).

## Operating Context

- **Admin-gated onboarding** — an admin manually creates every account (creator or company) from a trusted shell (`scripts/bootstrap-admin.mjs` for the first admin); the system issues a temporary password and forces a reset on first login, enforced server-side.
- **Email intake pipeline** — each creator gets a unique inbound alias (`{handle}.{random}@analyze.greenlight.com`); they set up a one-time Gmail auto-forward from their real, unchanged public email to that alias (deliberately OAuth-free — no Gmail API, no CASA review); Resend receives the inbound mail and webhooks the backend, which evaluates the offer via AI and auto-converts it into a Deal Chat Room. A Manual Analyzer is the lightweight fallback (paste sender/message/type/target-countries, get an instant recommendation), reusing the same evaluation function.
- **Deal negotiation** — deals arrive from two sources: in-app (via Discover, `company_id` set) or forwarded/manual (`company_id` null). Each is worked in a masked chat/negotiation workspace, with company/domain intelligence (WHOIS, trust score, the creator's own history with that sender domain) shown for the non-in-app case, an AI-drafted reply generator, and deal-status tracking (`new → negotiating → agreed → paid`, or `disputed`).
- **Media Kit** — per-platform stats (avg views, engagement, declared vs. verified audience geography, niche/tags) plus a friendlier Creator Profile layer (avatar, bio, country, language, base rate, social handles) and a shareable public profile link.
- **Settings & Pricing** — account (display name, password — email is permanently read-only), the email-forwarding alias setup, WhatsApp new-deal notifications; a separate Pricing page carries the plan cards and promo-code redemption. All billing/plan changes happen manually via Discord support tickets, never in-app.
- **Platform-wide** — light/dark theme (system-default), five-language i18n with full RTL support for Arabic, and a public marketing landing page that routes every "get access" CTA to Discord/WhatsApp rather than a signup form.

## Capabilities and Constraints

- No public self-signup exists anywhere in the product, by design — a hard trust/vetting constraint, not a growth limitation to fix later.
- No live payment processor is wired up; commission/escrow is modeled in `deal_status` and reconciled manually via admin/Discord. Whether/when this becomes automated is an open, undecided question (carried over from CLAUDE.md §13).
- Email intake is deliberately OAuth-free (no Gmail API, no CASA security review); verified audience geography (YouTube/Instagram Analytics OAuth) is a separate, optional, paid-tier-gated capability with its own lighter OAuth review.
- AI text processing (pricing/risk evaluation, reply drafting) is evaluation-only — offer/chat text is never logged or forwarded anywhere it could train a general-purpose model.
- Twitch, Kick, and TikTok have no verified-audience-geography path in the MVP (no suitable public API); those platforms are declared-only, clearly labeled self-reported — revisit if the platforms open deeper access later.
- Zero-cost MVP tech constraint (existing codebase; see README/CLAUDE.md §9 for the full stack table): Next.js on Vercel's Hobby tier, Supabase free tier, Resend free tier — every integration (Resend, the AI engine, YouTube/Twitch APIs, OAuth connections, WhatsApp notifications) degrades quietly (skips, never blocks the core flow) when unconfigured.
- Terminology: "Deal Chat Room" (per-deal masked conversation), "Deal Co-Pilot" (the AI price/risk assistant), "masked chat" (the contact-info-stripping relay), "verified" vs. "self-reported" (an exact, load-bearing distinction never to blur in UI copy).

## Brand Commitments

- Name: **Green Light** — "Your Personal Business Manager."
- Palette (exact, do not approximate): navy `#293E61`, navy-dark `#1F2E47`, brand green `#62E823`, white `#FFFFFF`, ink/black `#231F20`.
- Design language: "Liquid Glass" — glassmorphism panels (navy-tinted, blurred, subtle border) floating over a near-black base, with soft animated glow orbs behind them; Framer Motion for panel/route transitions.
- Logo: icon-only (no wordmark in-app), genuinely transparent, switching with theme — `icon_dark.webp` (white mark, dark surfaces) / `icon_light.webp` (navy mark, light surfaces). No custom typeface was supplied; the UI currently uses a geometric/grotesk sans.
- Primary market: MENA (region-aware pricing; Vodafone Cash/InstaPay/Meeza payment rails alongside PayPal/Crypto internationally). Arabic is a first-class supported language with full RTL.

## Evidence on Hand

Pre-launch: no real creators, companies, or closed deals yet (confirmed by the user). The Supabase project runs on the free tier with all migrations applied; there is no production usage data. Future work must not fabricate testimonials, user counts, logos, or case studies — the landing page and any marketing surface should read as pre-launch/early-access, with every "request access" path routing to Discord/WhatsApp rather than implying self-serve signup.

## Product Principles

1. **Nothing is "verified" unless it came from an API.** Self-reported data is always visibly labeled as such, everywhere it appears, permanently — this is not a launch-phase shortcut.
2. **Structural commission protection, not policy enforcement.** Contact-info leakage is prevented server-side before persistence, not caught after the fact; violations are a permanent ban, not a warning.
3. **Admin-gated trust over growth velocity.** Manual account creation and Discord-mediated billing are deliberate trust/cost trade-offs for this stage, not gaps to silently "fix" with self-signup or in-app billing.
4. **Quiet degradation, never a broken core flow.** Every optional integration (AI, email, OAuth, WhatsApp) fails soft; a missing key skips a feature, it never breaks deal creation or negotiation.
5. **Creators first, companies close behind.** Design and product priority favor the creator's daily workflow (pricing confidence, contact protection, fast negotiation) without treating companies as an afterthought — they are the second half of every deal and must trust the same data.
