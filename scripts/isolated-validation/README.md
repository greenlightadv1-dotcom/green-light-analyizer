# Isolated Supabase validation (never production)

These scripts drive the real app against an isolated Supabase stack (the Supabase CLI's local services: Postgres, Auth, REST, Storage, Mailpit). External calls are mocked. They never use production keys, `localbasic`, or a hosted project unless that project was created for this purpose and approved.

The passwords in these files are throwaway values for disposable test users on the isolated stack only.

1. **Start the stack.** In a scratch directory, run `supabase init`, copy `supabase/migrations/0001–0024` into it, and run `supabase start`. You need Docker and access to `public.ecr.aws` and its CDN.
2. **Load production-shaped data.** Create the users with the Auth admin API, then load the masked export (`scripts/rehearsal/export-masked.sql`, run read-only on production). Keep the data out of the repository.
3. **Rehearse the backup and restore.** Run `supabase db dump --local` three times (roles, schema, and data with `-x storage.buckets_vectors -x storage.vector_indexes`), then restore into a fresh stack:
   `psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/rehearsal/pre-restore.sql -f roles.sql -f schema.sql -c 'SET session_replication_role = replica' -f data.sql`
4. **Migrate.** Run `psql -f scripts/rehearsal/baseline.sql`, then apply 0025–0037 one file per transaction, then run `post-checks.sql`, `supabase/verify/*.sql` and `supabase/tests/*.sql`.
5. **Test Auth.** Set `[auth] enable_signup = false`, restart, then run `python3 -I auth_tests.py <fixture.py>` and `python3 -I rest_tests.py`. Both need `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` and `MAILPIT_URL` from `supabase status -o env`.
6. **Run the app workflows.** Build the app with the stack's URL and keys, then start it with `NODE_OPTIONS="--import mock-externals.mjs" MOCK_OUTBOX=<file>`. Run `flow1.mjs` through `flow4.mjs` with `DB_URL`, `MOCK_OUTBOX` and `STATE` set.

Results of the 2026-11-06 run: `docs/RELEASE/ISOLATED_SUPABASE_VALIDATION_REPORT.md`.

## UX and G walkthrough (2026-11-19)

Create three throwaway accounts on the isolated stack with the Auth admin API:
- `ux-creator@…` (YouTube kit, two deal rooms);
- `ux-company@…` (complete details, one published brief);
- `ux-admin@…`.

Set `must_change_password = false` on their profiles. Also add one `news_items` row tagged `platform_youtube`, titled as a test fixture. With NVIDIA mocked to 503, `g-workflows.mjs` checks nine things:
- the creator's assessment and deals cards;
- a content-idea proposal built from the stored headline, saved only after the confirmation dialog;
- a company invitation proposal for its own published brief, sent only after confirmation and not proposed twice;
- admin navigation-only answers.

Results: 9/9. On the same build:
- `g-voice-e2e` 18/18;
- `g-wake-e2e` 31/31;
- `phase1-ui-e2e` 204/204;
- `mobile-nav-e2e` 19/19.

Accessibility (`a11y-axe.mjs`, `a11y-keyboard.mjs`):
- zero axe WCAG 2.0/2.1 A and AA violations on 33 signed-in pages (creator, company and admin; desktop light and phone dark) and on 6 public pages (en light; ar dark on a phone);
- the skip link is the first Tab stop and moves focus into `<main>`;
- all 40 Tab stops checked on the dashboard show a visible focus style.

Registration and verification (`registration-smoke.mjs`, migration 0039 applied to the isolated stack):
- run it with `APP_URL=http://localhost:3200`, because the emailed link redirects to the app's own origin and the cookie must match;
- 9 checks: Get Started; the unverified submit refused; the link verifies the email; step saves merge; the public photo is image-only; review gating and submit; the reviewer's trust checks and rejection with a reason; the rejected applicant reads the reason through a new link; a representative needs ID images;
- for the run it grants `ux-admin` the reviewer role, and removes the grant and its rows afterwards.

Reviewer notes, reapplication, photo metadata and retention (migration 0040 applied to the isolated stack):
- `review-retention-check.mjs` needs `CRON_SECRET` in the app's environment (a throwaway test value in the scratch env file, never a real secret) and `FIXTURE`, a JPEG carrying GPS. Run it with `APP_URL=http://localhost:3200`. Checks: real-storage purge and its 365-day guard; notes and flags through the real PostgREST; GPS removed through the real avatar route. 3/3.
- `exif-strip-check.py` reads real JPEG, PNG and WebP files back with Pillow; run it with a Python that has Pillow (the system one here is broken, so use a venv). 4/4.
