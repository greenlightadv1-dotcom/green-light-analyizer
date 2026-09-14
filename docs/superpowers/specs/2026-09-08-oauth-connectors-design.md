# Media Kit OAuth connectors — design

## Scope, per the conversation

- Real OAuth 2.0 connectors for **YouTube Analytics** and **Instagram Graph
  API** (the two platforms CLAUDE.md §7.3 actually documents as having a
  real verified-audience-geography API) — built now as working
  infrastructure, activated the moment real credentials land in
  `.env.local`. Nothing about this can be verified live from this sandbox
  (no egress, no credentials yet) — verification happens on the user's
  machine once the apps are registered.
- **TikTok, X, Twitch**: no change beyond what already shipped last turn —
  manual self-reported input stays, alongside the existing "Coming soon"
  OAuth placeholder card. Not in scope for real OAuth this round.
- Manual input is **never removed**. Once a platform is OAuth-linked, its
  manual form is hidden and replaced with the verified/synced view — but
  only for that specific platform on that specific creator. Starter tier
  and every platform without a real API keep manual entry as their only
  option, per §7.2/§8.

## Token storage

New table `oauth_connections` (migration `0015`), **not** columns on
`media_kits` — same reasoning as `promo_codes`: an access/refresh token is
a bearer credential, more sensitive than anything already living in a
partially-`authenticated`-readable table. RLS enabled, **no policy for
`authenticated` at all** — every read and write goes through
`createAdminClient()`.

```sql
oauth_connections (
  id uuid primary key,
  creator_id uuid references profiles(id) on delete cascade,
  platform text check (platform in ('youtube','instagram')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  external_account_id text,   -- resolved channel ID / IG business account ID
  scope text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (creator_id, platform)
)
```

No application-layer encryption on top of Postgres's own at-rest
encryption — consistent with how every other secret in this schema
(service-role-only columns, `promo_codes`) is protected by RLS + column
grants rather than a second encryption layer, and adding one here would
need its own key-management story this MVP doesn't otherwise have. Flagging
this explicitly as a judgment call, not a silent default: a compromised
`SUPABASE_SERVICE_ROLE_KEY` already exposes everything in this database
today, tokens included either way.

## OAuth flow

New env vars: `NEXT_PUBLIC_APP_URL` (base URL for constructing
`redirect_uri` — doesn't exist yet, needed here for the first time),
`GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`,
`META_APP_ID`/`META_APP_SECRET`.

Extends the existing `/api/oauth/[platform]/{start,callback}` routes
(built last turn as 501 placeholders for x/tiktok/meta/twitch) to handle
real logic for `youtube` and `instagram` specifically — same routing
surface, not a parallel one. `x`/`tiktok`/`twitch` keep returning 501.

- **`start`**: `requireProfile()`, generate a signed CSRF `state` (creator
  ID + random nonce), redirect to the provider's real authorization URL
  with the right scope (`https://www.googleapis.com/auth/yt-analytics.readonly`
  for YouTube; `instagram_basic,instagram_manage_insights,pages_show_list`
  for Instagram, since discovering the linked IG Business Account goes
  through the Facebook Pages API).
- **`callback`**: verify `state`, exchange the authorization `code` for
  tokens at the provider's token endpoint, resolve the external account ID
  (YouTube: `channels.list?mine=true`; Instagram: `/me/accounts` →
  `instagram_business_account`), upsert into `oauth_connections`, then set
  `media_kits.analytics_oauth_connected = true` for that creator/platform
  (creating the kit row if none exists yet) and redirect back to
  `/media-kit`.

## Fetching verified data

A `getValidAccessToken(creatorId, platform)` helper: reads the stored
token, and if `expires_at` has passed, refreshes it via the stored
`refresh_token` before returning — checked on demand, not a cron job, the
same pattern already used for subscription expiry. Called from a "Sync
verified geography" action that calls the platform's real insights
endpoint (YouTube Analytics `reports.query` with `dimensions=country`;
Instagram `/{ig-user-id}/insights?metric=audience_country`), writes the
result into `media_kits.verified_top_countries` +
`audience_verified = true` via the service-role client (these columns are
already withheld from `authenticated`'s grant, so no new migration needed
for that part).

## Disconnect

`disconnectAnalytics` (already exists) additionally deletes the
`oauth_connections` row for that creator/platform, on top of what it
already clears on `media_kits`.

## UI

`PlatformCard` (the manual form) takes a new `hidden` flag: true when
`analytics_oauth_connected` is true for a platform that has a real OAuth
path (`youtube`/`instagram`). Hidden means the card isn't rendered at all
for that platform — replaced by a "Connected via {source}" summary reusing
the connected-state branch already in `VerificationPanel`. Every other
platform, and every platform for a creator on Starter, renders the manual
form exactly as today.

`connectAnalytics`'s current "throw a clear not-configured error" behavior
is replaced, for `youtube`/`instagram` specifically, with a real redirect
to `/api/oauth/{platform}/start` — gated the same way it already is today
(plan tier via `verificationAvailability`).

## Testing

New `supabase/tests/oauth_connections_test.sql`: no role — admin included
— can read or write `oauth_connections` directly, same pattern as
`admin_actions_test.sql`/`promo_codes_test.sql`.

## What this cannot guarantee

Every piece of this — the authorization URL construction, the token
exchange request/response shape, the Analytics/Insights API response
parsing — is written from each platform's published API reference, not
verified against a live call. Both OAuth apps (Google Cloud project with
`yt-analytics.readonly` verified, Meta app through App Review for
`instagram_manage_insights`) still need to be registered and approved
before any of this can run end to end — that review process, not this
code, is the real bottleneck CLAUDE.md §7.3 already named.
