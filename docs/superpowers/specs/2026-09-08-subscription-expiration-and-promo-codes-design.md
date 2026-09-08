# Subscription expiration + promo/trial codes — design

## Problem

`admin/users/actions.ts` can set a `subscription_plan` (added in the account
management feature) but a paid plan never ends — there is no `expires_at`, no
automatic fallback to Starter, and no self-service way for a creator to
activate a trial without an admin editing their row by hand. This adds both:
a 30-day expiry on every admin-applied paid plan, and a promo/trial code
system a creator can redeem themselves.

## Scope

- `profiles.subscription_expires_at` — when the current paid plan ends.
- Expiration enforcement: checked and applied on every authenticated request.
- `promo_codes` table + admin UI to generate single-use codes.
- A redemption field in Settings → Plan & billing.
- An expiry warning banner shown app-wide in the 0–3 day window before a plan
  lapses.

Out of scope: extending/stacking an existing active plan when a second code
is redeemed (redemption always resets the clock to `now() + duration_days`,
documented below); payment processing of any kind (§4.3 — still Discord).

## Data model

New migration `supabase/migrations/0013_subscription_expiration_and_promo_codes.sql`:

```sql
ALTER TABLE public.profiles
  ADD COLUMN subscription_expires_at TIMESTAMP WITH TIME ZONE;
-- NULL = no expiry (Starter, or a paid plan set with no end date). Covered by
-- the same column-privilege split as subscription_plan already: not grantable
-- to `authenticated`, only ever written by the service-role client.

CREATE TABLE public.promo_codes (
  code TEXT PRIMARY KEY,
  duration_days INT NOT NULL CHECK (duration_days > 0),
  target_plan TEXT NOT NULL CHECK (target_plan IN ('Pro', 'Elite')),
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policy for `authenticated`, not even an admin SELECT. A
-- code is a bearer credential; both admin's "list codes" view and redemption
-- go through createAdminClient() in server actions, so there is no scenario
-- where a browser needs to query this table directly. Stricter than
-- admin_actions on purpose.
```

`code` is the primary key rather than a separate `id` — it's already unique
by construction (system-generated) and every lookup is by code, so a
surrogate key would only add an unused column.

## Expiration enforcement

In `requireProfile()` (`src/lib/auth.ts`), immediately after the profile is
fetched: if `subscription_plan !== 'Starter'` and `subscription_expires_at`
is in the past, write the row back to
`{ subscription_plan: 'Starter', subscription_expires_at: null }` via
`createAdminClient()` (the caller's own client cannot write these columns),
then use the corrected values for the rest of the call and its return value.

This is the only enforcement point. Every existing plan-gated check
(`MAX_CONNECTIONS`, `canVerifyAudience` in `src/lib/media-kit/platforms.ts`,
the connection-limit checks in `media-kit/actions.ts`) needs zero changes —
they all read `profile.subscription_plan` from whatever `requireProfile()` /
`requireRole()` handed them, which is now always current. No cron job, no
background worker, no separate "effective plan" computation duplicated at
each call site.

## Admin: setting expiry on a manual plan change

`updateProfile()` (`admin/users/actions.ts`) gets one addition to its
existing plan-change branch: when `subscription_plan` changes to Pro or
Elite, also set `subscription_expires_at = now() + 30 days`; when it changes
to Starter, clear `subscription_expires_at` to `NULL`. Recorded in the
existing `admin_actions` `plan_change` row — no new action type, since expiry
here is a deterministic function of the plan choice, not an independent
decision.

## Admin: generating promo codes

New page `/admin/promo-codes`, its own Sidebar entry (alongside Violations
and System — matches how those are already separate from Accounts rather
than folded into that page).

Form: duration (3 / 14 / 30 days), target plan (Pro / Elite), code-expiry
date. On submit, a new server action generates a random code — reusing the
no-look-alike alphabet already in `src/lib/alias.ts` — formatted like
`XXXX-XXXX`, retries on the rare unique-constraint collision, inserts the
row via `createAdminClient()`. The generated code is shown once, prominently
(same "shown once, copy it now" treatment as a new account's temporary
password), with a table of existing codes (used/unused, expiry) below it.

## User: redeeming a code

Added to the existing "Plan & billing" panel in `SettingsView.tsx` — a text
input + submit, additive to the existing Discord-billing copy (that stays;
this doesn't replace the manual path, since a code won't cover everything
Discord does).

Server action: `requireProfile()` for the caller, then one atomic
conditional update via `createAdminClient()`:

```sql
UPDATE public.promo_codes
SET is_used = true, used_by = $1, used_at = now()
WHERE code = $2 AND is_used = false AND expires_at > now()
RETURNING duration_days, target_plan;
```

Zero rows back means invalid, already-used, or expired — one generic error
message either way, so a guess gives no signal about which. One row back
means success: immediately update the caller's own profile with
`subscription_plan = target_plan` and
`subscription_expires_at = now() + duration_days`. Redeeming while already on
an active paid plan resets the clock to `now() + duration_days` rather than
stacking on top of remaining time — simplest behavior, and not something the
request asked for.

Claiming the code (the conditional `UPDATE`) happens before applying it to
the profile. That ordering is what makes two users racing the same code
safe: whichever request's `UPDATE` lands first wins the row; the second gets
zero rows back and never touches its own profile.

## Expiry warning banner

Rendered in `src/app/(app)/layout.tsx`, immediately after `<TopBar>` — that
layout already runs on every authenticated route and already has `profile`
from `requireProfile()`, so this is visible app-wide, not just on
`/dashboard`.

A new `ExpiryWarningBanner` component: if `subscription_expires_at` is set
and 0–3 days remain, an amber banner reading "Your {plan} plan expires in
{N} day(s) — renew via Discord or redeem a promo code before it falls back
to Starter," linking to `/settings`. No dismiss/localStorage state — not
requested, and adding it would mean client-side JS for a component that
would otherwise stay a plain server component. It naturally disappears once
`requireProfile()`'s enforcement check fires and resets the account.

## Testing

New `supabase/tests/promo_codes_test.sql`, same `BEGIN…ROLLBACK` +
`SET LOCAL ROLE` style as the existing suites: no role — including admin —
can `SELECT` or `INSERT` on `promo_codes` directly, proving the table is
truly unreachable except through the service-role path. The atomic
conditional-update redemption query is exercised directly as service-role
SQL in the same test (RLS does not apply there — this proves the query
shape, e.g. that a second attempt against an already-claimed code returns
zero rows, not that RLS blocks it).

Existing suites are unaffected — no changes to any policy they cover.
