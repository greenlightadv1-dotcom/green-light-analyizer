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

Migrations `0001` and `0002` are **applied**. `0003` is not — see below.

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
supabase/migrations/  schema (§10) + the outstanding RLS work
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

## Not done yet

- **RLS policies** — `supabase/migrations/0003_rls_policies.sql` is a stub, and
  the live database is in the unsafe state it describes. Supabase's own linter
  reports it:

  | Lint | Level | Tables |
  |---|---|---|
  | `rls_disabled_in_public` | ERROR | `media_kits`, `messages` |
  | `rls_enabled_no_policy` | INFO | `profiles`, `deal_chats` |

  `media_kits` and `messages` are readable and writable by anyone holding the
  anon key. The tables are empty and nothing is deployed, so nothing is exposed
  today — that stops being true the moment real data lands. §12 makes RLS on
  every user/deal table a hard requirement. **Not shippable until this is
  written**; the full checklist is in the TODO block in `0001_init.sql`.
- Email intake pipeline (§5), Deal Chat Rooms (§6), Manual Analyzer (§5.1),
  media kit / platform connections (§7). Routes and placeholders exist; the
  logic does not.
- Gemini evaluation function (§5.4, §7.4).
