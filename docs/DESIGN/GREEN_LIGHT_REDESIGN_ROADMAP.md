# Redesign roadmap and progress

Each group is merged into the branch only after these pass: typecheck, lint, unit tests, a build, and rendered screenshots in en and ar, light and dark, at 1440 and 390 px. Routes, data contracts, permissions, schema and business rules are never changed.

| # | Group | Status |
|---|---|---|
| 1 | Tokens, fonts, surfaces, shared components, app shell, state-colour codemod | Done |
| 2 | Landing and auth (split-screen brand panel) | Done |
| 3 | Creator surfaces (dashboard KPI, inbox, media kit, analyzer, content, portfolio) | Re-themed through the tokens. Per-page polish is ongoing |
| 4 | Company surfaces (discover, briefs, shortlists, team) | Re-themed through the tokens. Per-page polish is ongoing |
| 5 | Deal room, chat, shared panels | Re-themed through the tokens |
| 6 | Admin | Re-themed through the tokens |
| 7 | G: forest/lime identity (launcher, header, bubbles, suggestion cards, proposal cards, composer), and deterministic proposals in 5 languages when NVIDIA is unavailable (`lib/g/fallback.ts`) | Done. End-to-end checks on the isolated stack are still to run |
| 8 | Responsive and accessibility sweep | Overflow is 0 on all 18 preview routes at 390 px (ar) and 1440 px (en, dark). The keyboard and contrast audit is ongoing |

"Re-themed through the tokens" means the page adopts the new palette, type, radii and surfaces with no per-file rewrite. The codemods made those changes:
- state colours → semantic tokens;
- `text-brand-green` → `accent`;
- `bg-white`/`dark:bg-navy-dark` pairs → `surface`;
- uppercase labels → sentence case.

Bespoke layouts are redesigned page by page.

## Decisions taken

- **Lime stays `#62E823`.** It is the logo's own green, and a second lime would clash with the mark.
- **The `navy` utilities are now forest aliases**, rather than renaming about 50 call sites at once.
- **`glass-panel` keeps its name but becomes a solid card**, so no component API changes.
- **No backend, schema or data change** was needed for any of the above.

## Usability pass (2026-11-19, after `d3f2f99`)

**Done and checked on rendered pages.** The pages were run as the isolated-stack production build, signed in as creator, company and admin.
- **Navigation:**
  - one flat list per role under section headings (overview, deals/campaigns/marketplace, profile & content, administration, account). There are no nested menus, and role visibility is unchanged.
  - on phones, a bottom tab bar with three main pages, Ask G and More. More opens the same list as the sidebar.
- **Dashboards:**
  - quick-action cards for each role;
  - the lime key-figure card;
  - two-line recent-deal rows;
  - admins get an admin overview instead of the creator dashboard.
- **Deal inbox and deal room on phones:**
  - two-line rows instead of the cramped single line;
  - the deal summary comes before the chat;
  - the chat area is 70dvh tall.
- **G:**
  - no floating button below lg; it opens from the tab bar;
  - the wake indicator sits above the bar;
  - creator and company workflows pass end to end with the AI unreachable (9/9).
  - voice passes 18/18 and wake 31/31.
- **Discover on phones:** the secondary filters fold behind "More filters".
- **Accessibility:**
  - axe reports 0 WCAG 2.0/2.1 A/AA violations on 33 signed-in and 6 public pages;
  - there is now a skip link and a `<main>` landmark;
  - every focus stop shows a visible focus style;
  - the accent token is `#276F0A` and success `#19692F` (AA on their tints).
- **Responsive:** 0 horizontal overflow at 390, 768, 1024 and 1440 px on every role page checked.

**Not done:**
- **Landing creator video cards.** There is no approved creator content in the repository, and the reference image could not be inspected, so nothing was built rather than inventing creators, clips or results.
- **Per-page polish** of the long Media Kit form and the admin tables. Both are functional, but long.
- **The Vercel Preview itself** could not be opened from this sandbox (the egress proxy refuses the host); the identical commit was inspected locally.
- **Real-microphone voice testing** and testing in Safari or Firefox.
