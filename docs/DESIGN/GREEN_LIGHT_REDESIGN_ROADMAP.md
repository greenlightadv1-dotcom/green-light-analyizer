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
| 7 | G: visual identity, and deterministic proposals when NVIDIA is unavailable | In progress |
| 8 | Responsive and accessibility sweep (overflow check on every preview route, keyboard focus, RTL) | In progress |

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
