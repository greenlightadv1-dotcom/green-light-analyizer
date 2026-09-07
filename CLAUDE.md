# Green Light — Project Spec for Claude Code

> "Your Personal Business Manager" — an admin-gated sponsorship marketplace
> connecting Creators and Companies. Read this file before writing any code.
> It is the single source of truth for brand, design system, data model,
> business logic, and tech stack. Ask before deviating from anything below.

---

## 1. What this product is

Green Light is a closed, admin-vetted marketplace (`Admin-Gated Sponsorship
Marketplace`) that connects content **Creators** with **Companies/Sponsors**
for paid sponsorship deals. The platform takes a **5–15% commission** on every
deal, settled through an internal escrow flow.

### Core value propositions (design every feature around these)
1. **Kill screenshot fraud** — creators are verified via official platform
   APIs (YouTube Data API, Twitch Helix, and platform-specific Insights/
   Analytics APIs — see §7), never via self-reported screenshots. Stats
   shown anywhere in the product must trace back to an API sync or be
   clearly labeled as self-reported (see §7).
2. **Protect platform commission** — a Creator's real email/phone must never
   reach a Company. All contact happens through the platform so the
   commission cannot be bypassed.
3. **AI "Deal Co-Pilot"** — every inbound offer gets an instant price
   recommendation plus a risk rating: `green | yellow | red`, weighted by
   how verified the underlying audience data is (see §7.3).

---

## 2. Brand & Design System

### 2.1 Color palette (exact hex — do not approximate)

| Token | Hex | Usage |
|---|---|---|
| `navy` (Deep Obsidian) | `#293E61` | Primary brand color, headers, dark surfaces, primary buttons |
| `navy-dark` | `#1F2E47` | Deepest backgrounds, code blocks, cover/hero sections |
| `green` (Electric Neon Green) | `#62E823` | Accent, CTAs, success/positive states, highlights, the `G` wedge in the logo |
| `white` | `#FFFFFF` | Text on dark surfaces, light-mode backgrounds |
| `black` | `#231F20` | High-contrast text on light backgrounds |

> Note: an earlier draft of this spec referenced `#10B981` (teal-green) as
> the accent — that was a placeholder. **`#62E823` is the confirmed brand
> green**, sampled directly from the client's approved logo/palette artwork.
> Use `#62E823` consistently; do not mix in `#10B981`.

Suggested Tailwind config:
```js
// tailwind.config.js
theme: {
  extend: {
    colors: {
      navy: { DEFAULT: '#293E61', dark: '#1F2E47' },
      brand: { green: '#62E823' },
      ink: '#231F20',
    },
  },
}
```

### 2.2 Design language: "Liquid Glass"

An advanced glassmorphism style. Every panel/card follows this recipe:
```css
.glass-panel {
  background: rgba(41, 62, 97, 0.35); /* navy tint */
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
}
```
- Base app background: `#0A0D14` (deep obsidian, near-black) for the dark
  theme shell — glass panels float on top of this.
- **Liquid Glow Orbs**: large, soft, blurred radial-gradient blobs (green and
  navy) positioned absolutely behind the glass panels, animated with slow
  drift, to give the ambient depth typical of this style.
- **Motion**: use Framer Motion for all panel/route transitions — fade + slight
  scale/translate, nothing abrupt.

### 2.3 Logo usage

Assets are in `/assets` next to this file:

| File | Use on | Description |
|---|---|---|
| `assets/logo_light_full.png` | Light/white backgrounds | Full horizontal lockup — navy "REEN" + green "LIGHT" wordmark with green/navy pie-chart "G" icon and tagline |
| `assets/logo_dark_full.png` | Navy / dark backgrounds | Same lockup, white "REEN" + green "LIGHT" wordmark, for the dark theme / hero / cover contexts |
| `assets/icon_color.png` | Favicons, avatars, small UI marks | Icon only (no wordmark), transparent background, navy + green — works on both light and dark surfaces |

Rules:
- Never recolor the wordmark outside navy/green/white.
- Minimum clear space around the logo ≈ the height of the icon's "G" mark.
- On the dark theme (the app's default), prefer `logo_dark_full.png` in the
  nav/header and `icon_color.png` as the favicon / collapsed sidebar mark.

### 2.4 Typography
- No custom typeface was supplied — use a clean geometric/grotesk sans
  (e.g. `Inter` or `Manrope`) for UI text.
- Headings: bold, navy on light surfaces / white on dark surfaces.
- The logo's own lettering is a custom blocky display face baked into the
  PNG — do not try to recreate it in a web font; always use the logo image
  for the wordmark itself.

---

## 3. User roles

```
creator | company | admin
```
- **admin**: the only role that can create accounts. No self-signup exists
  anywhere in this product.
- **creator**: receives sponsorship offers, connects platform accounts
  (YouTube/Twitch/Instagram), negotiates deals through the masked chat.
- **company**: browses/creates offers to creators, never sees a creator's
  real contact info.

---

## 4. Onboarding (Admin-Gated — build this first, it gates everything else)

1. Admin manually creates every account (creator or company). There is no
   public registration form.
2. System generates a temporary password and **forces a password reset on
   first login** — this must be a hard redirect/guard, not optional.
3. Plan upgrades, subscription changes, and payment confirmation are **not**
   handled in-app — they are handled manually via **Discord support
   tickets**. The app should surface a "manage via Discord" CTA rather than
   building its own billing UI for the MVP.
4. Payment rails referenced in support flows: Vodafone Cash / InstaPay /
   Meeza (MENA region), PayPal / Crypto (international).

---

## 5. Email intake pipeline (sponsorship detection)

This is the core automation loop. Build it exactly as follows — do not
introduce Google OAuth, the Gmail API, or a CASA security review anywhere in
this flow; it's intentionally OAuth-free.

1. On signup, each creator is issued a unique inbound alias:
   `{handle}.{random}@analyze.greenlight.com`
2. The creator sets up a **one-time Gmail auto-forwarding rule** from their
   real, unchanged public email to that alias (a manual, one-time Gmail
   setting — not something the app configures for them).
3. **Resend** receives the inbound email at that alias and fires a webhook
   to our backend.
4. Backend identifies the creator by the alias, then sends the offer text +
   the creator's full evaluation profile (see §7) to the **Gemini API** for
   evaluation (price recommendation + risk rating).
5. The email is auto-converted into a new **Deal Chat Room** inside the
   creator's in-app inbox.

### 5.1 Manual Analyzer (fallback / quick path)
A lightweight alternate entry point with these fields:
`sender_email`, `message_text`, `sponsorship_type` (see §7.4),
`target_countries` (optional, company's intended audience — see §7.4)
→ instant AI price + risk recommendation. No email connection required.
Build this as a standalone form/modal, reusing the same AI evaluation
function as step 4 above.

---

## 6. Masked in-app chat

- A creator's real email/phone must **never** be rendered anywhere in a
  company's view of the product.
- Every outgoing chat message is passed through a regex filter that strips
  phone numbers, external links, and social handles (WhatsApp, Telegram,
  Discord) before it's stored/displayed.
- When a creator replies in-app, the reply is relayed to the company as an
  **official email sent from the platform's own server** — the company
  never sees the creator's real address, only the platform's sending
  address.
- **Violation policy**: any detected attempt to exchange direct contact
  info or move a deal off-platform → **permanent ban**. This should be
  logged (which regex matched, redacted) for admin review, in addition to
  being blocked in real time.

### 6.1 Masking utility (reference implementation — port faithfully)
```typescript
// mask.ts
export function maskSensitiveData(text: string): { maskedText: string; isMasked: boolean } {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b01[0125]\d{8}\b/g;
  const socialHandlesRegex = /(telegram|wa\.me|whatsapp|discord\.gg|t\.me)\/[a-zA-Z0-9_]+/gi;

  let isMasked = false;
  let maskedText = text;

  if (emailRegex.test(text) || phoneRegex.test(text) || socialHandlesRegex.test(text)) {
    isMasked = true;
    maskedText = text
      .replace(emailRegex, '[locked: email hidden by platform policy]')
      .replace(phoneRegex, '[locked: phone hidden by platform policy]')
      .replace(socialHandlesRegex, '[locked: external link hidden]');
  }

  return { maskedText, isMasked };
}
```
Notes for implementation:
- `phoneRegex` includes an Egyptian mobile pattern (`01[0125]XXXXXXXX`) —
  keep this even when generalizing, since MENA is a primary market.
- Run this **server-side** before persisting the message (not just
  client-side), so the raw contact info never touches the database or the
  company's client.

### 6.2 Deal Chat Room fields
```
deal_status:      'new' | 'negotiating' | 'agreed' | 'paid' | 'disputed'
ai_evaluation:     'green' | 'yellow' | 'red'
offered_amount:    numeric
sponsorship_type:  'video_dedicated' | 'integration' | 'story_share' | 'live_mention' | 'post' | 'other'
target_countries:  text[]   -- countries the company wants to reach with this deal
```

---

## 7. Audience & targeting data (drives the AI evaluation — not just avg_views)

`avg_views` alone is not enough to price a deal correctly. Two channels with
identical view counts can be worth very different amounts depending on
**where their audience actually is**, how engaged that audience is, and what
kind of sponsorship is being requested. The evaluation model must take all
of the following into account, and the schema/UI must clearly distinguish
**verified** data from **self-reported** data at all times — this is a direct
extension of the "no screenshots, no blind self-reporting" principle, not an
exception to it.

### 7.1 Fields to collect per creator/platform connection
- `avg_views`, `avg_ccv` (already in schema)
- `engagement_rate` — likes+comments ÷ views; flags "inflated" follower counts
- `content_category` — e.g. tech, gaming, beauty, finance (drives benchmark pricing)
- `content_language`
- **Audience geography** — see §7.2, this is the important addition
- `sponsorship_type` and the company's `target_countries` are captured on
  the **deal** itself (§6.2), not the creator profile, since they vary per
  offer.

### 7.2 Why "audience country" can't just be another self-reported field
Real per-viewer geographic breakdown is only available from a platform's
**Analytics/Insights API**, not its general public Data API — and most of
these Analytics APIs require the creator to grant OAuth consent. So instead
of pretending this data is free everywhere, the schema tracks two parallel
fields and the UI always labels which one it's showing:

- `declared_top_countries` — entered by the creator themselves. Always
  rendered in the UI with a visible "self-reported" tag.
- `verified_top_countries` — pulled from an official Analytics/Insights API
  the creator has explicitly connected via OAuth. Rendered with a "verified"
  badge and given full weight in the AI evaluation.

This keeps the platform's anti-fraud promise intact: nothing is presented
*as verified* unless it actually came from an API.

### 7.3 Per-platform verification matrix

| Platform | Audience-geo data source | OAuth scope sensitivity | Verified in MVP? |
|---|---|---|---|
| **YouTube** | YouTube **Analytics** API (`yt-analytics.readonly`) — viewer % by country | *Sensitive* scope — needs Google OAuth verification (review + demo video), but **not** a full CASA audit | Yes — opt-in, recommended for Pro/Elite |
| **Instagram** | Instagram **Graph API** insights (audience country breakdown) — requires a Business/Creator account linked to a Facebook Page | *Sensitive/Business* scope — needs Meta App Review | Yes — opt-in, same tier gating as YouTube |
| **Twitch** | No public endpoint exposes per-viewer country demographics to third-party apps | N/A | **No** — `declared_top_countries` only, clearly marked self-reported |
| **Kick** | No official public API for audience demographics | N/A | **No** — declared only |
| **TikTok** | Public Display API does not expose demographics for arbitrary accounts (Research API is restricted/academic access) | N/A | **No** — declared only (revisit if TikTok grants deeper access later) |

Key point on cost, carried over from the earlier discussion: adding
YouTube/Instagram Analytics OAuth does **not** trigger Google's CASA
security assessment (that only applies to *Restricted* scopes like Gmail).
It does require a lighter OAuth verification review (roughly days–weeks,
not months) and real engineering time for the OAuth flow, token storage,
and refresh handling. There is no direct platform fee for the API calls
themselves. Keep these connections **optional** and gated to paid tiers so
an MVP launch never blocks on Google/Meta review turnaround.

### 7.4 What the AI evaluation function should now receive
```
{
  avg_views, avg_ccv, engagement_rate,
  content_category, content_language,
  declared_top_countries,   // always present, always labeled self-reported
  verified_top_countries,   // present only if OAuth-connected; null otherwise
  audience_verified: boolean,
  sponsorship_type,         // from the deal
  target_countries,         // from the deal (what the company wants)
  offer_text
}
```
Weighting rule: if `audience_verified` is true, price using
`verified_top_countries` against `target_countries` with full confidence.
If false, still compute a recommendation from `declared_top_countries`, but
the risk rating (`green|yellow|red`) should be capped at `yellow` at best
when the deal's value is high and the only geo data is self-reported —
i.e., unverified audience data should never by itself produce a `green`
rating on a high-value deal.

---

## 8. Pricing tiers

| Tier | MENA Price | Intl Price | Commission | Features |
|---|---|---|---|---|
| **Starter** (Free) | $0 | $0 | 15% | 5 email analyses/mo, 2 platform connections, basic chat |
| **Pro Creator** | $12–15 | $29 | 8–10% | Unlimited analysis, all platforms + Twitch/Kick live, fraud detector, verified audience geo (YouTube/Instagram OAuth) |
| **Elite / Agency** | $49 | $99 | 5% | Manage up to 5 accounts, Media Kit PDF export, VIP support, verified audience geo included |

Companies browse/access creators for free — commission is charged on the
deal, not on company seats.

---

## 9. Tech stack (zero-cost MVP — build against these, don't substitute)

| Layer | Choice |
|---|---|
| Frontend / Hosting | Next.js + Vercel (Hobby free tier) |
| Backend / DB | Supabase free tier (Postgres + Realtime websockets + RLS) |
| AI engine | **NVIDIA NIM API** running Kimi K3 (`moonshotai/kimi-k3`) — see amendment below |
| Email | Resend free tier (3,000 emails/mo + inbound webhooks) |
| Platform stats (basic) | YouTube Data API v3, Twitch Helix API |
| Platform stats (verified audience geo, opt-in) | YouTube Analytics API (OAuth), Instagram Graph API insights (OAuth) |

> Note: this spec originally named **Google Gemini API** here, intentionally
> not Claude, for cost reasons on the high-volume analysis path. The client
> explicitly instructed a switch to **NVIDIA-hosted Kimi K3** instead — an
> NVIDIA-provided key was supplied directly for this purpose. Reasoning behind
> the swap, and the §12 data-handling implications, are documented in
> `src/lib/ai/nvidia.ts` and the README's Engine section. Build against Kimi
> K3 going forward; do not reintroduce Gemini without asking first, per this
> file's own rule at the top.

---

## 10. Database schema (Supabase / Postgres)

Apply as-is; extend with migrations rather than editing in place once
deployed.

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('creator', 'company', 'admin')) NOT NULL,
  region TEXT CHECK (region IN ('MENA', 'International')) DEFAULT 'MENA',
  subscription_plan TEXT CHECK (subscription_plan IN ('Starter', 'Pro', 'Elite')) DEFAULT 'Starter',
  inbound_alias TEXT UNIQUE,
  primary_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.media_kits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT CHECK (platform IN ('youtube', 'twitch', 'kick', 'instagram')) NOT NULL,
  avg_views INT DEFAULT 0,
  avg_ccv INT DEFAULT 0,
  engagement_rate NUMERIC(5,2),
  content_category TEXT,
  content_language TEXT,
  declared_top_countries JSONB,   -- e.g. [{"country":"EG","pct":40}, {"country":"SA","pct":25}]
  verified_top_countries JSONB,   -- same shape, only populated via OAuth sync
  audience_verified BOOLEAN DEFAULT FALSE,
  analytics_oauth_connected BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.deal_chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  deal_status TEXT CHECK (deal_status IN ('new', 'negotiating', 'agreed', 'paid', 'disputed')) DEFAULT 'new',
  offered_amount NUMERIC(10, 2),
  ai_evaluation TEXT CHECK (ai_evaluation IN ('green', 'yellow', 'red')),
  sponsorship_type TEXT CHECK (sponsorship_type IN
    ('video_dedicated', 'integration', 'story_share', 'live_mention', 'post', 'other')),
  target_countries TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID REFERENCES public.deal_chats(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  is_masked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_chats ENABLE ROW LEVEL SECURITY;
-- TODO before launch: also enable + write RLS policies for media_kits and
-- messages (a creator/company should only read chats/messages they're a
-- party to; admin bypasses via a service role).
```

---

## 11. Roadmap (post-MVP — build as a locked/disabled UI element now)

Show an **"AI Assistant" card on the dashboard in a "Coming Soon" locked
state** (visible but not clickable) to tease upcoming features:
- Video/script idea generation
- Copyright check
- Thumbnail idea generation
- Best posting time recommendations
- Expanding verified audience-geo coverage to TikTok/Twitch if/when those
  platforms open up suitable API access

---

## 12. Terms & privacy constraints (design/implementation implications)

- Manual account activation only; forced password change on first login
  (see §4) — enforce server-side, not just a UI nudge.
- Off-platform contact exchange = permanent ban (see §6) — this is a hard
  business rule, not a soft warning after the first offense.
- Commission + payment confirmation flow through **internal escrow** — do
  not wire up a live payment processor for the MVP; model the escrow state
  in `deal_status` (`agreed → paid`) and reconcile manually via admin/Discord
  for now.
- A creator's email/phone must never be exposed to companies, full stop —
  treat this as a security requirement to test for, not just a UI
  convention.
- Chat must be encrypted at rest / in transit as applicable, with Supabase
  RLS enforced on every table that holds user or deal data.
- AI text processing is evaluation-only — do not log/forward offer text or
  chat content anywhere it could be used to train general-purpose models.
- Any OAuth-connected analytics data (§7) is used only to compute pricing/
  risk recommendations — never resold, never used to train general models,
  and revocable by the creator at any time (disconnecting must immediately
  set `audience_verified = false` and clear `verified_top_countries`).

---

## 13. Open questions to confirm before building further
- Exact escrow/payout mechanics once a deal reaches `paid` (currently
  manual via Discord — confirm if/when this should become automated).
- Whether `region` (`MENA` / `International`) is user-selected at admin
  creation time or auto-detected, since it drives pricing display.
- Final typography choice (Inter vs. Manrope vs. other) — no brand font was
  supplied, so this is a free choice unless the client specifies one.
- Whether verified audience-geo (YouTube/Instagram OAuth, §7) ships in v1
  or is fast-followed shortly after MVP launch, given the extra OAuth
  review lead time.
