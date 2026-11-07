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
