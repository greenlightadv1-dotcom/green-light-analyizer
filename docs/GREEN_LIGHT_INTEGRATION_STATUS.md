# GREEN_LIGHT_INTEGRATION_STATUS

Status of every external integration: email, social platforms, AI and supporting services.
Investigation date: **2026-10-29**. Method: code reading, read-only SQL aggregates on the live Supabase project `kpuecrvdrkhemyvibyfa` (counts and booleans only, never content or personal data), read-only Resend configuration listing, and official provider documentation.

No code, configuration, data or deployment was changed.

## Evidence labels

| Label | Meaning |
|---|---|
| **[V]** | Verified in this investigation. |
| **[C]** | Established from code. |
| **[D]** | Established from official provider documentation. |
| **[U]** | Unverified. |

## Summary

| Integration | Code state | Live evidence | Status |
|---|---|---|---|
| Resend inbound → deal room (§5) | Implemented | 5 deliveries 22–29 Sep 2026; all stored offers contain **only the subject** | **Broken: the email body is never retrieved** (root cause below) |
| Resend outbound relay (§6) | Implemented | 5 messages relayed; 1 failed with "RESEND_API_KEY is not configured" | Works when configured [V]; unthrottled |
| NVIDIA AI (Co-Pilot, drafts, intel, niche) | Implemented | 2 of 3 inbound Co-Pilot summaries (22 Sep) were the rule-based fallback; 1 (24 Sep) used the AI | Intermittently unavailable in Sept [V]; current status unknown [U] |
| YouTube Data API (public stats by handle) | Implemented | No media kit has a `platform_handle` or subscriber count | Never exercised live [V] |
| YouTube Analytics OAuth (verified audience geo) | Implemented | 1 connection (15 Sep); its kit never became verified | **Broken: invalid Analytics query**; plus likely 7-day token expiry [D][U] |
| Instagram Graph OAuth | Implemented | 0 connections | Never exercised; pinned to an **expired Graph API version** [D] |
| X, TikTok, Twitch, Facebook | Placeholders (HTTP 501) | — | Not implemented |
| Kick | Self-reported only | — | No API path (by design, §7.3) |
| WhatsApp alerts (Meta Cloud API) | Implemented | 2 profiles opted in; delivery not observable | Unknown [U] |
| WHOIS (IP2Whois) + Google Safe Browsing | Implemented | 5 of 6 rooms have `security_check` | Working when keys are set [V] |
| Supabase DB webhook → Discord | Implemented | **No webhook trigger exists live** | Not attached [V]; the row-forwarding risk is latent |
| Supabase Storage | Not used | 0 buckets | Not configured [V] |
| Vercel | — | Project `green-light` exists (team `greenlightadv1-6093`), last updated 2026-10-22 18:50 UTC | Deployments unreadable from this tooling (403/404) [U] |

---

## 1. Incoming email (Feature F)

### 1.1 Path as implemented [C]

| Step | Behaviour | File |
|---|---|---|
| 1 | The creator's Gmail forwards to the alias. | Manual setup |
| 2 | MX → Resend; both domains verified with receiving enabled [V]. | Resend |
| 3 | Resend sends a Svix-signed POST to `https://www.greenlightadvs.com/api/webhooks/resend` (`email.received`) [V]. | `src/app/api/webhooks/resend/route.ts` |
| 4 | Signature verification: HMAC over the raw body, 300 s window. | `src/lib/email/verify.ts` |
| 5 | Normalisation: reads `data.text` / `data.html` / `data.headers` **from the webhook payload**. | `src/lib/email/parse.ts:319-347` |
| 6 | Claim on `provider_message_id` (prefers `data.message_id`), then resolve alias → screen → mask → `evaluateOffer` → WHOIS / Safe Browsing → create or append room → Co-Pilot summary → WhatsApp. | `src/lib/email/intake.ts` |

### 1.2 Confirmed root cause [D][C][V]

1. **Resend's documentation:** "Webhooks do not include the email body, headers, or attachments, only their metadata. You must call the Received emails API … to retrieve them." (resend.com/docs/dashboard/receiving/get-email-content)
2. **The code never calls that API.** The only Resend calls are outbound sends (`src/lib/email/outbound.ts:66`, `src/lib/resend.ts:73`), and `parse.ts:324-325` reads body fields that the payload does not carry. The file's own header (`parse.ts:9-14`) says the payload shape was never verified.
3. **Live database:** all 4 stored inbound offer messages equal `subject + "\n\nSubject: " + subject`, with **0 extra characters** [V]. No email body has ever reached Green Light.

**Consequences:**
- Offers are rated on the subject line alone: 4 of 6 rooms red, 2 yellow.
- `offered_amount` is null in 5 of 6 rooms.
- The screener never sees headers, so its `List-Unsubscribe` / `Precedence` / `Authentication-Results` signals are dead code in production.
- Attachments are never read.
- Violation logs are triggered only by subjects.

### 1.3 Related issues

| ID | Issue | Evidence | Status |
|---|---|---|---|
| E2 | The idempotency key prefers `data.message_id`, which Resend's example payload shows is the RFC `Message-ID` header (`"<example+123>"`), not a per-delivery id. One email forwarded by two creators would collide, and the second creator's copy would be dropped. | Resend blog payload [D]; `parse.ts:328-333` [C] | Premise now documented; fix by preferring `data.email_id` |
| E3 | A failed claim is never retried: the provider's retry is answered "duplicate ignored" (audit A10). | Local harness by audit hunter [C] | Confirmed by harness; unfixed |
| E4 | Room threading and domain trust are keyed on the unauthenticated `From` header (A4). | [C] | Needs validation |
| E5 | No rate limit or quota on paid work per delivery (A16). | [C] | Needs validation (provider limits unknown) |
| E6 | No admin view of `inbound_emails`; only the creator-facing held-mail panel exists. | `grep` [V] | Diagnostics gap |
| E7 | Resend shows **0 received emails and 0 webhook events** in its visible history, while the DB recorded deliveries up to 29 Sep. | Resend MCP [V] | Retention window not documented here [U]; no delivery observed in the last ~30 days |
| E8 | The webhook URL uses `www.`. If `www` redirects to the apex, Svix may not follow it. | Resend config [V]; redirect behaviour [U] | 5 deliveries succeeded in Sept, so it worked then |

### 1.4 What remains unverified
- Current MX records: DNS lookups are blocked from this sandbox.
- Whether any creator has forwarded mail since 29 Sep.
- The www/apex redirect.
- Resend's retention period.

**Owner check:** send one test email to a test creator alias, then confirm in the Resend dashboard (Receiving → Emails, Webhooks → events) and in `inbound_emails`.

### 1.5 Acceptance criteria (Feature F)

1. A representative forwarded email (Gmail forward, HTML-only, plain-only, multipart, with a `.txt` attachment, Arabic body) produces a deal room whose offer message contains the body text. Tested with sanitised fixtures built from the documented `email.received` payload plus the documented Received-email API response.
2. The body fetch is idempotent and bounded (timeout inside the existing 50 s AI budget). If the fetch fails, the delivery is recorded `failed` with a diagnosable `detail` and stays retryable (E3 fixed).
3. Duplicate delivery of the same `email_id` never creates two rooms. The same RFC `Message-ID` sent to two creators creates two rooms (E2 fixed).
4. An invalid signature is still rejected: `scripts/webhook-e2e.mjs` 8/8 and the existing `verify.test.ts` / `parse.test.ts` keep passing.
5. An admin diagnostics view lists recent deliveries showing date, status, detail, spam score, which step failed and masked subject, but **never** the body.

---

## 2. Social platforms (Feature M)

### 2.1 YouTube

| Item | Data API v3 (public stats) | Analytics API (verified geo) |
|---|---|---|
| Code | `src/lib/youtube/client.ts` (`channels`, `playlistItems`, `videos`; key `YOUTUBE_API_KEY`) | `src/lib/oauth/youtube.ts`, `src/app/api/oauth/[platform]/{start,callback}`, `syncVerifiedGeo` in `src/lib/media-kit/actions.ts` |
| Ownership proof | None: the handle is typed by the creator (hardening) | OAuth grant, but the linked channel is **not bound** to the kit's handle (A12) [C] |
| Scope | n/a (API key) | `yt-analytics.readonly` only (`youtube.ts:18`) |
| Live | Never used [V] | 1 connection, refresh token present, last updated 15 Sep [V] |
| **Defect** | — | **Query `dimensions=country&metrics=viewerPercentage` is not a supported report.** Google documents `viewerPercentage` only for *Viewer demographics* (`ageGroup` / `gender`); *User activity by country* supports `views`, `estimatedMinutesWatched`, etc. [D] (developers.google.com/youtube/analytics/channel_reports). The one connected creator never became verified [V]. |
| Likely second cause | — | Google: apps whose consent screen is **"Testing"** (external) get refresh tokens that **expire after 7 days** [D] (developers.google.com/identity/protocols/oauth2). The consent-screen status is unknown [U]. |
| Data integrity | — | **1 live kit has `audience_verified=true` and `analytics_oauth_connected=true` with no token row** [V]: a "Verified" badge with no API connection behind it, against §7.2. It needs owner-approved data correction. |
| Other gaps | Quota 10k units/day (Google default) [U for this project] | Plan gate only at OAuth start (A13); callback ignores token-save errors; no provider-side revocation on disconnect; no last-error or last-success fields |

### 2.2 Instagram
- **Code:** `src/lib/oauth/instagram.ts`, which picks the first Page that has an IG business account (A12). It hard-codes `graph.facebook.com/v19.0` in 5 places.
- **Version:** Meta lists Graph API **v19.0** as "Available until **May 21, 2026**" [D]. That date has passed, so behaviour is untested.
- **Live:** 0 connections. Meta App Review status unknown [U].

### 2.3 Others
- **X, TikTok, Twitch, Facebook:** `src/lib/oauth/platforms.ts` placeholders; the start route returns 501 [C]. `TWITCH_CLIENT_*` env vars are read by no code.
- **TikTok:** cannot be stored in `media_kits` (the `platform` CHECK is `youtube`, `twitch`, `kick`, `instagram`) [C].

### 2.4 Recommended order (Feature M)
1. **YouTube Analytics first.** It has the clearest defect, one real connected user and a documented fix:
   1. fix the query (`views` by `country`, then compute shares);
   2. surface sync errors and `last_successful_sync`;
   3. bind the channel to the kit;
   4. gate on plan;
   5. correct the orphan verified row (with approval).
2. **YouTube Data API second.** Use the OAuth channel id when available instead of the typed handle.
3. **Instagram third.** It needs an API version upgrade and Meta App Review.
4. **The rest** only when an official API with audience data exists.

### 2.5 Acceptance criteria per platform
- Ownership is proven through OAuth (the channel or account id returned by the provider), and the media kit is bound to that id.
- Required scopes are documented in this file.
- Supported metrics are mapped exactly to provider metric names with definitions; unsupported metrics are shown as "not provided by <platform>", never 0.
- An expired or revoked token sets a visible "reconnect" state and clears `audience_verified` and verified geo (§12).
- A failed sync stores `last_sync_error` (code only) and keeps the last good values clearly dated.
- A sync writes only the caller's own kit. Tested with two creators.

---

## 3. AI services (Features I, E, H)

| Item | State |
|---|---|
| Provider | NVIDIA NIM only (§9). Default model `meta/llama-3.3-70b-instruct` (`src/lib/ai/nvidia-config.ts:55`); `NVIDIA_MODEL` may override it in Vercel [U] |
| Client | `src/lib/ai/chat.ts`: 50 s deadline, 32 s per attempt, one retry, JSON validation, fallback to rule-based output |
| Live usage | `ai_analyze_offer` 6 presses, `ai_reply_draft` 11, `ai_company_intel` 13, `ai_detect_niche` 10 (rate-limit counters) [V]. **Discover never used** (0 `offer_send` / `ai_offer_preview` rows, 0 Discover rooms) [V] |
| Fallback rate | 2 of 3 inbound summaries were rule-based on 22 Sep [V]. Current reachability: unknown. Check `/admin/system` and `node scripts/check-nvidia.mjs` (one billable call) |
| Cost tracking | None beyond rate-limit counters [C] |

Analyzer defects are in GREEN_LIGHT_AI_PRODUCT_SPEC.md §1.

---

## 4. Supporting services

- **Outbound email:** Resend REST. One historical "RESEND_API_KEY is not configured" relay failure [V]. Domains verified [V].
- **WhatsApp:** `src/lib/whatsapp.ts`. Number ownership is not verified (hardening). Free-form messages outside a 24-hour window may be refused by Meta [U].
- **WHOIS / Safe Browsing:** `src/lib/security/*`. Fixed hosts, no SSRF [C].
- **Discord:** `src/lib/discord/logger.ts`. No DB webhook trigger exists live [V]. If the owner later attaches one, A15 (whole-row forwarding) must be fixed first.
- **Storage:** Supabase Storage has 0 buckets [V]; avatars are external URLs. Features B, C, D and L need private buckets with RLS.
