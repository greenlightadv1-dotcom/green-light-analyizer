# Green Light design system (2026-11 identity)

**Status:** on branch `claude/eager-gauss-dox9tq`. It is not deployed. It supersedes the "Liquid Glass" language (CLAUDE.md §2.2).

**Direction:** a premium fintech feel:
- a warm off-white canvas;
- white rounded cards;
- near-black type;
- the brand lime for the primary action;
- deep forest green for strong secondary surfaces.

Glassmorphism, blur, glow orbs and mesh gradients are gone.

**Where it lives:**
- every value is a token in `src/app/globals.css`;
- the shared components are in `src/components/ui/`.

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#F4F3EE` | `#0B110E` | page background (`body`) |
| `surface` | `#FFFFFF` | `#121A16` | cards, menus, dialogs, inputs |
| `surface-soft` | `#EFEEE7` | `#18221D` | quiet panels |
| `fg` | `#0E1210` | `#F1F4F2` | text; `fg/NN` opacity utilities derive from it |
| `fg-secondary` / `fg-muted` / `fg-subtle` | `#2F3833` / `#59645E` / `#8A948E` | lighter equivalents | text hierarchy. `fg-muted` is the lowest level for body copy; `fg-subtle` is decoration only |
| `line` / `line-strong` | `#E4E2D9` / `#D2CFC3` | 9% / 16% white | hairlines, input borders |
| `brand-green` | `#62E823` | same | primary buttons, highlights, the lime card, focus ring. **Never text on a light surface** (1.6:1) |
| `accent` | `#276F0A` | `#62E823` | green **text and icons**. This replaced every `text-brand-green` on a theme-reactive surface |
| `lime-soft` | `#E9FBDC` | lime at 12% | tints |
| `forest` / `forest-strong` / `forest-soft` | `#0F3B2C` / `#0A2A1F` / `#DCE9E2` | `forest-soft` → `#16302A` | secondary buttons, the active nav pill, dark feature cards, code wells |
| `navy`, `navy-dark` | aliases of forest | — | legacy names, kept so older markup adopts the new palette |
| `ink` | `#0E1210` | same | text on lime, in both themes |
| `success` / `warning` / `danger` / `info` | `#19692F` / `#8A5300` / `#B42318` / forest | light tints | status. Raw Tailwind `red-/amber-/sky-/emerald-` utilities were codemodded onto these |

The logo hexes (`#62E823`, and the navy inside the icon files) are unchanged. The icon is never recoloured (§2.3).

## Type

- **Families:** Manrope for Latin and IBM Plex Sans Arabic for Arabic. Both are free and self-hosted through `next/font` (`src/app/layout.tsx`); `--font-sans` lists Manrope first.
- **Headings:** bold, with tight tracking (−0.02em) in Latin only. RTL resets the tracking, because negative tracking breaks Arabic joining.
- **Sizes:**
  - page title (`SectionHeader`): 30–36 px bold;
  - card title: 16 px semibold;
  - body: 14–15 px;
  - landing hero: up to 72 px.
- **Labels:** sentence case, `text-sm font-medium text-fg-muted`. The old uppercase tracking-wide micro-labels were removed.

## Shape, depth, motion

- **Radii:**
  - cards `24px` (`rounded-card`; `glass-panel` is now this surface);
  - controls `14px` (`rounded-control`);
  - buttons, nav items, chips and icon buttons: fully round (`rounded-full`).
- **Shadow:** `shadow-card` is a 1 px contact shadow plus a soft 32 px drop; `shadow-overlay` is for dialogs and menus. No coloured glows.
- **Motion:** short fades and slides (Framer Motion route transitions, `g-*` keyframes). `prefers-reduced-motion` flattens all of it.

## Surfaces

- `glass-panel` / `GlassPanel`: the white card (historical name).
- `surface-lime`: the single highlight per screen, e.g. the dashboard's open-deals figure or the landing's middle value card. Text on it is `ink`.
- `surface-forest`: dark feature panels, such as the landing's "How a deal moves" and the auth brand panel. Text on it is white, with lime accents.
- `bg-forest-strong` + `text-brand-green` + mono: fixed dark "code wells" (alias, share link).

## Components

| Component | Recipe |
|---|---|
| `Button` / `CtaLink` | Pill, 44 px tall. Variants: `primary` (lime/ink), `secondary` (forest/white; lime in dark), `outline`, `ghost`, `danger`. Both import `BUTTON_BASE`/`BUTTON_VARIANTS` from `ui/Button.tsx` |
| `Field` and inputs | White surface, `line-strong` border, 14 px radius. On focus: a forest border and a lime 3 px ring. Labels are sentence case |
| `Alert` | `danger` or forest-soft tint, 14 px radius |
| `StatusBadge` | Pill with `TONE_CLASSES` (semantic tokens only) |
| `Tabs`, `Table`, `Dialog`, `EmptyState`, `CopyButton` | Token-based; dialogs are `surface` on a flat 45% ink backdrop (no blur) |
| Navigation | Sidebar card, 256 px. Each item is a pill; the active one is forest with white text (lime with ink in dark). The top bar is a pill-shaped card |

## Accessibility rules

- **Contrast:** body text meets AA on `surface` and `canvas` in both themes. Lime is never used as text on a light surface.
- **Focus:** every interactive element shows a visible lime focus outline (`focus-ring`) or ring.
- **RTL:** logical properties (`ps/pe/start/end`) only.
