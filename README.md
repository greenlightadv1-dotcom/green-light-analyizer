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
    (app)/            authenticated shell: dashboard, inbox, analyzer,
                      media kit, settings, admin accounts
    auth/signout/
  components/
    brand/            Logo + LogoMark, per the usage rules in §2.3
    ui/               GlassPanel, GlowOrbs, PageTransition, form primitives
    dashboard/        shell and page building blocks
  lib/
    supabase/         browser / server / service-role clients + session guards
    mask.ts           contact-info stripping (§6.1) — server-side, pre-persist
    alias.ts          inbound alias generation (§5.1)
    auth.ts           requireProfile / requireRole
  proxy.ts            route guards (Next 16's replacement for middleware.ts)
supabase/migrations/  schema (§10), forced-reset column, RLS policies
supabase/tests/       RLS regression test
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

## Not done yet

- Email intake pipeline (§5), Deal Chat Rooms (§6), Manual Analyzer (§5.1),
  media kit / platform connections (§7). Routes and placeholders exist; the
  logic does not.
- Gemini evaluation function (§5.4, §7.4).
- **Company-side access.** The `company` role has no policy on any table, so a
  signed-in company account currently reads nothing and its inbox is empty.
  That is the safe direction to be wrong in, but it needs designing. Do not fix
  it by adding `company_id = auth.uid()` to `profiles_select`: one such policy
  hands companies whole creator rows including `primary_email` and
  `inbound_alias`. The shape that works is a column-limited creator directory
  view with `security_invoker = on`.
