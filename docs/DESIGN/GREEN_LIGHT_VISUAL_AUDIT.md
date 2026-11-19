# Visual audit before the 2026-11 redesign

The baseline is commit `13f1775` on `claude/eager-gauss-dox9tq`. CI was green on push and PR, and the Vercel Preview was Ready.

## Architecture found

**Theming:**
- Tailwind v4 tokens live in `src/app/globals.css` (`@theme`).
- Dark mode is class-based (`next-themes`).
- A single theme-reactive `--color-fg` drives most text, borders and fills (`text-fg/60`, `border-fg/10`, …).

**Surfaces:** the "Liquid Glass" recipe:
- `glass-panel` with a 16 px backdrop blur and a navy tint;
- a mesh-gradient body;
- animated `GlowOrbs` mounted at the root.

**Components:** shared UI sits in `src/components/ui` (Button, Field, Alert, StatusBadge, Tabs, Table, Dialog, EmptyState, Metric, Skeleton). The status vocabulary is in `src/lib/ui/status.ts`.

**Type:** Inter, with no Arabic face; Arabic fell back to the system font.

## Problems

1. **The palette did not match the target.** It was navy and obsidian with neon glows. The brief asks for a warm off-white canvas, lime, deep forest and near-black.
2. **Glassmorphism everywhere.** It meant blur cost on mobile, washed-out cards in light mode, and the "generic AI dashboard" look the brief rules out.
3. **About 160 hard-coded state colours:**
   - `red-*`, `amber-*`, `sky-*`, `orange-*`, `emerald-*`, mostly paired with `dark:` overrides;
   - 15 `bg-slate-900` option elements.
4. **Lime used as text** (75 × `text-brand-green`). On a light surface it is about 1.6:1, which fails WCAG.
5. **Uppercase tracking-wide micro-labels.** They read as dashboard boilerplate and hurt Arabic.
6. **Small headings.** Page titles were `text-2xl` semibold and card titles `text-sm`. There was no confident hierarchy.
7. **Two button systems.** `Button` and the landing `CtaLink` had divergent recipes, with `rounded-xl` and a glow shadow.
8. **No Arabic typeface.**

## Pages in scope

Sixteen route families, 2–6 screens each, about 60 screens in all:
- public: landing, get-started, apply, activate, legal, `/p/<slug>`;
- auth: login, forgot/reset/set-password;
- creator: dashboard, onboarding, inbox and deal room, analyzer, media kit, portfolio, content, opportunities, collaborations, pricing, support, settings, verification, notifications;
- company: dashboard, discover, briefs, shortlists, team, collaborations;
- admin: users, requests, verification, taxonomy, violations, relays, news, system, promo codes;
- G: launcher, panel, cards, proposals, voice and wake-word states.

## G status at baseline

**Built:**
- the panel;
- text chat over NVIDIA, with grounding;
- rule cards when NVIDIA is down;
- proposals (`content_draft`, `invitation`, `message_draft`) shown as forms behind confirmation;
- voice through Web Speech;
- opt-in "Hey G".

**Gaps:**
- proposals exist only when NVIDIA answers;
- there is no deterministic proposal fallback;
- the visuals are Liquid Glass.
