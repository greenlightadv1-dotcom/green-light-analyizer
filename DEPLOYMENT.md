# Deploying Green Light

The app is stateless: everything lives in Supabase (`kpuecrvdrkhemyvibyfa`,
eu-central-1) and Vercel runs the Next.js front of it. All 21 migrations are
already applied to that project, so a deploy is configuration plus DNS.

Nothing here needs a secret at **build** time. Every key is read per request, so
a build succeeds with placeholders and a leaked build log never contains one.

---

## 1. Vercel

Import the repo, framework auto-detects as Next.js. Then set environment
variables under **Project Settings → Environment Variables**:

| Variable | Value | Without it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kpuecrvdrkhemyvibyfa.supabase.co` | Nothing works |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Nobody can sign in |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (`service_role`) | Most of the product is inert |
| `NEXT_PUBLIC_APP_URL` | `https://greenlightadvs.com` | Falls back to the same value, so links look right but a preview deploy advertises production |
| `NEXT_PUBLIC_INBOUND_DOMAIN` | `analyze.greenlightadvs.com` | Falls back to the same value |
| `NVIDIA_API_KEY` | [build.nvidia.com](https://build.nvidia.com) | Rule-based pricing and written reply templates, both labelled as such. There is no second provider |
| `RESEND_API_KEY` | Resend dashboard | Replies never reach companies |
| `RESEND_INBOUND_WEBHOOK_SECRET` | Resend → Webhooks (`whsec_…`) | Webhook returns 503 |
| `RESEND_FROM_ADDRESS` | e.g. `Green Light <deals@greenlightadvs.com>` | Falls back to `deals@greenlightadvs.com` — must be a domain verified for **sending** in Resend |

`SUPABASE_SERVICE_ROLE_KEY` bypasses every RLS policy in this repo — anyone
holding it can read and write every row. It must never be prefixed
`NEXT_PUBLIC_`, and it does not belong in the repo, in a screenshot, or in a
chat message. If it has ever been in one, rotate it in the Supabase dashboard.

Next.js reads server env vars at build and request time, so **changing one needs
a redeploy** to take effect.

Everything above is what the product needs to function at all. The rest are
optional integrations, each of which **degrades quietly by design** — which is
the right behaviour and also how a deployment ends up half-working with nobody
able to say which half. Set what you have; leave the rest unset deliberately
rather than by accident:

| Variable | Powers | Unset |
|---|---|---|
| `NVIDIA_MODEL` | Which model on NIM answers | Defaults to `z-ai/glm-5.3`. A **typo here is not an error** — the call 404s and the product quietly serves rule-based output |
| `NVIDIA_REASONING_EFFORT` | Opt-in reasoning depth on the pricing call | Not sent. Only set it if the configured model honours the field |
| `YOUTUBE_API_KEY` | Media Kit stats sync | No YouTube stats |
| `GOOGLE_SAFE_BROWSING_API_KEY` | Sender-URL threat check | Renders "could not check", never an all-clear |
| `IP2WHOIS_API_KEY` | Sender-domain WHOIS in the deal room | Same — "could not check" |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | Verified audience geography, YouTube (§7.3) | Connect button returns a clear "not configured" state |
| `META_APP_ID` / `META_APP_SECRET` | Verified audience geography, Instagram (§7.3) | Same |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | New-deal WhatsApp alerts | Toggle still saves; no message is ever sent |
| `SUPABASE_WEBHOOK_SECRET` | `POST /api/webhooks/supabase` | Endpoint returns 503 rather than accepting unauthenticated calls |
| `DISCORD_SUPABASE_WEBHOOK_URL` / `_GITHUB_` / `_DEPLOYS_` | Ops notifications to Discord | No notifications. Each value **is** the credential for posting to that channel |
| `NEXT_PUBLIC_ENABLE_UI_PREVIEW` | `/preview`, the signed-out mock UI | Preview is off — which is what production wants |

`TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` appear in `.env.example` but no code
reads them yet; the Twitch sync §9 describes is not built. Setting them in
Vercel does nothing.

### The AI path

Every model call goes to **NVIDIA and nowhere else** (`src/lib/ai/chat.ts`,
configured in `nvidia-config.ts`). The path is **NVIDIA → static fallback**;
there is no second provider and nothing in the codebase reaches another AI
host. Anything that ends the call — a 401 on a bad key, a 404 on a bad model
id, a 429 rate limit, a 5xx, a timeout, or a 200 whose content will not parse
into the expected shape — falls to what the product can compute itself:
rule-based pricing (labelled as such in the UI) and the written reply
templates. Company intelligence and niche detection have no static equivalent
and report that the engine is unavailable.

The call budgets 30s, and the inbound webhook exports `maxDuration = 60`
because it waits on that synchronously — a function the platform kills
mid-call returns nothing at all, not even the rule-based estimate.

Failures are logged with their status, so a spent quota (429) and a wrong
model id (404) are distinguishable in the logs. From outside, both look
identical: the product just quietly serves rule-based output.

**The names above are exact.** They are the strings `process.env.<NAME>` is
read with in the code, and Vercel matches them literally — a variable named
`OPENAI_API_KEY`, `NVIDIA_KEY` or `NVIDIA_API_TOKEN` is simply not read, and
nothing will report an error. `/admin/system` renders the live presence of
every one of them (presence only — never a value, prefix or length), which is
the fastest way to confirm a deploy picked up what you set.

### Domain and DNS

`greenlightadvs.com` is the production domain. Add it under **Project Settings
→ Domains**; Vercel prints the exact records to create at the registrar — an
`A` for the apex and a `CNAME` for `www`. Copy them from the dashboard rather
than from memory; the values change.

Two records that are **not** Vercel's and are easy to forget:

| Host | Type | Purpose |
|---|---|---|
| `analyze.greenlightadvs.com` | `MX` | Receives forwarded offers. Value comes from Resend → Domains. |
| `greenlightadvs.com` | `TXT` (SPF) | Lets Resend send relayed replies as you. |
| `resend._domainkey.greenlightadvs.com` | `TXT`/`CNAME` (DKIM) | Same; without it replies land in spam. |
| `_dmarc.greenlightadvs.com` | `TXT` | Start at `v=DMARC1; p=none; rua=mailto:dmarc@greenlightadvs.com`, tighten to `p=quarantine` once reports are clean. |

The mail subdomain is unaffected by HSTS — that header governs browsers, not
SMTP — but every subdomain that *is* served to a browser must have a valid
certificate, because the HSTS header now carries `preload` (see
`next.config.ts`). Submit the domain at
[hstspreload.org](https://hstspreload.org) once DNS resolves; removal from that
list takes months, so do it after the domain is settled, not before.

`privacy@greenlightadvs.com` and `support@greenlightadvs.com` are published in
the Terms and Privacy Policy and must actually receive mail. A Google or Meta
reviewer emails them, and GDPR Art. 15–21 requests have a one-month clock.

### Verify

Sign in as an admin and open **/admin/system**. It lists which variables are
present — presence only, never values — and what is degraded while each is
missing. That page is the fastest answer to "it deployed but something is off".

---

## 2. First admin account

There is no public sign-up (§4), so the first account is created from a shell
with the service-role key in the environment:

```bash
node scripts/bootstrap-admin.mjs "Your Name" you@example.com
```

It prints a temporary password. Signing in with it forces a password change
before anything else is reachable. Every later account is created in-app at
**/admin/users**.

---

## 3. Email intake (§5)

The pipeline is inbound → deal room → reply → outbound, and both halves need
DNS on the inbound domain.

1. **Add the domain in Resend** and create the DNS records it gives you (MX for
   receiving; SPF/DKIM for sending). Both matter: without SPF/DKIM, relayed
   replies land in spam, which looks exactly like the relay being broken.
2. **Point inbound mail at the webhook**: `https://greenlightadvs.com/api/webhooks/resend`
3. **Copy the signing secret** into `RESEND_INBOUND_WEBHOOK_SECRET` and redeploy.
4. **Verify the sender address** in `RESEND_FROM_ADDRESS` — Resend refuses to
   send from an unverified one.

### Confirm the payload shape before trusting it

`normalizeInboundEmail` is written against an **assumed** Resend inbound schema.
It is deliberately tolerant, but it has never seen a real delivery. Before
relying on it:

- send one real email to a creator's alias,
- check the row in `inbound_emails` (admin-readable),
- if `status` is `rejected` or the parse looks wrong, capture the raw payload
  from Resend's dashboard and adjust `src/lib/email/parse.ts`,
- then delete the warning comment at the top of that file.

Until a real delivery has been through, treat §5 as untested in production.

---

## 4. Before you call it live

```bash
npm ci
npm test                    # 105 unit assertions
npm run build
node scripts/webhook-e2e.mjs   # 8, against a running build
```

And the database suites, which are the ones that prove RLS actually isolates
creators rather than merely being switched on:

```bash
for f in supabase/tests/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Every row must read `PASS`. They roll back, so they are safe against the live
project.

Also confirm in the Supabase dashboard that the security advisor reports **zero
lints**, and that `private` is **not** in the exposed-schemas list (Settings →
API). Adding it would republish the RLS helper functions as public RPC
endpoints.

---

## Known gaps at launch

- **Analytics OAuth (§7.3) is not built.** It needs a verified Google consent
  screen for `yt-analytics.readonly` and a Meta App Review. Until then no
  creator can reach a verified state, so §7.4 caps every high-value deal at
  yellow. That is the system working as designed, but it means the verified
  path is untested end to end.
- **The company role has no RLS policy**, so a company account reads nothing.
  Deliberate — see the note at the end of `0003_rls_policies.sql` before
  changing it.
- **Verify NVIDIA's data-retention terms before production use.** §12 forbids
  sending content anywhere it could train general-purpose models. NVIDIA's
  Trial ToS says prompts/responses are not used for training — better than
  Gemini's free tier, which the spec originally named and which permits
  exactly that. But the same terms describe up to 30 days of content retention
  on the free/trial tier for security monitoring, which is not the same as
  "not logged/forwarded anywhere." Read the actual terms
  ([PDF](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf))
  before treating this as fully resolved.
- **The exact NVIDIA response format has not been tested against a live call.**
  Outbound access to `integrate.api.nvidia.com` is blocked from the sandbox
  this was built in, so `response_format: {type:"json_object"}` support for
  this specific model was verified from documentation, not a real request.
  `chat.ts` parses defensively (direct JSON, then a fenced block, then a
  balanced-brace scan) for exactly this reason. Send one real evaluation
  through the Manual Analyzer after deploying and confirm the result looks
  sane before relying on it.
- **Basic stats are creator-entered.** Nothing calls the YouTube Data API or
  Twitch Helix yet, so §1's anti-fraud promise currently holds for audience
  geography and not for view counts.
