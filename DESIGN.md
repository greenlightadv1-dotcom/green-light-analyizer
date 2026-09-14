---
name: Green Light
description: Your Personal Business Manager — an admin-gated sponsorship marketplace connecting Creators and Companies.
colors:
  brand-green: "#62e823"
  deep-navy: "#293e61"
  navy-dark: "#1f2e47"
  deep-obsidian: "#0a0d14"
  ink: "#231f20"
  white: "#ffffff"
  warning: "oklch(87.9% 0.169 91.605)"
  danger: "oklch(63.7% 0.237 25.331)"
  info: "oklch(74.6% 0.16 232.661)"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.625"
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
    letterSpacing: "0.05em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "12px"
  full: "9999px"
  glass: "20px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-ghost:
    backgroundColor: "{colors.deep-navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  input-field:
    backgroundColor: "{colors.deep-navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "44px"
  badge-pill:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  glass-panel:
    backgroundColor: "{colors.deep-navy}"
    rounded: "{rounded.glass}"
    padding: "24px"
---

# Design System: Green Light

## Overview

**Creative North Star: "The Liquid Glass"**

Green Light lives on a near-black obsidian shell with translucent, blurred panels floating above it, lit from within by a single electric-green signal and two slow-drifting ambient glow orbs (green and navy) that give the whole surface a sense of depth without ever calling attention to themselves directly. The system is disciplined rather than decorative: one accent color, one foreground color used only at different opacities, and one radius family that scales from tight badges up to soft 20px panels. Where the product's whole pitch is "nothing is verified unless it provably is," the interface echoes that restraint — quiet by default, and unmistakable the one time green appears to mean "go."

The palette and glass recipe are confirmed, exact brand constraints (CLAUDE.md §2.1–§2.2): do not approximate the five core hexes, and do not reintroduce the earlier placeholder teal-green (#10B981) anywhere. Both a dark theme (obsidian shell, the system default) and a light theme (an off-white mesh gradient in the same brand hues) are fully supported and mechanically linked through one CSS variable, `--color-fg`, rather than per-component light/dark pairs.

**Key Characteristics:**
- Near-black obsidian base in dark mode, an off-white brand-tinted mesh gradient in light mode — never a flat solid background in either theme.
- Exactly one accent color (electric green), used sparingly for CTAs, active states, success, and the one place the whole product's trust promise becomes visible: a "verified" badge.
- Translucent, blurred glass panels are how every surface separates from the shell — not a flat card-with-border convention.
- One foreground color (`ink`/`white`, theme-reactive as `fg`) carries the entire text hierarchy through opacity alone; there is no separate gray scale.
- Soft, rounded geometry throughout — nothing in the system has a sharp corner.
- Full RTL mirroring (Arabic) is a first-class layout requirement, not an afterthought bolted onto an LTR design.

## Colors

The palette is intentionally narrow: one electric accent, a structural navy/obsidian family for surfaces and depth, and one text color used at varying opacity. Three additional system colors (warning/danger/info) exist only for state — deal-risk, error, and status communication — and are drawn straight from Tailwind's stock palette rather than custom tokens.

### Primary
- **Electric Signal Green** (`#62e823`): the single accent. CTAs, primary buttons, active navigation state, focus rings, success states, and — most importantly — the "verified" and "green light" risk-rating badges the whole product's anti-fraud promise depends on. **The One Voice Rule.** Green appears on a small fraction of any given screen; its rarity is what makes it legible as a signal rather than decoration. It is never used for two different meanings on the same screen.

### Neutral
- **Deep Navy** (`#293e61`): the structural brand color — primary buttons in the original CLAUDE.md spec, glass-panel tint in dark mode, sidebar/topbar solid-glass backgrounds, dark-mode gradient midtone. Functions as a surface material, not a second accent competing with green.
- **Navy Dark** (`#1f2e47`): the deepest structural navy — code/alias chip backgrounds, the dark-mode gradient's darkest stop, hero/cover-style surfaces.
- **Deep Obsidian** (`#0a0d14`): the near-black base the entire dark-theme shell sits on, beneath the glass panels and glow orbs.
- **Ink** (`#231f20`): fixed-dark text that must stay dark regardless of theme — most visibly, text on the neon-green CTA fill (light text there would fail contrast in dark mode without this token).
- **White** (`#ffffff`): reserved for literal always-white surfaces — the logo asset, the landing page's white marketing cards. Never used as a stand-in for the theme-reactive foreground token below.
- **Foreground** (`fg`, theme-reactive: `#231f20` light / `#ffffff` dark): the single text/border/background color for the entire authenticated app shell. Every "muted," "secondary," or "tertiary" text/border treatment is this one color at reduced opacity (`/70`, `/45`, `/40`, `/35`, `/30`), never a separate gray. **The Single Ink Rule.** If a design needs a less prominent version of any text or hairline border, reach for a lower opacity of `fg` — never a new gray value.

### State colors (system palette, not custom tokens)
- **Warning** (Tailwind `amber-300`/`amber-700`, ≈`#fcd34d`/`#b45309`): risk rating "proceed with care," non-blocking cautions.
- **Danger** (Tailwind `red-400`/`red-500`/`red-700`, ≈`#f87171`/`#ef4444`/`#b91c1c`): risk rating "high risk," form/action errors, disputed deal status.
- **Info** (Tailwind `sky-400`/`sky-700`, ≈`#38bdf8`/`#0369a1`): the "negotiating" deal-status pill — the one place a fourth hue appears, deliberately calm rather than alarming.

Every state color follows the same construction as the brand tokens: a soft tinted background (`/10`–`/15` opacity), a matching border (`/25`–`/30` opacity), and a solid-opacity text color paired per-theme (a light-mode shade and a distinct dark-mode shade, e.g. `text-red-700 dark:text-red-200`) so contrast holds in both themes.

## Typography

**Display Font:** Inter (with a full native system-font fallback stack)
**Body Font:** Inter — the same family as Display; the system does not pair two typefaces
**Label/Mono Font:** the OS monospace stack (`ui-monospace`, SFMono-Regular, Menlo, Monaco, Consolas), used only for alias emails, shareable-link slugs, and other literal machine-readable strings

**Character:** One geometric grotesk sans carries the entire product — no custom or display typeface was commissioned. Hierarchy is built almost entirely from weight and opacity rather than dramatic size jumps; nothing on any authenticated screen is larger than a page's own H1.

### Hierarchy
- **Display** (600, 1.5rem/24px, 2rem line-height, −0.025em tracking): page-level H1s (`SectionHeader`) and the rare large numeric callout (a plan's headline price).
- **Title** (600, 0.875rem/14px, 1.25rem line-height): panel and card headings — deliberately close in size to body text rather than a large "headline" tier.
- **Body** (400, 0.875rem/14px, 1.625 line-height): all prose, descriptions, table/list content.
- **Label** (500, 0.75rem/12px, 1rem line-height, 0.05em tracking, uppercase): form field labels and small metadata (role/plan lines, stat captions) — always at `fg/70` or lower opacity, never full-strength ink.

### Named Rules
**The Quiet Hierarchy Rule.** Display is only 1.71× the size of Body. Hierarchy is carried by weight, letter-spacing, uppercase casing, and opacity — not by scale. A screen should never need a font size larger than Display to feel organized.

## Layout

The authenticated app shell is a fixed left sidebar (`w-60`, hidden below `lg`) plus a fluid content column, capped at `max-w-[1680px]` with responsive gap/padding steps (`lg:`/`2xl:`) rather than the narrower `max-w-7xl` (1280px) that read as a cramped column on large monitors. Content areas use `grid gap-4` with `lg:grid-cols-2` / `lg:grid-cols-3` responsive splits; panels that need more room take `lg:col-span-2`.

Spacing follows Tailwind's unmodified default 4px base scale; the values actually reused as a system rhythm are: `8px` (icon/label gaps), `12px` (form-field stacks), `16px` (standard grid/flex gaps), and `24px` (panel internal padding, `p-6`, the single most common container inset in the product).

RTL is a first-class layout requirement: shared chrome uses logical properties (`ps-*`/`pe-*`, `border-s-*`, `start-0`/`end-0`, `text-start`) exclusively, so flex/grid direction and text alignment mirror automatically under `dir="rtl"`. The one manual exception is a CSS transform (`hover:translate-x-0.5`, paired with an explicit `rtl:hover:-translate-x-0.5`), since transforms don't flow with `dir` the way logical properties do.

## Elevation & Depth

This system is not flat, and depth is not a shadow-only accent applied to otherwise plain cards — translucency and blur are the primary and structural mechanism by which a surface reads as "above" the shell. **The Structural Glass Rule.** Every panel in the product is one of two `glass-panel` utilities, never a hand-rolled `bg-white border` card: a semi-transparent, brand-tinted background (`rgba` navy in dark mode, `rgba` white in light mode) at `blur(16–20px)`, a hairline border, an outer drop shadow that lifts the panel off the shell, and an inset top highlight (`inset 0 1px 0 0 rgba(255,255,255,…)`) that reads as a lit top edge — the standard glassmorphism "catching the light" cue.

Behind every panel, large soft-edged radial-gradient "glow orbs" (green and navy, `blur-3xl`, slowly drifting via Framer Motion) sit fixed to the viewport, giving the ambient ~depth a flat blurred background alone could not. This is a second, larger-scale depth layer distinct from the panels themselves.

### Shadow Vocabulary
- **Panel lift** (`0 20–24px 40–48px -26/-28px rgba(41,62,97,0.35–0.4)` light / `rgba(0,0,0,0.55–0.6)` dark): the outer shadow every glass panel carries, separating it from the shell.
- **Panel inset highlight** (`inset 0 1px 0 0 rgba(255,255,255,0.06–0.7)`): the lit top edge, present on every glass panel in both themes at different intensities.
- **CTA glow** (`0 8px 30px -12px rgba(98,232,35,0.7)`): reserved for the primary green button only — the one shadow in the system tinted by the accent color rather than navy/black.
- **Focus glow** (`0 0 0 3px rgba(98,232,35,0.15)` + a `rgba(98,232,35,0.5)` border): the shared focus ring for every interactive control.

## Shapes

Corner geometry scales with a surface's role, and nothing in the system is sharp-cornered. Glass panels use a signature `20px` radius (their own dedicated, larger step — distinct from the general control scale). Buttons, inputs, and code/alias chips use `12px` (`rounded-xl`). Compact inline status badges use `6px` (`rounded-md`). Pills, avatars, and status dots are fully rounded (`9999px`). Borders throughout are hairline and low-opacity (`border-fg/10` at rest, brightening only on hover/focus) rather than solid dark strokes.

## Components

### Buttons
- **Shape:** `12px` radius, fixed `44px` height, `20px` horizontal padding, `14px` semibold label.
- **Primary:** brand-green fill, `ink` text (never white — contrast on the bright green fill requires the dark token), a green-tinted glow shadow, `brightness-110` on hover / `brightness-95` on active.
- **Ghost:** `fg/5` translucent fill, `fg/10` hairline border, backdrop-blur, `fg` text — the secondary action style used everywhere a primary button isn't.
- **Focus:** every button/interactive control shares one 2px green focus-visible outline, offset from the control.

### Badges (Status / Risk / Source)
- **Style:** fully rounded pills, `10px` horizontal / `2px` vertical padding, `12px` medium-weight text, always color + label together (color never carries meaning alone — a small filled dot precedes the label on risk badges specifically).
- **States:** deal status (new/negotiating/agreed/paid/disputed) and AI risk rating (green/yellow/red) each have their own fixed color mapping (see Colors → State colors); a "capped" risk rating additionally shows a small "· capped" suffix rather than silently downgrading, since that distinction is the product's anti-fraud promise made visible.

### Cards / Glass Panels
- **Corner Style:** `20px` radius via the dedicated `glass-panel` utility, never a plain `rounded-2xl` card.
- **Background:** translucent navy (dark) / translucent white (light), per the Elevation section.
- **Shadow Strategy:** see Elevation & Depth.
- **Internal Padding:** `24px` (`p-6`) is the standard; nothing pads a glass panel tighter than that.
- **Solid variant:** `glass-panel-solid` — a denser, less transparent version (less blur-through) reserved for the sidebar and the sticky top bar, so persistent chrome reads slightly more "present" than content panels.

### Inputs / Fields
- **Style:** `fg/5` translucent fill, `fg/10` hairline border, `44px` height, `12px` radius, uppercase `fg/70` label above.
- **Focus:** border shifts to `brand-green/50` with a soft `brand-green/15` ring — the same focus language as buttons.
- **Hint/Error:** hint text sits below at `fg/45`; validation errors render as a full-width `Alert` (see below), not inline red text under the field.

### Alerts
- **Error:** `red-400/30` border, `red-500/10` fill, `red-700` text (light) / `red-200` (dark).
- **Info/success:** `brand-green/25` border, `brand-green/10` fill, `brand-green` text in both themes.
- Both share one shape: `12px` radius, `14px` horizontal / `10px` vertical padding, `14px` text, no icon — color and copy carry the meaning.

### Navigation (Sidebar)
- **Style:** vertical list, `2px` start-edge (logical, mirrors under RTL) accent border.
- **Active:** green start-border, `brand-green/12` fill, `brand-green` medium-weight text.
- **Inactive / Hover:** transparent border, `fg/60` text, `fg/5` hover fill, a small `0.5` logical-x hover nudge toward the reading direction.

### Code / Alias Chips (signature component)
A recurring, deliberately theme-fixed pattern: the inbound email alias, shareable profile slug, and other literal copyable strings render in monospace, brand-green text, on a `navy-dark/70` background — one of a small, explicit set of surfaces (CLAUDE.md §14) that stay dark-on-dark regardless of the active theme, alongside the violation-log excerpt and the deal room's "via Green Light" system message. This is a deliberate exception, not a pattern to extend casually.

## Do's and Don'ts

### Do:
- **Do** treat green as a single, rare signal — CTAs, active nav, success, "verified." Never introduce it as a second background/fill color for large surfaces.
- **Do** reach for a lower opacity of `fg` for any less-prominent text or border. Never introduce a new gray value.
- **Do** build every panel from `glass-panel` / `glass-panel-solid`. Never hand-roll a flat `bg-white`/`bg-navy` card with a plain border as a substitute.
- **Do** use logical Tailwind utilities (`ps-*`/`pe-*`, `border-s-*`, `start-0`/`end-0`, `text-start`) for anything in shared chrome or any surface that must mirror under `dir="rtl"`.
- **Do** pair every status/risk color with a text label (and, for risk badges, the small dot) — color alone never carries meaning.

### Don't:
- **Don't** approximate the five confirmed hexes, and never reintroduce the retired placeholder teal-green (`#10B981`).
- **Don't** give Deep Navy a second-accent role competing with green — it is a structural/surface color only.
- **Don't** apply a plain `box-shadow` card as a substitute for the glass recipe; depth here is translucency + blur first, shadow second.
- **Don't** use physical positioning/alignment utilities (`text-left`, `pl-*`/`pr-*`, `right-0`/`left-0`) in shared chrome or any RTL-facing surface.
- **Don't** extend the fixed dark "code chip" treatment beyond its confirmed list (alias/slug chips, violation-log excerpt, the system chat bubble) — every other surface stays theme-reactive.
