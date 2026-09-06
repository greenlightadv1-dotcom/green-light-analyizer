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

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in the Supabase values
```

Apply the migrations in `supabase/migrations/` in order, then create the first
admin — Green Light has no public sign-up, so this is the only way in:

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

## Design system (§2)

Tailwind v4 is CSS-configured, so the token block in `src/app/globals.css`
replaces the `tailwind.config.js` sketch in the spec while producing the same
utility names: `navy`, `navy-dark`, `brand-green`, `ink`, plus `obsidian` for
the app shell background. `glass-panel` / `glass-panel-solid` are custom
utilities carrying the Liquid Glass recipe verbatim.

## Not done yet

- **RLS policies** (`supabase/migrations/0003_rls_policies.sql` is a stub).
  `media_kits` and `messages` currently have no row-level security at all.
  Not shippable until this is written — see the TODO block in `0001_init.sql`.
- Email intake pipeline (§5), Deal Chat Rooms (§6), Manual Analyzer (§5.1),
  media kit / platform connections (§7). Routes and placeholders exist; the
  logic does not.
- Gemini evaluation function (§5.4, §7.4).
