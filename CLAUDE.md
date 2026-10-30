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

> **Update — icon-only, real transparency.** The client later supplied two
> genuinely transparent icon files (confirmed via each WebP's VP8X alpha
> flag, not just visual inspection) and asked that the wordmark be dropped
> everywhere in favor of the icon alone, switching with the active theme:
> `public/branding/icon_dark.webp` (white mark, for dark surfaces) and
> `icon_light.webp` (navy mark, for light surfaces) — same "suffix names the
> surface, not the mark's own color" convention as the two `_full.png`
> files above. `src/components/brand/Logo.tsx` and `ThemedLogo.tsx` render
> these directly with no plate wrapper, since — unlike the three files
> above, which are still baked-opaque — these two actually have alpha. The
> `_full.png` lockups and `icon_color.png` are unused in the app now but
> left on disk; the favicon (`app/layout.tsx` metadata) still points at
> `icon_color.png`, not touched by this change.

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

> **Update — Plan & billing moved out of Settings, onto its own Pricing
> page.** `/pricing` (`src/app/(app)/pricing/`, sidebar-linked for every
> role) now owns everything this section describes: the §8 plan cards
> (MENA/Intl price, commission, features) each with a "manage via Discord"
> CTA, plus the promo/discount code redemption form (`redeemCode`,
> relocated from `settings/actions.ts` to `pricing/actions.ts`). `/settings`
> no longer carries any plan/billing UI at all — it's Account (display name,
> password — see below), the §5 email-forwarding alias, and WhatsApp
> notification settings. This is the same "manage via Discord, no in-app
> billing" policy from point 3 above, just surfaced where a creator or
> company would actually go looking for plans rather than folded into
> Settings.
>
> Settings' Account section also grew two capabilities this file didn't
> previously describe: a creator/company can change their own **display
> name** (`profiles.full_name`, already grantable to `authenticated` since
> migration 0003) and their **password** (`supabase.auth.updateUser`,
> the same call the forced first-login reset in `(auth)/set-password/`
> uses, just without that flow's `must_change_password` gate). The primary
> email stays plain read-only text — never an input, not even a disabled
> one — since it's the identity Supabase Auth and every RLS policy key off.

---

## 5. Email intake pipeline (sponsorship detection)

This is the core automation loop. Build it exactly as follows — do not
introduce Google OAuth, the Gmail API, or a CASA security review anywhere in
this flow; it's intentionally OAuth-free.

1. On signup, each creator is issued a unique inbound alias:
   `{handle}.{random}@analyze.greenlightadvs.com`
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

> **Update — alias domain, suffix length, and rotation.** The inbound domain
> is `analyze.greenlightadvs.com`, matching the Resend receiving configuration;
> `NEXT_PUBLIC_INBOUND_DOMAIN` overrides it. `{random}` is four characters from
> a 32-glyph alphabet with no look-alikes (~1.05M per handle) — short enough to
> read aloud, and still unguessable, which matters because every delivery to an
> alias opens a deal room and spends a paid evaluation.
>
> Because an alias also lives in the creator's Gmail forwarding rule, changing
> one cannot be a single-column update. Migration 0020 adds
> `profiles.previous_inbound_alias`, and the §5.3 intake accepts either column,
> so a rule pointing at a retired alias keeps delivering until the creator
> re-points it. `scripts/rotate-inbound-aliases.mjs` performs the move and is
> idempotent.

> **Update — the inbound screener can now refuse a delivery (migration 0021).**
> Step 3 above gained a gate. `src/lib/ai/spam-filter.ts` no longer returns a
> boolean; it returns `accept | flag | reject` with a 0–100 score and the rules
> that fired, and the intake runs it *before* the evaluation, the WHOIS/Safe
> Browsing check and the WhatsApp alert — so a newsletter reaching a creator's
> alias now costs nothing instead of a paid evaluation each.
>
> `reject` is narrow on purpose, because the failure it can cause (a real offer
> that vanishes with nothing on the creator's screen) is far worse than the one
> it prevents. It needs all three of: a *machine-declared* bulk signal
> (`List-Unsubscribe`/`List-ID`, `Precedence: bulk`, `Auto-Submitted`, or a
> no-reply sender), no sponsorship wording anywhere in the message, and a score
> under the floor. Prose alone never rejects, and SPF/DKIM/DMARC failure never
> rejects either — plain forwarding breaks SPF by design and *every* delivery
> here arrives via a Gmail forwarding rule, so an auth failure describes the
> forwarding path rather than the sender. Scam-shaped offers are deliberately
> let through to be rated red rather than silently dropped.
>
> A refusal writes no deal room and no message. What it does write is the
> `inbound_emails` audit row, which 0021 extended with `subject`, `spam_score`
> and `spam_reasons` so a false positive is reviewable — the offer body is
> still never stored there, per 0008's own rule. `parse.ts` now also normalizes
> `headers` (object *or* array-of-pairs shapes) into a lowercased bag, which is
> what the machine-declared signals are read from.
>
> **Closed since — creators now see what was held.** The Deal Inbox opens with
> a collapsed one-line panel ("Emails held back by the filter in the last 30
> days: N") that expands to each held delivery's date, sender, masked subject
> and a plain-language reason (newsletter/bulk, no-reply sender, no readable
> content, not a sponsorship offer), plus a link to the Manual Analyzer —
> the on-platform way to turn a held offer into a room, since a held delivery
> has no stored body to restore. It renders nothing when nothing is held, and
> appears above the empty state too, because a creator with no rooms but held
> mail is exactly the one wondering where their offer went.
>
> This was deliberately **not** done with a creator RLS policy, and the reason
> is load-bearing: RLS gates rows, not columns, so a `creator_id = auth.uid()`
> policy would let any creator `select *` from the browser and read the raw,
> unmasked subject plus `detail`, `spam_score`, `spam_reasons` and the
> provider's message id. `inbound_emails` stays admin-only. The page reads it
> with the service role — scoped by the session's own profile id, which is
> therefore the entire access boundary and is never taken from input — and
> `src/lib/email/held.ts` projects a fixed set of fields, masks the subject
> with the §6.1 utility, and allowlists which rejections a creator sees at
> all (screener refusals, identified by their score rather than by prose, and
> empty deliveries; a suspended account's rejection, and any reason added
> later, stay admin-only by default). Bounded to 30 days and 20 rows.

> **Update — the body is fetched, not assumed (F1).** Resend's
> `email.received` webhook carries metadata only (no body, no headers), and
> the intake used to read `text`/`html` off it, so every inbound offer was
> evaluated on its subject alone. `src/lib/email/received.ts` now fetches the
> content from `GET /emails/receiving/:email_id` (two attempts, 4s each) once
> the alias resolves to an active creator, and `mergeReceivedEmail` folds it in
> before the screener and the evaluation. Idempotency is keyed on Resend's
> `email_id`, not the RFC `Message-ID` that every copy of an email shares — the
> same `provider_message_id` column, so no migration. A retryable fetch failure
> answers 5xx and the provider's redelivery reclaims the row (`claim.ts`); a
> permanent one is a 200 rejection. Text attachments are listed, not read: the
> API returns attachment metadata only.
>
> **Pre-merge review fixes.** *Parsing:* the body is capped before any regex
> runs (100k chars of text, 300k of HTML, `parse.ts`), a cut message carries a
> visible `TRUNCATION_NOTICE`, and `htmlToText` / `stripQuotedReply` are
> linear — they were quadratic on sender-controlled input (80k newlines took
> ~16s). *Stale claims:* a claim is `status='failed'` with `detail='processing
> since <ISO time>'`; a redelivery reclaims it by compare-and-swap on that exact
> string once it is older than `STALE_CLAIM_MS` (120s, twice `maxDuration`),
> and a live claim answers 503 instead of a 200 that ended Resend's retries.
> The room id is checkpointed onto the claim row before any message is
> written, so recovery appends to that room and skips a message it already
> stored. Residual: a kill between creating the room and checkpointing it
> falls back to the open-thread lookup, which misses a room already marked
> paid; closing that needs a transaction or a link column (a schema change).
> *Budget:* `lib/email/budget.ts` measures from the request's arrival — fetch
> ≤ 6s, model stops at 52s, 8s reserved for writes — and the model's 50s
> deadline can only be shortened by it. Database calls still have no
> client-side timeout. `scripts/claim-concurrency-pg.sh` checks the claim's
> SQL against a real local Postgres; the intake tests in
> `src/lib/email/intake-tests/` run the real `intake.ts` against in-memory fakes.

### 5.1 Manual Analyzer (fallback / quick path)
A lightweight alternate entry point with these fields:
`sender_email`, `message_text`, `sponsorship_type` (see §7.4),
`target_countries` (optional, company's intended audience — see §7.4)
→ instant AI price + risk recommendation. No email connection required.
Build this as a standalone form/modal, reusing the same AI evaluation
function as step 4 above.

> **Update — opening a room from the Analyzer is signed (D3), and Gmail's
> forwarding confirmation is not a deal (D4).** `analyzeOffer` signs its
> result (`src/lib/deals/analysis-quote.ts`: creator, sender, offer text, type,
> countries, risk, price; 30-minute expiry, its own key label so a Discover
> token never verifies here). `createDealFromAnalysis` is creator-only, stores
> the risk and recommended price only under a valid signature, validates the
> form server-side, and has its own `analyzer_create_deal` rate limit, the same
> fix Discover received.
>
> Step 2 of §5 produces one email the intake used to mishandle: Gmail's
> forwarding confirmation (`forwarding-noreply@google.com`, subject
> `(#code) …`) was accepted by the screener and opened a "sponsorship" room.
> `src/lib/email/gmail-confirmation.ts` now recognises it, and refuses it on a
> DKIM/DMARC failure, since it comes straight from Google, not via forwarding.
> The intake then creates no room, runs no evaluation, sends no WhatsApp
> alert, and **never visits the link**. The Deal Inbox's held panel shows the
> code (digits only) for the creator to type into Gmail. The setup guide no
> longer claims Green Light accepts it automatically.

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

> **Update — the rules are ported faithfully; the `.replace()` chain is not.**
> On the client's instruction, links now win over phone numbers:
> `wa.me/201012345678` masks to `[locked: external link hidden]`, not to
> `wa.me/[locked: phone hidden by platform policy]`. That leftover `wa.me/`
> was the visible symptom, but simply moving the social rule to the front
> would have caused a regression. In `whatsapp/0101 234 5678` the link rule
> takes `whatsapp/0101`, and the `234 5678` left behind is too short to read
> as a phone number, so it would stay in clear. The underlying problem is
> the chain itself. Whichever rule runs first can cut a later rule's match
> short, so every order leaks something (the reference order already left
> the `/abc123` of `info@discord.gg/abc123` in clear).
>
> `src/lib/mask.ts` now runs all three regexes against the original text and
> tries each rule at every start position, not just leftmost, because a link
> can hide a second link (`t.me/discord.gg/abc123`). It then merges the
> overlapping matches and replaces each merged span once. When a span mixes
> rules, the label precedence is link, then email, then phone. The regexes,
> the labels, the Egyptian mobile pattern and `matched` (every rule that
> fired, for the violation log) are unchanged. `mask.test.ts` keeps the old
> chain, in all six orders, as a test oracle. A seeded property test asserts
> that the new version masks at least as much as every order and is
> idempotent. Half a million generated cases found no counterexample.
>
> The email regex has also gained one thing: a leading lookbehind,
> `(?<![a-zA-Z0-9._%+-])`, so a match can only start where a run of address
> characters starts. This changes performance, not what gets masked. A match
> that starts inside a run ends at the same `@` and the same domain as the
> match starting at the run's head, so it was always contained in that
> match. On a million generated inputs, the output, `isMasked` and `matched`
> were all identical to the version without it. Without the lookbehind, the
> engine retried a long run from every position: 20k address characters
> took about 0.5s (inputs are capped at 20k), and with it they take under a
> millisecond. `mask.test.ts` guards this with a deliberately loose timing
> bound.

### 6.2 Deal Chat Room fields
```
deal_status:      'new' | 'negotiating' | 'agreed' | 'paid' | 'disputed'
ai_evaluation:     'green' | 'yellow' | 'red'
offered_amount:    numeric
sponsorship_type:  'video_dedicated' | 'integration' | 'story_share' | 'live_mention' | 'post' | 'other'
target_countries:  text[]   -- countries the company wants to reach with this deal
```

> **Update — Deal Inbox: dual sources, company intelligence, AI reply
> drafts, WhatsApp alerts.** Migration 0017 extended the negotiation
> workspace without a schema rework for "where did this deal come from":
> the existing `deal_chats.company_id` already distinguishes an in-app deal
> (non-null, created via Discover) from an inbound/manual one (null) — the
> Deal Inbox filters and badges (`SourceBadge`) on that column rather than
> adding a new one.
>
> For the null (email/manual) case, `CompanyIntelligencePanel` shows the
> sender domain's WHOIS/trust data (`deal_chats.security_check`, populated
> by `runSecurityCheck` at deal-creation time — the same check already used
> elsewhere, just persisted now), a free-email-provider warning, and the
> creator's **own** deal history with that domain (`getOwnHistoryWithDomain`
> — deliberately scoped to the caller's own RLS-readable deals, not a
> cross-creator aggregation, since that would leak one creator's negotiation
> history to another via a shared sponsor domain). A heuristic (non-LLM)
> classifier tags `deal_chats.is_likely_sponsorship` on intake for a
> "possible spam" filter in the inbox list — best-effort, and never used to
> silently drop a delivery.
>
> The negotiation workspace also gained an **AI copyable response
> generator** (`generateReplyDraft`, on the NVIDIA model per §9) that drafts a
> reply from the latest offer, price and risk rating — a starting point the
> creator edits and sends themselves, not an auto-send.
>
> **Migration 0018 — `deal_chats.recommended_price_usd`.** The Co-Pilot's
> price recommendation used to exist only as prose inside a room's opening
> system message, which nothing could read back. That caused two real bugs:
> the Manual Analyzer had nowhere to put it and wrote it into
> `offered_amount` (the column meaning *what the sponsor offered*, so every
> analyzer deal showed the platform's own suggestion as the sponsor's), and
> the reply generator could not tell the model the recommended price, so its
> central instruction could never fire. It is now stored at creation time by
> all three paths, server-authoritative like `ai_evaluation`/`offered_amount`
> (never granted to `authenticated`), and shown in the deal sidebar beside
> the offer. Null on pre-0018 rows, which render without the row rather than
> showing a fabricated number. The analyzer now derives `offered_amount` from
> the pasted text with the same `extractOfferedAmount` helper the email path
> uses, so "Offer" means one thing everywhere.
>
> Separately, `profiles.whatsapp_number` / `whatsapp_notifications_enabled`
> (opt-in, set in Settings) drive an instant WhatsApp alert
> (`notifyNewDeal`, Meta's WhatsApp Business Cloud API) fired from every
> deal-creation path — email intake, Manual Analyzer, and Discover offers —
> on top of the in-app inbox. Quiet-degradation like every other optional
> integration here: missing config or a failed send never blocks deal
> creation.

> **Update — company profile, template fallback, and the one-click reply
> (migration 0021).** Three additions to the workspace above:
>
> *AI company brief.* `deal_chats.company_profile` caches
> `src/lib/ai/company-intel.ts` — a written background and trading history for
> the sender's domain plus a trustworthiness score, generated on demand (a paid
> call per deal; most inbound offers are read once and dropped, so spending it
> at intake would multiply exactly the cost the screener exists to avoid) and
> cached so reopening the room is free. It sits **below a rule** in
> `CompanyIntelligencePanel`, under an "AI-generated" tag, separate from the
> "Verified lookup" half above it. That separation is the point: `security_check`
> is *measured* (WHOIS, Safe Browsing, fixed rubric) and this is *generated*,
> and the two scores are never averaged — same rule §7.2 applies to declared vs.
> verified audience geography. The model is also required to answer
> `is_known_to_model: false` for a domain it does not recognise, and the UI
> renders that as "no public information" rather than printing prose, because a
> fluent paragraph about a company that does not exist is the failure mode that
> actually costs a creator money.
>
> *Reply templates.* `src/lib/deals/reply-template.ts` is a deterministic
> counter/accept/ask-for-budget generator built from the deal's own columns. It
> backs "Generate AI reply" whenever the model call cannot run — no
> `NVIDIA_API_KEY`, rate limit spent, endpoint down — which on a zero-cost MVP
> is most of the time, so the button always returns something usable. The draft
> is labelled `ai` or `template` so the creator knows which they are reading.
> The existing `CopyButton` covers the 1-click copy.
>
> *Direct reply.* `DirectReplyPanel` shows a ready-to-send reply, pre-filled
> server-side with the deal's structured context (deliverable, their offer, and
> a rate only once the negotiation stage states one — see the negotiation
> update below), editable, one click to send. It is **not** a `mailto:`, and
> that was a deliberate deviation from the request: a `mailto:` sends from the
> creator's own mail client, putting their real address permanently in the
> sponsor's inbox — which §6 forbids in as many words, §1's second value
> proposition depends on, §12 calls a security requirement rather than a UI
> convention, and the published Privacy Policy promises. It submits through the
> same `sendMessage` action the composer uses, so it inherits the identical
> §6.1 server-side mask, violation log and platform relay; a second send path
> with its own rules is how a masking guarantee grows a hole.

> **Update — staged negotiation co-pilot (2026-10-30).** For the room's
> creator, "Generate AI reply" and the Direct Reply body now come from
> `src/lib/deals/negotiation.ts` (pure) and `negotiation-context.ts` (server).
> The rate is computed from the creator's own media kit, with every factor
> labelled verified / synced / self-reported / sponsor-stated / estimated /
> missing. Synced and verified inputs are used only when under 30 days old;
> CPM and scope uplifts are labelled Green Light defaults, not market data.
> The stage comes from the thread:
> - **discovery:** the first reply asks for scope, usage rights, exclusivity,
>   timeline and budget range, and names no price;
> - then proposal, counter, hold, accept_ready ("could work… before I
>   confirm"), and agreed.
>
> The creator's optional **private minimum** is validated, never stored,
> never logged, never sent to the model and never returned. Counters, quoted
> ranges and held rates never land at or below it. A model draft that states
> any figure outside the plan's allowed set, or the minimum, is replaced by the
> deterministic draft (`draftIsAcceptable`). Nothing is sent, accepted or
> agreed without the creator pressing Send. Company-side drafting is unchanged.

> **Update — Discover's rating is signed (company-flow audit).** A Discover
> offer is two steps, preview then send, and the send step used to store
> `ai_evaluation` and `recommended_price_usd` straight from hidden form
> fields. That let a company rate its own offer **green** at any "recommended"
> price, which is exactly what the column grant on those two fields exists to
> prevent. The preview now signs everything the rating depends on: company,
> creator, offer text, type, countries, risk, price and amount
> (`src/lib/deals/offer-quote.ts`). The signature is an HMAC keyed off the
> service-role key, so there is no new env var and no second AI call. The
> send step stores those values only under a valid signature less than 30
> minutes old. Sending also has its own rate limit (`offer_send`), because
> each send can ping a creator on WhatsApp, and every failure now shows an
> error instead of a silent no-op.

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

> **Update — which value is "the deal's value" (owner decision, 2026-10-30).**
> The cap compares `rules.highValueBasisUsd(recommended, offered)`, the larger
> of the engine's recommended price and the sponsor's stated offer, against
> `HIGH_VALUE_DEAL_USD`. A missing or invalid offer is ignored, so the cap can
> only get stricter. Both the model path (`evaluate.ts`) and the rule-based path
> (`heuristic.ts`) apply it, and `EvaluationInput.offered_amount_usd` carries
> the offer only for this test. Still open: `HIGH_VALUE_DEAL_USD = 1000` is a
> placeholder this section never defines, and a deal with no geography at all
> is capped like self-reported. Separately (D6), missing creator analytics
> never by itself makes an offer red; it holds the rating at yellow.

> **Update — a friendlier Creator Profile layer, on top of this section, not
> instead of it.** Migration 0017 added `profiles.bio` / `avatar_url` /
> `country` / `primary_language` / `base_rate_usd` / `social_links` /
> `shareable_slug`, and the Media Kit page now opens with a
> `CreatorProfileCard` (profile basics + social handles) and a
> `ShareableLinkCard` (`greenlight.com/p/<slug>`) above the existing
> per-platform panels. Nothing in this section changed: `avg_views`,
> `engagement_rate`, `declared_top_countries` / `verified_top_countries`,
> `audience_verified` and the whole OAuth verification flow still live on
> `media_kits` exactly as specified, still drive the AI evaluation exactly
> as specified, and are untouched by the new profile fields. The public
> `/p/[slug]` page (reachable signed-out — it's what a creator sends a
> sponsor) reads through a SECURITY DEFINER RPC,
> `creator_public_profile(slug)`, whose column list is hardcoded in its own
> migration SQL and explicitly excludes `primary_email` / `inbound_alias` /
> everything in this section — it shows the profile basics and connected
> platforms, never audience geography or verification status, self-reported
> or otherwise.

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
| AI engine | **NVIDIA NIM API** running `meta/llama-3.3-70b-instruct` (default; `NVIDIA_MODEL` overrides) — the only AI provider; see amendments below |
| Email | Resend free tier (3,000 emails/mo + inbound webhooks) |
| Platform stats (basic) | YouTube Data API v3, Twitch Helix API |
| Platform stats (verified audience geo, opt-in) | YouTube Analytics API (OAuth), Instagram Graph API insights (OAuth) |

> Note: this spec originally named **Google Gemini API** here, intentionally
> not Claude, for cost reasons on the high-volume analysis path. The client
> explicitly instructed a switch to **NVIDIA NIM** instead — an NVIDIA-provided
> key was supplied directly for this purpose. Reasoning behind the swap, and
> the §12 data-handling implications, are documented in
> `src/lib/ai/price-model.ts` and the README's Engine section. Build against
> NVIDIA going forward; do not reintroduce Gemini without asking first, per
> this file's own rule at the top.

> **Update — NVIDIA is the only provider (model: see *Model* below).**
> Two changes, both on the client's explicit instruction.
>
> *One provider.* A brief earlier revision ran every model call down a chain
> with a second vendor behind NVIDIA, so a rate limit on the primary failed
> over instead of dropping to arithmetic. That was removed in full — the
> vendor's endpoint, key, model, config, tests and documentation are all gone,
> and nothing in the codebase now reaches any AI host but NVIDIA. The path is
> exactly **NVIDIA → static fallback**: `src/lib/ai/chat.ts` makes the one
> call, `nvidia-config.ts` configures the one endpoint, and when it fails the
> callers fall to what they can compute themselves — `evaluate.ts`'s rule-based
> pricing and `lib/deals/reply-template.ts`'s written templates — or report the
> engine unavailable. **Do not reintroduce a second provider without asking**,
> per this file's own rule at the top.
>
> The consequence is worth stating plainly rather than discovering later: an
> NVIDIA 429, outage or wrong `NVIDIA_MODEL` now prices a real sponsorship deal
> with the rule-based engine, on a path the inbound webhook waits on
> synchronously. That is disclosed in the UI (`engine: "heuristic"` renders a
> "the AI engine could not be reached" line) and logged with the HTTP status,
> so it is visible rather than silent — but it is the accepted trade for a
> single-vendor setup.
>
> *Model.* The code default is `meta/llama-3.3-70b-instruct`
> (`NVIDIA_DEFAULT_MODEL` in `nvidia-config.ts`), picked on the client's
> instruction to use the fastest reliable text-only model. It replaced
> `z-ai/glm-5.3`, which had itself replaced `moonshotai/kimi-k3`. It is still
> overridable per deployment via `NVIDIA_MODEL` with no code change, and a
> value set there wins over the default. A wrong id
> is not an error: the call 404s and the product quietly serves rule-based
> output, so `/admin/system` and the server logs are where to check when AI
> output stops appearing. The key itself is only ever read from
> `NVIDIA_API_KEY` — it is never hardcoded, and rotating it is an environment
> change plus a redeploy, not a code change.

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

## 11. Roadmap (post-MVP)

- Video/script idea generation
- Copyright check
- Thumbnail idea generation
- Best posting time recommendations
- Expanding verified audience-geo coverage to TikTok/Twitch if/when those
  platforms open up suitable API access

> **Update — the dashboard teaser card is gone.** This section originally
> called for an "AI Assistant" card on the dashboard in a locked "Coming
> Soon" state (`ComingSoonCard.tsx`). A later dashboard redesign removed it
> outright, on the client's explicit instruction, to make room for the
> profile-completeness banner and a more prominent inbound-alias card (§14
> carries the rest of that round's changes). The roadmap items above are
> unchanged and still real future work — there is simply no in-app teaser for
> them anymore.

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

> **Update — server logs go through one logger.** `src/lib/log.ts` is now
> the only way server code writes logs. There are no bare `console.*`
> calls left in `src/` apart from the client error boundary
> (`app/error.tsx`), which writes to the visitor's own browser console. Each
> event is one JSON line, `{"level","event",…fields}`, so Vercel's log
> search can filter on `event` (`nvidia.unavailable`, `relay.failed`,
> `resend_webhook.signature_rejected`, …). The logger also enforces the "do
> not log" rules above, rather than leaving them to each call site:
>
> - Every string runs through the §6.1 masker, except UUIDs, so they stay
>   traceable.
> - Error objects are reduced to name/message/code/status. Supabase's
>   `details` (which quotes row values) and fetch's `cause` never appear.
> - Strings are capped.
>
> Levels mean something:
> - **`error`**: an operation failed and someone should look.
> - **`warn`**: degraded but handled.
> - **`info`**: e.g. NVIDIA recovering on its second attempt.
>
> "Optional integration not configured" (NVIDIA, WhatsApp, Discord) is a
> `warnOnce` per server instance. Before this change it repeated on every
> deal. A failed NVIDIA call now produces exactly one `nvidia.unavailable`
> error naming why it stopped (`terminal_status`, `deadline`,
> `retry_after_exceeds_deadline`, `attempts_exhausted`), plus one
> `nvidia.attempt_failed` warning per attempt. There is still no error
> service such as Sentry. The JSON shape is what one would ingest from a
> Vercel log drain.

> **Update — the escrow state machine, and server-only deal writes
> (migration 0022).** `updateDealStatus` is now the only place a deal's status
> changes, and it enforces this bullet's `agreed → paid` rule. Parties
> (creator or company) move between `new`/`negotiating`/`agreed`/`disputed`.
> Only an admin marks a deal `paid`; admins see every deal in `/inbox`, and
> the status control offers them the extra option. A paid deal is the
> settlement record, so no party can move it again. Before this change, no
> one could set `paid` in the app, and either party could undo it.
>
> Migration 0022 revokes the `INSERT`/`UPDATE` grants (and their policies)
> that `authenticated` held on `deal_chats` and `messages`. The app never used
> them, because every write goes through the service role after the §6.1
> mask. But they let any signed-in user call PostgREST directly. Both of these
> were reproduced on the live schema in a rolled-back transaction:
> - a company stored `wa.me/2010… or call 0101…` unmasked, with no violation
>   logged;
> - a company opened a room in another creator's inbox as
>   `security@greenlightadvs.com`.
>
> **Status: applied to the live database on 2026-10-29** (migration history
> version `20261029204942`), after the owner confirmed it. Verified there: no
> INSERT/UPDATE grant left for `authenticated` on either table, only the two
> SELECT policies, realtime unchanged, row counts and checksums unchanged.

> **Update — YouTube API data retention (G1, migration 0023).** Per the
> YouTube API Services Developer Policies:
> - A token refresh Google answers with `invalid_grant` deletes that creator's
>   YouTube token and clears only the verified-geography columns on their
>   YouTube kit. A 5xx, timeout or `invalid_client` deletes nothing.
> - Verified geography counts as verified only while `verified_geo_synced_at`
>   is under 30 days old. That covers pricing, the Media Kit, the Dashboard and
>   the Analyzer. Discover's RPC has no timestamp and relies on the cleanup.
> - The daily `/api/cron/youtube-data-freshness` job clears verified geography
>   and the three sync-only public stats (`subscriber_count`,
>   `channel_view_count`, `media_count`, clocked by `youtube_stats_synced_at`)
>   at 29 days, and re-checks every stored token.
> - `engagement_rate` and everything a creator typed are never cleared.
>   `engagement_rate` has mixed provenance (form or sync) and no record of
>   which.
>
> The job only runs with `CRON_SECRET` set, which it is not in production yet
> (§16). Sensitive actions are rate-limited, and `rate-limit-coverage.test.ts`
> fails if one loses its limit: analyse, create deal, preview, send offer,
> send message, reply draft, company intel, promo redemption, niche
> detection, platform syncs.

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

---

## 14. Public landing page & theming

`/` is now a real public marketing page (`src/components/landing/`), reachable
without a session — previously the root just redirected straight to
`/dashboard` or `/login`. This does **not** add self-signup: the "Request
access" CTA and every other contact point route to Discord/WhatsApp, per §4's
admin-gated model, which is unchanged.

- **Contact channels** — `src/lib/constants/contact.ts` is the one place
  Discord/WhatsApp URLs are defined. Reused by the landing page, `/settings`'
  Plan & billing card, and `/suspended`.
- **Palette** — still exactly §2.1's hexes (`#293E61` / `#1F2E47` / `#62E823`).
  A later design pass proposed a different navy/green pair; it was rejected in
  favor of the confirmed brand colors already implemented everywhere else.
- **Light/dark mode is app-wide.** `ThemeProvider`
  (`src/components/ThemeProvider.tsx`, wrapping `next-themes`) is mounted at
  the root, defaults to system preference, and is switchable via `ThemeMenu`
  (`src/components/ui/ThemeMenu.tsx` — Light/Dark/System, in the dashboard
  `TopBar` and the landing nav). This reverses this section's original
  "landing-page-only" scoping decision, made before the client asked for a
  fully themeable dashboard.
  - Almost every `text-white`/`border-white`/`bg-white`/`divide-white`
    utility across the app (Sidebar, TopBar, every dashboard/admin view) was
    a foreground tint, not literal brand white, so those were converted to
    the theme-reactive `--color-fg` token (§2.1's `@theme` block) rather
    than adding a `dark:` pair to every one — flip that one CSS variable
    under `:root.dark` and the whole app re-themes. `glass-panel` /
    `glass-panel-solid` and the body mesh gradient (§2.2) each carry their
    own light/dark recipe the same way.
  - The exception: a few surfaces are deliberately a fixed dark "code
    block" regardless of theme (§2.1's navy-dark usage) — generated
    codes/passwords, the violation log excerpt, and the deal room's
    "via Green Light" system bubble. Those keep literal `text-white`, since
    ink-on-navy in light mode would be close to unreadable.
  - Literal, always-white surfaces (the Logo's own asset, landing's white
    cards) still use the real `white` token and are untouched by this.
- **Desktop layout** — the authenticated app shell's outer container
  (`(app)/layout.tsx`, mirrored in `preview/layout.tsx`) is `max-w-[1680px]`
  with responsive gap/padding (`lg:`/`2xl:` steps), not the earlier
  `max-w-7xl` (1280px) — that read as a narrow centered column on large
  desktop monitors.
- **Logo** (`src/components/brand/Logo.tsx`) — superseded by the icon-only,
  genuinely-transparent asset switch documented in §2.3's own update note;
  see there rather than here.

---

## 15. Internationalization (i18n) & RTL

A Language switcher (`src/components/ui/LanguageMenu.tsx`, Globe icon,
same glassmorphism dropdown as `ThemeMenu`) sits next to the theme toggle in
`TopBar` and the landing nav. Five languages: English, Arabic (`ar`),
French, Spanish, German — `src/lib/i18n/locales.ts` is the list, each with
its own native-script name and `dir`.

- **Mechanism, deliberately not next-intl.** `src/components/LocaleProvider.tsx`
  is a custom, non-routing i18n provider — no `/ar/dashboard`-style locale
  prefixes. `proxy.ts`/`session.ts` already carry a fair amount of custom
  auth-guard routing logic; layering a routing-based i18n library's own
  middleware on top risked real conflicts there for a feature that doesn't
  need locale-specific URLs. The provider mirrors `ThemeProvider`'s shape
  instead: a module-level external store (via `useSyncExternalStore`, not
  `useState`+`useEffect` — reading `localStorage` inside an effect and
  pushing it into state is exactly the "sync with an external system" case
  that hook exists for, and the lint rule that later caught this same
  pattern in `ThemeToggle` flagged it here too) persisted to `localStorage`,
  with the same inline no-flash `<script>` technique next-themes uses for
  its own class script — it sets `dir`/`lang` on `<html>` before the tree
  paints, so a returning Arabic visitor doesn't see the page flash
  LTR-then-flip-RTL.
- **`t("nav.dashboard")`-style dictionaries** — `src/lib/i18n/dictionaries/
  {en,ar,fr,es,de}.ts`. English is the structural source of truth; the other
  four are typed against it (`Dictionary`), so a missing/extra key across
  any of them is a type error, not a silent runtime fallback.
- **Translation scope, deliberately partial.** The shared chrome (Sidebar
  nav labels, TopBar, the theme/language menus' own labels), the public
  landing page, and — as of a later pass — the inner content of Dashboard,
  Manual Analyzer, Deal Inbox, Media Kit and Settings (form fields, card
  titles, table headings, badges, empty/error states) all run through the
  `t()` dictionaries via seven namespaces (`common`, `badges`, `dashboard`,
  `analyzer`, `inbox`, `mediaKit`, `settings`) on top of the original
  `nav`/`topbar`/`theme`/`language`/`landing`. Still English, disclosed
  rather than silently missed:
  - **Admin pages** (`/admin/*`) — not part of this pass.
  - **Data-driven strings that live in `lib/` files, not JSX** — the
    per-platform verification notes in `lib/media-kit/platforms.ts`
    (`VERIFICATION_SUPPORT[...].note`, e.g. "Twitch exposes no per-viewer
    country data…") and the `sponsorship_type` values stored in and read
    back from the database (`chat.sponsorship_type?.replace(/_/g, " ")`).
    Translating those means making a data module locale-aware, a real
    follow-up this file doesn't claim is done.
  - **User- and AI-generated content** — chat message text, the Manual
    Analyzer's canned `reasoning` string, and anything else that is data
    rather than UI chrome is never translated; per §12, offer/chat text is
    evaluation-only and isn't rerouted through translation either.
  - The `<option>` elements under the Analyzer's sponsorship-type `<select>`
    carry an explicit `bg-slate-900 text-white dark:bg-slate-900
    dark:text-white` class: native option popups don't reliably inherit the
    app's `--color-fg` theme token in dark mode, so they're pinned dark and
    readable regardless of theme rather than left to inherit.
- **RTL layout**: the shared chrome's physical Tailwind utilities
  (`border-l-*`, `pl-*`/`pr-*`, `right-0`/`left-0`, `text-left`) were
  converted to logical ones (`border-s-*`, `ps-*`/`pe-*`, `end-0`/`start-0`,
  `text-start`) so they flip automatically under `dir="rtl"` — flex-row
  layouts (Sidebar+content, TopBar's icon row) mirror on their own, that's
  plain CSS under `dir`, not something built here. The one manual case is
  `hover:translate-x-0.5` (a CSS transform, which doesn't flow with `dir`
  the way logical properties do) — paired with an explicit
  `rtl:hover:-translate-x-0.5`. Decorative-only elements (the landing
  hero's ambient glow blobs) were left physically positioned; they're not
  reading content, so an unmirrored accent isn't a correctness bug.

---

## 16. Feature freeze & launch readiness (from 2026-10-22)

**Feature freeze.** No new features or ad-hoc improvements until launch. A
change goes in only if it fixes a launch blocker: something that leaks a
creator's contact details, lets a party bypass the platform or the commission,
loses or corrupts deal data, breaks a core flow (§4 onboarding, §5 intake,
§6 chat, Discover → deal room → paid), or makes the legal pages untrue.
Everything else goes on the post-launch list. Ask before treating anything
else as a blocker.

**Definition of Done ("Launch Ready")** — all of these must be true:
1. `main` carries every fix, CI-equivalent checks pass (`npm test`, `tsc`,
   `lint`, `build`), and the production deployment of that commit is READY.
2. Every migration in `supabase/migrations/` is applied to the live project
   (0022, outstanding when this section was written, was applied on
   2026-10-29; 0023 on 2026-10-30, see the update below).
3. The production smoke test passes end to end, with real test accounts:
   - admin creates a creator and a company, and the forced reset works;
   - mail to a creator's alias opens a deal room;
   - the company previews and sends a Discover offer;
   - both sides chat, with masking verified;
   - the deal goes agreed, then admin marks it paid.
4. The production environment has every required variable (`.env.example`),
   and `/admin/system` shows no unconfigured *required* integration.
   `NEXT_PUBLIC_ENABLE_UI_PREVIEW` must be unset in production.
5. Supabase Auth's Site URL and redirect URLs are set to the production
   domain, and the password rules are tightened: at least 10 characters,
   with digits, upper/lower-case letters and symbols. Leaked-password
   protection (HaveIBeenPwned) is Pro-plan only. Free-plan projects also
   pause after about 7 days of low activity, and while paused every inbound
   offer fails. So the owner decides between Pro ($25/mo, which removes
   both problems) and Free with those two risks accepted. §9's zero-cost
   rule is the owner's to bend, not ours.
6. The legal pages name the operator. `ENTITY_REGISTERED_NAME`,
   `ENTITY_ADDRESS` and `ENTITY_REGISTRATION` in
   `src/lib/constants/legal.ts` are filled with the owner's real details, and
   never invented.
7. The owner has decided whether in-app (Discover) deals keep showing the
   company's real email (`deal_chats.sender_email`) to the creator. Today
   they do. It is not a §6 violation (that rule protects the creator), but it
   does give both sides a way around the platform.

> **Update — production at `24db05b`, migration 0023 applied, cron not yet
> active (2026-10-30).** `main` was fast-forwarded to `24db05b` and Vercel
> production deployment `dpl_4yETVdehG6tWLNyybpBSfu2idZuw` is READY on
> `www.greenlightadvs.com`. Migration `0023_verified_geo_synced_at` was applied
> to the live project **before** that deploy (migration history version
> `20261030171145`). It only adds two nullable timestamp columns to
> `media_kits` (`verified_geo_synced_at`, `youtube_stats_synced_at`); no data
> changed, and every migration in `supabase/migrations/` (0001–0023) is now
> applied.
>
> **`CRON_SECRET` is not set in Vercel Production.** `vercel.json` registers
> the daily `/api/cron/youtube-data-freshness` job (03:17 UTC), but without
> the secret the route answers 401 to every call. That was checked on
> production after the deploy. So the YouTube freshness cleanup is
> **not actually running**: nothing is deleted, and no stored token is
> re-checked with Google. `/admin/system` reports `CRON_SECRET` as a missing
> *required* variable because `GOOGLE_OAUTH_CLIENT_ID` is set, which keeps
> item 4 above open. Until the owner sets it (16+ characters, then a
> redeploy), the privacy policy's 30-day deletion statement describes code
> that is deployed but not scheduled. Once it is set, the job's first runs
> will refresh the one stored YouTube token through Google every day. No
> secret value is recorded in this repository.

**Not launch-gating** (fast-follow): verified audience geo via YouTube /
Instagram OAuth (§7.3). Google and Meta review times are outside our control.
Declared-only geo is already fully labelled, and §7.4 already caps the
risk rating when the data is unverified. Also post-launch: error-tracking
service, company-side new-message notifications, and the §11 roadmap.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
