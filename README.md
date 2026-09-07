# Green Light

> Your Personal Business Manager — an admin-gated sponsorship marketplace
> connecting Creators and Companies.

**[`CLAUDE.md`](./CLAUDE.md) is the single source of truth** for brand, design
system, data model and business logic. Read it before changing anything here.

## Stack (§9)

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind v4 |
| Motion | Framer Motion |
| Backend / DB | Supabase (Postgres + Realtime + RLS) |
| AI engine | Google Gemini *(not yet wired up)* |
| Email | Resend, inbound webhooks *(not yet wired up)* |

## Supabase project

| | |
|---|---|
| Project | `green-light` |
| Ref | `kpuecrvdrkhemyvibyfa` |
| Region | `eu-central-1` (Frankfurt — closest to the MENA primary market) |
| URL | `https://kpuecrvdrkhemyvibyfa.supabase.co` |
| Plan | Free tier ($0/mo), per the zero-cost MVP constraint in §9 |

All four migrations in `supabase/migrations/` are **applied**, and the Supabase
security linter returns **zero lints**.

Deploying? See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the Vercel + Resend
setup, the first-admin bootstrap, and the pre-launch checklist.

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in the two Supabase keys
```

The first admin has to be created from a trusted shell, because Green Light has
no public sign-up and only an admin can open an account:

```bash
node scripts/bootstrap-admin.mjs "Your Name" you@example.com
```

It prints a temporary password. Sign in with it and you will be forced to
replace it before anything else in the app is reachable.

```bash
npm run dev
```

## Layout

```
src/
  app/
    (auth)/           login + forced first-login password reset (§4)
    (app)/            authenticated shell: dashboard, deal inbox + rooms,
                      manual analyzer, media kit, settings, admin
                      accounts + violation queue
    suspended/        terminal state for a banned account (§6, §12)
    auth/signout/
  components/
    brand/            Logo + LogoMark, per the usage rules in §2.3
    ui/               GlassPanel, GlowOrbs, PageTransition, form primitives
    dashboard/        shell and page building blocks
  lib/
    supabase/         browser / server / service-role clients + session guards
    ai/               deal evaluation: Gemini client, rule-based fallback,
                      and the §7.4 verification cap as a pure rule
    email/            §5 intake: payload parsing, Svix signature
                      verification, and the deal-room pipeline
    deals/            deal-chat reads + the §7.4 evaluation payload builder
    media-kit/        §7.3 verification matrix, §8 tier limits, audience
                      geography parsing, and the §12 disconnect
    mask.ts           contact-info stripping (§6.1) — server-side, pre-persist
    alias.ts          inbound alias generation (§5.1)
    auth.ts           requireProfile / requireRole
  app/api/webhooks/   inbound email endpoint (§5.3) — public, signature-gated
  proxy.ts            route guards (Next 16's replacement for middleware.ts)
supabase/migrations/  schema (§10), forced-reset column, RLS policies
supabase/tests/       RLS + chat regression tests
```

## Brand assets — known issue

All three supplied PNGs in `public/branding/` are **fully opaque**;
`logo_dark_full.png` carries a baked-in `#293E61` navy plate and
`icon_color.png` a solid white one, though §2.3 describes the icon as having a
transparent background. `Logo` / `LogoMark` therefore render each mark on a
rounded plate matching its own background, so the edge reads as an intentional
chip instead of a stray rectangle. Nothing is recolored. Transparent PNGs or
SVGs would remove the workaround entirely.

## Design system (§2)

Tailwind v4 is CSS-configured, so the token block in `src/app/globals.css`
replaces the `tailwind.config.js` sketch in the spec while producing the same
utility names: `navy`, `navy-dark`, `brand-green`, `ink`, plus `obsidian` for
the app shell background. `glass-panel` / `glass-panel-solid` are custom
utilities carrying the Liquid Glass recipe verbatim.

## Security model (§6, §12)

RLS is enabled on all four tables, with 11 policies. Row policies gate *rows*;
column privileges gate *columns*, and both are needed — a row policy saying
"a creator may update their own profile" also permits `SET role = 'admin'`
unless the column grant says otherwise.

| Role | Reach |
|---|---|
| `anon` | Nothing. No policy is scoped to it, and since `0005` it holds no table grant either. |
| creator | Own rows only. Writes limited to `full_name`, their own reach figures and `declared_top_countries`, and deal status short of `paid`. |
| admin | All rows, via `private.is_admin()`. |
| `service_role` | Bypasses RLS. Used for account creation, the inbound-email webhook and the OAuth analytics sync. |

Three things are deliberately unwritable by any signed-in user, because each
one is a business rule the client must not be able to state for itself:

- `profiles.role` and `subscription_plan` — privilege escalation, and free
  self-upgrades past the §4.3 Discord billing flow.
- `media_kits.audience_verified` / `verified_top_countries` — a creator who can
  set these can forge the verified badge, which is exactly the screenshot fraud
  §1 and §7.2 exist to stop.
- `deal_chats.ai_evaluation` and settlement to `deal_status = 'paid'` — the risk
  rating is the platform's verdict, and escrow is reconciled by an admin (§12).

The RLS helper functions live in a `private` schema rather than `public`.
Anything in `public` is published by PostgREST as an RPC endpoint, so
`SECURITY DEFINER` helpers there would be callable at `/rest/v1/rpc/is_admin`.
Do not add `private` to the project's exposed-schemas setting.

`0005` additionally withdraws the `anon` role's default table grants. RLS
already made them inert, but the grant is what would go live if RLS were ever
switched off on a table — by a debugging session, a hurried migration, or a
restore from a dump predating `0003`. Nothing in the product reads these tables
as `anon`, so there was nothing to trade away.

### Verifying it

A clean linter proves RLS is switched on, not that it isolates anything.
`supabase/tests/rls_policies_test.sql` proves the second part — 23 assertions
covering cross-creator reads, thread injection with a known `chat_id`, role
escalation, badge forgery, the escrow guard and anon reachability. It impersonates roles the way
PostgREST does and rolls back, so it is safe against the live project:

```bash
psql "$DATABASE_URL" -f supabase/tests/rls_policies_test.sql
```

All 23 currently pass. Re-run it after any change to `0003`, `0004` or `0005`.

## Deal Chat Room (§6)

`/inbox` lists rooms; `/inbox/[chatId]` is the thread, live over Supabase
Realtime. The room is where the anti-bypass promise is actually kept:

1. `sendMessage` runs the §6.1 mask **server-side, before the insert**, so raw
   contact details never reach the database or another party's client. There is
   no client-side filtering, and there must not be — a client-side filter is one
   devtools call away from being bypassed.
2. Only the masked text is stored. The composer does not optimistically echo the
   draft, because what gets saved is the masked version and showing the sender
   their raw text would misrepresent what the room contains.
3. When the filter fires, `violation_logs` records which rules matched and the
   **already-redacted** excerpt — logging a violation by keeping the phone number
   verbatim would defeat the point of stripping it.
4. Writes go through the service role because RLS withholds `is_masked` from
   `authenticated`: whether a message was masked is the server's finding about
   the sender, not something the sender may assert.

`paid` is absent from the status control: §12 puts settlement behind manual
escrow, and the RLS `WITH CHECK` rejects a creator writing it, so offering the
button would only produce a database error.

### The permanent ban

§6 and §12 make off-platform contact exchange a permanent ban, recorded in
`profiles.banned_at` and enforced by `requireProfile()`. Blocking and logging
are automatic and immediate. Converting a log entry into the ban is an admin
action at `/admin/violations`, because the §6.1 phone rule matches any
10-digit-ish run — `"my last 3 videos did 250 000 3000 views"` trips it, and
there is a test asserting exactly that. Permanently closing a paying creator's
account on a regex false positive is not a risk worth taking when the message
is blocked either way.

## Manual Analyzer (§5.1)

`/analyzer` takes `sender_email`, `message_text`, `sponsorship_type` and
optional `target_countries`, and calls `evaluateOffer()` — the same function the
inbound-email webhook will use (§5.4), so a pasted offer and an auto-analysed
one can never drift apart on price. Nothing is persisted unless the creator
turns the result into a deal room, and the pasted text is masked before it
becomes the opening message: an offer forwarded by hand routinely contains the
sender's direct WhatsApp, and §6 does not exempt it for arriving manually.

The §7.4 weighting rule — *unverified audience data must never by itself produce
a green rating on a high-value deal* — lives in `src/lib/ai/rules.ts` as a pure
function applied **after** the engine answers, not as prompt text. A model can be
argued out of a rule by the offer it is reading; a function cannot. When it fires,
the UI says the rating was held at yellow and why.

### Engine

`GEMINI_API_KEY` selects the engine. With a key, Gemini (§9 — deliberately not
Claude, for cost on this path). Without one, a deterministic rule-based estimate
that is labelled as such in the UI and carries `engine: "heuristic"`, because
presenting arithmetic as the AI Co-Pilot would be a lie about the feature the
product is sold on.

> ⚠️ **§12 vs. the Gemini free tier.** §12 says AI processing is evaluation-only
> and must not forward content anywhere it could train general-purpose models.
> Google's terms for the *free* Gemini API tier permit submitted content to be
> used to improve their products; the paid tier does not. Offer text is a
> company's private correspondence. This is a billing decision, not a code one —
> nothing here logs or persists the prompt, but the free tier and §12 are in
> tension and someone needs to choose.

## Media Kit (§7)

`/media-kit` is where the product's central claim is kept honest. Every number
a sponsor eventually sees either came from a platform API or carries a
self-reported tag, and the page cannot render audience geography without one:
`CountryShareList` takes a `verified` prop and always draws the badge.

What makes that a guarantee rather than a convention is the database.
`saveMediaKit` deliberately uses the **creator's own Supabase client**, not the
service role, so it travels the same path a browser would and is bound by the
same column grants. `audience_verified`, `verified_top_countries` and
`analytics_oauth_connected` are withheld from `authenticated`, so a creator
cannot mark themselves verified even by crafting the request directly — and
`media_kit_test.sql` asserts exactly that, on update *and* on insert.

### Verification states (§7.3 × §8)

The connection control has four states, and the last two are kept apart on
purpose:

| State | Meaning |
|---|---|
| connected | Verified geo is live; offers disconnect |
| available | Platform supports it (§7.3) and the plan includes it (§8) |
| needs-upgrade | Platform supports it, the plan does not |
| **unsupported** | No API exists, so **no plan can deliver it** |

Telling a Starter creator to upgrade for Twitch audience geography would be
selling something upgrading cannot provide. Twitch and Kick expose no
per-viewer country data to third parties, so those cards say so instead.

### Disconnecting

§12: *"disconnecting must immediately set `audience_verified = false` and clear
`verified_top_countries`."* Immediately, in one statement — a creator who
revokes consent and still sees a verified badge has been told a lie about their
own data, and so has the sponsor reading it. Self-reported data survives the
disconnect; it was never the API's to take away.

### Outbound relay (§6)

A creator's reply is stored, masked, and then emailed to the company from the
platform's own address. `relayMessageToCompany()` has **no parameter that can
carry a creator's real address** — `creatorAlias` is the §5.1 platform alias and
`creatorDisplayName` is a name — so `primary_email` cannot leak into a header by
accident. That is enforced by the type system on every build rather than by a
test somebody could delete.

`reply_to` is the creator's inbound alias, which closes the loop: the company
replies, the reply lands on the alias, Resend webhooks it back, and the intake
appends it to the same deal room. The company only ever holds a
platform-controlled address, rotatable if abused.

Delivery outcome is recorded per message (`relayed_at` / `relay_error`, both
service-role-only). A relay that fails silently means the company never hears
back while the creator believes they replied — so the composer says so, and the
row records why.

## Not built: the OAuth handshake

`connectAnalytics` throws rather than pretending. Completing it needs a Google
Cloud project with a verified consent screen for `yt-analytics.readonly`
(sensitive scope — days-to-weeks of review, but **not** a CASA audit), a Meta
app through App Review for Instagram insights, and token storage with refresh.
The UI says the connection is waiting on platform review rather than offering a
button that dead-ends.

## Email intake (§5)

`POST /api/webhooks/resend`. A creator forwards their business mail to
`{handle}.{random}@analyze.greenlight.com` with a one-time Gmail rule; Resend
receives it and calls this endpoint. No Google OAuth, no Gmail API, no CASA —
that is the whole point of the design.

The flow: verify signature → parse → resolve the creator by alias → mask →
`evaluateOffer()` → create or update the deal room → post the Co-Pilot summary.

**This is the only public, unauthenticated write path in the product.** Without
a verified signature, anyone who learns the URL can mint deal rooms in any
creator's inbox, put words in a sponsor's mouth, and bill us for a Gemini call
per request. Verification is Svix HMAC-SHA256 over the *raw* body, with a
five-minute replay window and a constant-time compare, implemented directly in
`src/lib/email/verify.ts`. An unset secret returns 503 rather than falling open.

Idempotency is claimed **before** any work, by inserting into `inbound_emails`
on the provider's message id. Resend retries anything that is not 2xx, including
requests that timed out after we already committed; without that unique key each
retry mints a second room and a second paid Gemini call for the same offer. The
table doubles as the answer to "my offer never arrived", which is otherwise
unanswerable — an email for an unknown alias would leave no trace at all.

Response policy: 200 for anything decided, including a refusal; non-2xx only
where a retry could help. Returning 4xx for an unknown alias would have the
provider redeliver a message that can never resolve.

Two smaller decisions worth knowing:

- **A reply appends to the open room** rather than opening a new one, matched on
  (creator, sender) excluding `paid` — a settled deal is closed, so later mail
  from the same sponsor is a fresh offer.
- **`sender_email` is stored unmasked.** §6 protects the *creator's* contact
  details from the company, not the reverse; the sponsor's address is routing
  data that §10 requires and the §6 platform-relay reply needs. The message
  body, subject and any text attachment all go through the mask, which is where
  a sponsor's direct WhatsApp actually turns up.
- **Binary attachments are catalogued, not decoded.** Text parts are read into
  the offer (rate cards arrive as .txt and .csv); everything else is listed by
  name and type. Parsing arbitrary binaries on an unauthenticated endpoint is a
  much larger attack surface, and storing them needs a bucket and an AV
  decision that do not exist yet.

> ⚠️ **Unverified assumption.** Resend's inbound payload shape is not pinned
> down here. `normalizeInboundEmail` is deliberately tolerant — `to` may be a
> string, an array, or objects with `address`/`email`; the event may or may not
> be wrapped in `data` — but it is a guess. Send one real delivery to a request
> bin, compare, and delete this warning.

## Tests

```bash
npm test        # masking, §7.4 cap, geo parsing, tier rules, email
                # parsing, webhook signatures, HTML escaping — 79 assertions
npm run build   # typecheck + lint + production build
```

Database-level suites run against the live project and roll back:

```bash
psql "$DATABASE_URL" -f supabase/tests/rls_policies_test.sql          # 23
psql "$DATABASE_URL" -f supabase/tests/chat_and_violations_test.sql   # 14
psql "$DATABASE_URL" -f supabase/tests/media_kit_test.sql             # 12
psql "$DATABASE_URL" -f supabase/tests/email_intake_test.sql          # 12
psql "$DATABASE_URL" -f supabase/tests/outbound_relay_test.sql        # 9
```

And the webhook endpoint itself, over real HTTP with real signatures:

```bash
npm run build && npm run start -- -p 3666 &
node scripts/webhook-e2e.mjs      # 8
```

That last one exists because a route can be entirely correct and still
unreachable — it caught the auth proxy redirecting `/api/webhooks/*` to
`/login`, which returned a cheerful 200 for deliveries that were never
processed.

## Not done yet

- The §7.3 analytics OAuth handshake — see above. Until it exists, no creator
  can reach a verified state, so in practice every high-value deal is capped at
  yellow by §7.4.
- Basic stats sync. `platform_handle` is captured for it, but nothing calls the
  YouTube Data API or Twitch Helix yet, so reach figures are creator-entered.
- **TikTok.** §7.3 lists it in the verification matrix as declared-only, but the
  §10 `platform` CHECK constraint does not include it, so it cannot be stored.
  Flagged rather than silently widened — adding a platform is a product call.
- Re-evaluation on reply. The Co-Pilot rates a room when it opens; a
  counter-offer arriving later does not currently move the rating.
- Category benchmark pricing. §7.1 says `content_category` should drive
  benchmark pricing but does not say from what table; `CATEGORY_CPM` in
  `src/lib/ai/evaluate.ts` is a placeholder needing real numbers.
- **Company-side access.** The `company` role has no policy on any table, so a
  signed-in company account currently reads nothing and its inbox is empty.
  That is the safe direction to be wrong in, but it needs designing. Do not fix
  it by adding `company_id = auth.uid()` to `profiles_select`: one such policy
  hands companies whole creator rows including `primary_email` and
  `inbound_alias`. The shape that works is a column-limited creator directory
  view with `security_invoker = on`.
