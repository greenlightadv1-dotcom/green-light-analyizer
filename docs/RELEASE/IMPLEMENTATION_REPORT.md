# Implementation report (2 November 2026)

Branch `claude/eager-gauss-dox9tq`. Work done in this pass, with evidence. See
`MASTER_IMPLEMENTATION_AUDIT.md` for the status of every feature.

## Commits

| Commit | Content |
|---|---|
| `e50f503` | Audit fixes M1, M2, M6, M8 |
| `ecda076` | Migration 0025, growth history, print-to-PDF, local migration harness |
| (docs) | `docs/RELEASE/*` |

Earlier on this branch and not yet in `main`: `9a627c3`, `856fa16`, `4b7f333`, `a056163` (UX-0) and `52eaade` (Phase 1).

## Findings addressed

| Finding | Previous state | New state | Files | Tests |
|---|---|---|---|---|
| M1 dialog desync | Chromium can force-close a modal after repeated Escape; React state stayed open and a failure was invisible | `Dialog` handles the native `close` event; the confirm form and status control show the error inline when the dialog is gone | `components/ui/Dialog.tsx`, `ConfirmActionForm.tsx`, `inbox/[chatId]/StatusControl.tsx` | Typecheck and lint; browser suite (dialog open, Escape and focus return) |
| M2 hydration on violations | `toLocaleString` in a client view | Fixed-format UTC stamp | `lib/ui/format.ts`, `ViolationsView.tsx` | `ui.test.ts` |
| M6 English action errors | 16 server-action messages in English for every language | Dictionary keys (`actionErrors.*`) in 5 languages; render sites translate | media-kit, settings, chat, analyzer actions; 11 components | `phase1-guards.test.ts` (every returned key exists) |
| M8 contrast | 235 uses of `text-fg/30–55` (2.78:1) | `text-fg-muted` (4.89:1) | 54 files | Guard test bans the old classes |

Not addressed, with reasons:
- **M3, M4:** need the audit migration (an owner decision).
- **M5:** the admin users, requests and promo-code page text is still English.
- **M7:** runtime role redirects need real sessions in Production.
- **M9:** admin and company screens have no preview route, so no browser coverage.

## Feature: growth history (migration 0025)

**Previous state:** no history, so growth could not be computed honestly.

**New state:**
- One snapshot per media kit per UTC day, written by the server after a successful YouTube stats sync.
- Growth is shown only from two real snapshots on different days.
- Snapshots are pruned at 29 days, on each sync and by the daily job.

**Database impact:**
- One new table with an RLS read policy for the owner or an admin.
- Only the server can write; `anon` has no access.
- Not applied to any remote database.

**API impact:** the YouTube sync also upserts and prunes snapshots. The cron job response gains `snapshots_deleted`.

**Permissions:** no existing grant or policy changed.

**Tests:**
- `growth.test.ts` (6) and `snapshot-guards.test.ts` (4).
- `supabase/tests/media_kit_snapshots_test.sql`: 10 assertions — creator, company, admin and anon access; writes refused; uniqueness; source check; cascade.
- Local migration harness: 38/38.
- Browser: growth summary in English and Arabic at 1440 and 390px, computed from preview snapshots.

**Limitations:**
- History is at most 29 days (YouTube policy).
- Instagram snapshots aren't written, because the integration is disabled.
- Pruning creators who never re-sync needs `CRON_SECRET`.

## Feature: Media Kit PDF v1

**New state:** a "Print or save as PDF" button on the public profile `/p/<slug>`, using the browser print dialog. A print stylesheet removes the glass effects and backgrounds. No server PDF service.

**Tests:** print-media emulation in the browser suite (white page, no blur). The public profile needs a database, so the button itself isn't browser-tested.

**Copy rule:** the pricing-copy test still bans "PDF" everywhere except the new `printing.*` strings, so the retired "Media Kit PDF export" plan claim can't return.

## Verification (local)

| Check | Result |
|---|---|
| `npm test` | 598/598, 16/16, 33/33 |
| `tsc --noEmit` | Clean |
| `eslint` | Clean |
| Preview build | Succeeds |
| `phase1-ui-e2e` | 206/206 |
| `mobile-nav-e2e` | 18/18 |
| `g-voice-e2e` | 18/18 (simulated recogniser) |
| `g-wake-e2e` | 31/31 (simulated recogniser) |
| `scripts/local-migrations-test.sh` | 38/38 |

Not done:
- real microphone testing;
- real-database role journeys;
- Safari, Firefox and Edge;
- the NVIDIA Arabic benchmark;
- live platform API calls.

## Feature: collaboration lifecycle (migration 0026, not applied)

- **Company:** `/briefs` (create, edit, publish, archive) and `/briefs/[id]` (invite a creator found by name in the directory; withdraw, or revise after the creator asks for changes).
- **Creator:** `/opportunities` (accept, decline or request changes; published briefs).
- **Both sides:** `/collaborations` and `/collaborations/[id]`:
  - propose terms; each side confirms, and a new proposal clears both confirmations;
  - the company adds deliverables; the creator submits an https link or a note;
  - the company approves or asks for a revision, and the creator resubmits;
  - the company completes once every deliverable is approved; either side can cancel with a reason;
  - the history comes from the append-only event table.
- **Admins** see every collaboration read-only.
- **Authorization:**
  - every transition is a SECURITY DEFINER function executable only by the service role, taking the actor from the session and locking the row;
  - server actions check the role, validate, mask free text (violations are logged) and rate-limit (`collab_write`);
  - signed-in users have SELECT only, filtered by RLS.
- **Accepting** an invitation opens a deal room. Confirming terms marks that room `agreed`; `paid` stays admin-only.
- **Not built:** reviews and representative authority (owner decisions, item 9), and notifications (next phase).
- **Tests:**
  - `supabase/tests/collaboration_lifecycle_test.sql` (lifecycle, refusals, RLS per role, append-only, cross-company FK);
  - `src/lib/collab/*.test.ts` (rules, display, guards);
  - rate-limit coverage;
  - `scripts/collab-ui-e2e.mjs`: 117 browser checks over the preview screens in en and ar, at 1440 and 390 px.

## Feature: in-app notifications (migration 0027, not applied)

- A trigger on `collaboration_events` creates one notification per party, except the actor, in the same transaction as the step. A step therefore never happens without its notification.
- Notifications hold ids and the event kind only; wording, names and titles are rendered at read time.
- **Preferences:** each person can mute four categories (invitations, terms, deliverables, completion and cancellation).
- **Bell:** a bell in the top bar shows the unread count, read under RLS with the browser session.
- **Page:** `/notifications` lists notifications. Opening one marks it read and goes to the page it is about; the target is built from stored ids, never from the request. "Mark all as read" is also available.
- **Delivery:** in-app only. Nothing is emailed or pushed.
- **Not built:** read state for deal-room chat messages.
- **Tests:**
  - `supabase/tests/notifications_test.sql`: recipients, muting, no free text, grants, RLS per role, anon;
  - `src/lib/notifications/rules.test.ts`: targets, preferences, write scoping;
  - browser checks in `scripts/collab-ui-e2e.mjs`.

## Feature: shortlists, portfolio and public-profile sections (migration 0028, not applied)

- **Shortlists** (`/shortlists`, companies):
  - create, rename and delete named lists;
  - save a creator from Discover's selected-creator panel, with an optional private note;
  - remove a creator after confirming.
  - Lists are private to the company: creators never see them, and admins cannot read them.
- **Portfolio** (`/portfolio`, creators):
  - add, edit, reorder and delete work (https links only);
  - each item is private until marked public;
  - a brand is named publicly only when the creator records the brand's consent;
  - text goes through the contact-detail mask, and violations are logged.
- **Section visibility:** six toggles decide what `/p/<slug>` shows. Existing sections default on, so the page is unchanged; the portfolio defaults off. The public RPCs enforce the toggles, so a hidden section never reaches the browser.
- **Database checks:** triggers enforce owner roles and limits (20 lists, 200 creators per list, 30 portfolio items).
- **Tests:**
  - `supabase/tests/shortlists_portfolio_test.sql`;
  - `src/lib/portfolio/rules.test.ts`;
  - rate-limit coverage;
  - browser checks.

## Not built in this pass

Deal-room message read state, support tickets, content planning, portfolio and visibility, shortlists, and the new platform integrations. See `MISSING_FEATURES_MATRIX.md`; most need migrations and the design answers in `PENDING_OWNER_DECISIONS.md` (item 9).
