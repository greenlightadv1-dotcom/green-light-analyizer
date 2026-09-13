# External API integrations + admin subscription renewal — design

## Scope

Four pieces, delivered together but independent of each other:

1. Domain/security analysis in the Manual Analyzer (Google Safe Browsing +
   IP2Whois + a trust score).
2. YouTube channel stats sync in the Media Kit.
3. OAuth placeholders for X, TikTok, Meta, Twitch.
4. Admin subscription renewal/extension (`/admin/users`), replacing the
   hardcoded 30-day-on-plan-change rule with an explicit, admin-chosen
   duration that can also renew a plan that isn't changing tier.

All four assume the real API keys live only in the user's local
`.env.local`, never in this sandbox — every integration follows the
existing "degrade gracefully, label the fallback honestly" pattern
(`evaluate.ts`'s heuristic fallback, `/admin/system`'s presence-only report)
so the app keeps working with keys absent, and live-call verification
happens on the user's machine, not here.

## 1. Domain & security analysis

### Where it runs

`src/app/(app)/analyzer/actions.ts`, after `buildEvaluationInput`. A new
`runSecurityCheck(senderEmail, offerText)` runs via `Promise.allSettled`
alongside `evaluateOffer()` — never blocks the price/risk result, and a
failure in one does not affect the other.

### Inputs

- **Domain**: extracted from `senderEmail`'s domain part (`brand@sponsor.com`
  → `sponsor.com`). No new form field.
- **URLs**: up to 5 `https?://` URLs regex-extracted from `offer_text`.

### Google Safe Browsing (`src/lib/security/safebrowsing.ts`)

One batched `threatMatches:find` call covering `https://{domain}/` plus every
extracted URL (not one call per URL). Checks `MALWARE`, `SOCIAL_ENGINEERING`,
`UNWANTED_SOFTWARE`, `POTENTIALLY_HARMFUL_APPLICATION`. Returns
`{ flagged: boolean, matches: string[] } | null` — `null` means the check
could not run (no key, network error, non-2xx response), never `false`.

### IP2Whois (`src/lib/security/whois.ts`)

One lookup on the sender domain only (not each extracted URL — WHOIS is a
per-lookup cost, and the sender's domain is the one that matters for "who is
behind this offer"). Returns creation date, expiration date, registrant
organization/name/country, and whatever source/`whois_server` field the API
gives — or `null` on any failure.

### Trust score (`src/lib/security/trust-score.ts`, pure function)

```
Start at 100, floor 0, cap 100:
  Safe Browsing flagged any checked URL              -70
  Domain age < 6 months                              -25
  Domain age 6-12 months                              -10
  Expires within 30 days                              -20
  Expires within 90 days                              -10
  Registrant org/name redacted or a privacy service    -10
```

**Honesty rule** (mirrors this app's core anti-fraud principle — never claim
verified data that isn't real): if both checks fail, the function returns
`score: null`, rendered as "Safety score unavailable" — never a numeric
default. If only one check succeeded, the score reflects only that check's
signals, and the UI states which check is missing. A `reasons: string[]`
array explains every deduction actually applied, for the "raw WHOIS source
details" the spec asked for.

### UI

New panel in `AnalyzerView` (and its `/preview/analyzer` twin, canned data):
score (or "unavailable"), company/org name, domain age, creation/expiration
dates, registrant country, and the raw WHOIS source. Rendered regardless of
whether the AI or heuristic engine priced the deal — this is independent of
that.

## 2. YouTube channel stats

New nullable columns on `media_kits` (migration `0014`):
`subscriber_count integer`, `channel_view_count bigint` (a large channel's
lifetime view count can exceed `integer` range). Non-null = verified by an
API sync, following the exact same pattern as `verified_top_countries` —
no new boolean column needed.

`src/lib/youtube/client.ts` calls `youtube/v3/channels` (`part=statistics`)
by handle. A "Sync from YouTube" button (youtube kits only, requires
`platform_handle`) calls a new server action that re-checks the kit belongs
to the caller, fetches, writes both columns plus `last_synced_at`.
`avg_views`/`avg_ccv` are untouched — they stay the creator's own
self-reported per-video/per-stream figures, a different kind of number from
a channel-level lifetime total.

## 3. OAuth placeholders

No new schema — X, TikTok and Meta aren't in the `Platform` enum, and Twitch
already has real self-reported-stats support unrelated to this. This is a
forward-looking placeholder for whichever of these eventually gets a
registered app + client secret.

A locked section reusing the exact `ComingSoonCard` pattern (visible,
`aria-disabled`, "Coming soon" pill), listing the four platforms. Stub
routes `src/app/api/oauth/[platform]/{start,callback}/route.ts` return a
plain "not configured" response (501) rather than attempting a real OAuth
redirect nobody can test end-to-end without credentials.

## 4. Admin subscription renewal/extension

Extends the existing "Save changes" form and `updateProfile()` action in
`admin/users/` — not a separate action, since it shares the same plan
`<select>` and the same guard against touching an unrelated edit.

### New form fields

`duration_preset`: **Monthly (30) / Quarterly (90) / Yearly (365) / Custom /
No change to expiry** (default: *No change*). `custom_days`: a number input,
read only when `duration_preset = custom`.

### Logic (replaces the flat "+30 days on any plan change" rule)

```
if submitted plan = Starter:
  if it changed from something else: clear plan + expiry (unchanged from today)
  duration selection is irrelevant/ignored

else (submitted plan is Pro/Elite):
  planChanged = current plan != submitted plan
  explicitDays = from duration_preset/custom_days, or null if "No change"
  durationDays = explicitDays ?? (planChanged ? 30 : null)
  #   ^ falls back to 30 only for an actual NEW paid-plan assignment with no
  #     duration chosen -- preserves today's exact behavior as a special
  #     case. If the plan isn't changing and no duration was explicitly
  #     picked, expiry is left alone -- editing region/role alone can never
  #     accidentally renew someone's subscription.

  if durationDays is not null:
    newExpiry = extend from the CURRENT expiry if it's still in the future,
                otherwise from now, by durationDays
                (a user with 10 days left who gets a 30-day renewal ends up
                with 40 days left, not 30 -- renewing should add paid time,
                not discard time already paid for)
    write subscription_expires_at = newExpiry
```

`extendExpiry(currentExpiresAt, days)` added to `src/lib/subscription.ts`
alongside the existing `daysFromNow`/`daysUntil`.

### Audit trail

New `AdminActionType` value `"renewal"` (migration `0014` also updates the
`admin_actions.action` CHECK constraint) — old/new value are the previous
and new `subscription_expires_at`, written whenever `durationDays` is not
null, independently of whether a `plan_change` row is also written for the
same submission (a pure renewal with no tier change writes only a `renewal`
row; a tier change with no explicit duration writes only `plan_change`; both
can fire together).

## Testing

- `trust-score.ts`: unit tests (`node:test`, same style as
  `rules.test.ts`/`platforms.test.ts`) covering each deduction independently,
  the floor/cap, and the both-checks-failed → `null` case.
- `extendExpiry()`: unit tests for "no current expiry", "current expiry in
  the past" (falls back to now), and "current expiry in the future" (adds to
  it).
- No new SQL test file: the CHECK constraint change and new nullable columns
  don't change any RLS policy, and `admin_actions`/`profiles` access control
  is already covered by the existing suites.
