# Production release checklist

Target: `main` and then Vercel Production (`www.greenlightadvs.com`). Each gate
needs the owner's explicit approval. Do not skip a gate or bypass a review or
branch protection.

## Gate 0: blockers (must be resolved first)

- [ ] **Legal dates** set to the real publication date (PENDING_OWNER_DECISIONS.md, item 1).
- [ ] **Legal operator details** filled with real values (item 2).
- [ ] **`CRON_SECRET`** set in Vercel Production (item 3).
- [ ] **Audit-trail decision** recorded (item 4), whether approved or deferred.
- [ ] **Migration 0024** confirmed present (done read-only on 2 November 2026: its objects exist).

## Gate 1: code

- [ ] Branch pushed; GitHub CI green on the exact HEAD.
- [ ] Pull request into `main` reviewed. It contains these commits:
  - `9a627c3` docs;
  - `856fa16` mobile navigation drawer;
  - `4b7f333` unified plan / Get Started / onboarding / Discovery v2 / G;
  - `a056163` UX-0;
  - `52eaade` Phase 1;
  - `e50f503` audit fixes;
  - `ecda076` growth snapshots and print-to-PDF;
  - the documentation commit.
- [ ] Merge as a fast-forward or a merge commit; never force-push `main`.

## Gate 2: database

- [ ] Backup / PITR confirmed.
- [ ] Apply 0025 (DATABASE_MIGRATION_PLAN.md), then run `supabase/verify/0025_verify.sql`; every `ok` must be true.
- [ ] Optional: record 0024 in the migration history (`supabase migration repair`), run by the owner.

## Gate 3: environment (names only; never paste values)

- [ ] `NEXT_PUBLIC_ENABLE_UI_PREVIEW` is **unset** in Production.
- [ ] `/admin/system` shows no missing required variable after deploy.
- [ ] Supabase Auth Site URL and redirect URLs point at the production domain; password rules match CLAUDE.md §16, item 5.

## Gate 4: deployment

- [ ] Vercel Production deployment READY, and its commit equals the merged `main`.
- [ ] Route rendering is dynamic for app routes (`ƒ`) in the Vercel build log.

## Post-deploy smoke test (test accounts only; never real users)

Signed out:
- [ ] `/` returns 200; `/get-started` loads.
- [ ] `/terms` and `/privacy` show the correct dates and operator.
- [ ] `/dashboard` redirects to `/login`.
- [ ] `/preview` is not reachable.

Admin:
- [ ] Create a test creator and company; the forced reset works.
- [ ] Ban and unban a **test** account (a confirmation appears; the outcome is visible).
- [ ] Dismiss a test violation.
- [ ] Reject a test application.
- [ ] Unlink a test representative.

Roles:
- [ ] A creator visiting `/admin/users` is redirected.
- [ ] A company visiting `/analyzer` is redirected.

Creator:
- [ ] Media Kit: sync YouTube on a test channel; "growth appears once…" shows.
- [ ] On a later day, growth shows the real change.
- [ ] `/p/<slug>`: Print or save as PDF opens the print dialog.

Deal:
- [ ] Send an offer.
- [ ] Chat (masking still applies).
- [ ] Move to agreed (a confirmation appears).
- [ ] Admin marks it paid; a party can no longer change it.

Arabic: on a phone, the dashboard, Media Kit and dialogs are right-to-left with no overflow.

Cron:
- [ ] An unauthenticated GET returns 401.
- [ ] After the first scheduled run, the logs show `youtube_freshness.run` with `snapshots_deleted`.

## Stop and roll back if

Any of these fail:
- sign-in or the forced reset;
- deal creation;
- chat masking;
- admin marking a deal paid;
- any confirmation that reports success without the change being saved.

See `ROLLBACK_PLAN.md`.
