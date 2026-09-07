# Deploying Green Light

The app is stateless: everything lives in Supabase (`kpuecrvdrkhemyvibyfa`,
eu-central-1) and Vercel runs the Next.js front of it. All nine migrations are
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
| `NEXT_PUBLIC_INBOUND_DOMAIN` | your real inbound domain | Falls back to `analyze.greenlight.com` |
| `NVIDIA_API_KEY` | [build.nvidia.com](https://build.nvidia.com/moonshotai/kimi-k3) | Rule-based pricing, labelled as such |
| `RESEND_API_KEY` | Resend dashboard | Replies never reach companies |
| `RESEND_INBOUND_WEBHOOK_SECRET` | Resend → Webhooks (`whsec_…`) | Webhook returns 503 |
| `RESEND_FROM_ADDRESS` | e.g. `Green Light <deals@…>` | Falls back to `deals@<inbound domain>` |

`SUPABASE_SERVICE_ROLE_KEY` bypasses every RLS policy in this repo — anyone
holding it can read and write every row. It must never be prefixed
`NEXT_PUBLIC_`, and it does not belong in the repo, in a screenshot, or in a
chat message. If it has ever been in one, rotate it in the Supabase dashboard.

Next.js reads server env vars at build and request time, so **changing one needs
a redeploy** to take effect.

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
2. **Point inbound mail at the webhook**: `https://<your-domain>/api/webhooks/resend`
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
npm test                    # 79 unit assertions
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
  `nvidia.ts` parses defensively (direct JSON, then a fenced block, then a
  balanced-brace scan) for exactly this reason. Send one real evaluation
  through the Manual Analyzer after deploying and confirm the result looks
  sane before relying on it.
- **Basic stats are creator-entered.** Nothing calls the YouTube Data API or
  Twitch Helix yet, so §1's anti-fraud promise currently holds for audience
  geography and not for view counts.
