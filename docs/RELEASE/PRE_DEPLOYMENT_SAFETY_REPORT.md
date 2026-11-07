# Pre-deployment safety and database recovery (2026-11-03)

Nothing in production was changed. All production access in this pass was read-only SQL. No migration, Auth, Storage, environment, Vercel or DNS setting was touched.

## 1. Preview isolation

| Question | Status |
|---|---|
| Deployment Protection on the preview | **Unverified.** The Vercel connection has no grant for team `greenlightadv1-6093`; every project and deployment call answers 404 or 403. The owner must approve the team-access link before this can be read. |
| Preview publicly accessible | **Unverified**, for the same reason. This sandbox cannot reach `*.vercel.app` either: the egress proxy refuses it. |
| Preview variables point at production Supabase | **Unverified, but production is the only candidate.** The organisation has two projects: `green-light` (production) and `localbasic`, an unrelated restaurant/clinic product. Any Supabase keys a Green Light preview carries are therefore production's. |
| Can a preview write to production? | **Yes, for the `d6fd238` preview, if it has those keys.** For example, `/get-started` would write `access_requests` and then fail on the missing `verification_cases`. **No for any deployment of the next commit,** which adds the guard below. |
| Activation, email, cron, admin from a preview | Activation and admin actions are server actions, so they are POST requests and the guard refuses them. Vercel runs crons only on production; on a preview the cron check now also refuses. Webhooks refuse on a preview. Email is sent only from those server-side paths. |

**Changed: a code guard, `src/lib/preview-guard.ts`.**
- On `VERCEL_ENV=preview`, unless `PREVIEW_WRITES_ENABLED=1`, the app refuses:
  - every POST, PUT, PATCH and DELETE, which covers all server actions, sign-in, Get Started, activation and uploads;
  - the GET routes that write (OAuth callback, resume link);
  - every cron and webhook route.
- Tested in `preview-guard.test.ts` (5 tests).
- Probed on a local production build:
  - **as a preview,** each of those requests got 503 (cron: 401);
  - **as production,** `/login` returned 200, `/get-started` returned 405 to a bare POST, and the OAuth and resume routes redirected (307), exactly as before.

**Not done:** the existing `d6fd238` preview deployment could not be cancelled or deleted, because the session has no Vercel access. It was built before the guard and stays reachable at its own unique URL until the owner deletes it, or confirms protection, in the Vercel dashboard. The guard covers the branch alias as soon as the next commit is deployed.

## 2. Backup plan

Production (read-only, 2026-11-03):
- Postgres 17.6, 13 MB.
- 10 auth users, all with password hashes; 11 sessions; email identities only; no MFA factors.
- 0 Vault secrets.
- 0 storage objects. The `avatars` and `creator-documents` buckets exist but are empty.
- Extensions: `uuid-ossp`, `pgcrypto`, `pg_stat_statements`, `supabase_vault`.
- No `cron` schema and no other app schemas.

A complete backup on the Free plan, run by the owner with the database password (Dashboard → Connect → *Session pooler*, since the direct host is IPv6-only):

```
supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only
```

| Item | Covered by |
|---|---|
| Tables and data in `public`, `private`, `auth` (users, identities, password hashes, sessions) and `storage` (bucket and object metadata) | `data.sql` |
| Schema, functions, triggers, constraints, indexes, RLS policies, grants | `schema.sql` |
| Custom roles | `roles.sql` |
| Sequences | `schema.sql` / `data.sql`. There are none in `public`/`private` today. |
| Storage objects (file bytes) | Not in a dump. There are none today. If any appear, download them via the Storage API. |
| Auth settings (sign-up toggle, Site URL, redirect URLs, providers, email templates, password rules) | Not in the database. Record them from Dashboard → Authentication before any change. |
| Vercel environment, Resend and DNS | Not in the database. Unchanged by a migration. |

The files contain password hashes and personal data. Store them encrypted and never commit them.

**Can this session make that backup? No.** It has no database password, and no Supabase tool here produces a dump. **No production backup exists from this pass.**

## 3. Restore test

- **Into an isolated Supabase database: blocked.**
  - The Free plan allows two projects, and both are in use. `localbasic` is unrelated, has real users, and already has tables named `profiles`, `notifications`, `invitations` and `promo_codes`, so it must not be used.
  - Branching needs Pro.
  - `supabase start` needs images this sandbox cannot pull: ECR and GHCR blob hosts are refused, and Docker Hub answered 429.
- **What was proven instead, locally:**
  - **Schema equivalence.** `scripts/rehearsal/catalog-summary.sql` fingerprints production and a local rebuild of 0001–0024. They are identical for columns, constraints, indexes, RLS, policies (including storage), table and column grants, buckets and the realtime publication. Functions match except:
    - `uuid-ossp`, which lives in `extensions` on production and in `public` locally;
    - the comments inside `consume_rate_limit`. Its body is otherwise identical.
    Production's 7 extra triggers are Supabase's own storage triggers.
  - **Production-shaped data.** A masked export (`scripts/rehearsal/export-masked.sql`) masks personal data and secrets inside the query, so they never leave production. It keeps every id, foreign key, status, flag and timestamp. It was loaded into the 0024 rebuild with all constraints active, and all 79 rows loaded.
  - **Recovery method.** A `pg_dump -Fc` of that database restored with `pg_restore` into a new database. The catalog fingerprint and per-table data checksums matched the pre-migration state in all 12 tables.

  This proves the dump-and-restore method on a production-equivalent schema with production-shaped data. **It does not prove that a production backup restores.**

## 4. Migration rehearsal (local, production-shaped data)

0025–0037 were applied in order. All applied cleanly, and re-applying 0024–0037 was idempotent. `scripts/rehearsal/post-checks.sql` checked:

| # | Check | Result |
|---|---|---|
| 1 | All 12 pre-0025 tables: same row counts and same checksum over their original columns | PASS |
| 2 | All 10 profiles `account_status = active` | PASS |
| 3 | Relay backfill: 5 `sent`, 1 `failed_permanent` (the 2026-09-08 failure), 10 untouched | PASS |
| 4 | No message is due for relay after the migration; `relay_claim` refuses the old failure | PASS |
| 5 | RLS:<br>- a creator still reads their own profile, 4 deals and their messages, and nothing else;<br>- a company sees no creator deals, the directory lists 4 creators, and creator profile rows stay hidden;<br>- an admin sees all 6 deals | PASS |
| 6 | Taxonomy triggers: all 10 profiles still update; a valid id is accepted; an unknown id is refused | PASS |
| 7 | The YouTube sync update with 0031/0035 columns succeeds on an existing kit | PASS |
| 8 | Get Started writes an application and its verification case, with no profile | PASS |
| 9 | Public profile by an existing slug works; no representative scope exists | PASS |
| 10 | RLS is on for all 35 public tables; `verification-docs` is private | PASS |

Every `supabase/verify/*.sql` script passed on the migrated data. **Rollback:** restoring the pre-migration dump returned the exact pre-migration state (section 3). The per-migration down-scripts were not run.

These are local stubs for `auth.uid()`, roles and storage, not the real Supabase services.

## 5. Supabase Auth review

**Not tested against a real Auth server.** No non-production Supabase project is available (section 3). Building Supabase Auth from source in this sandbox was refused by the session's permission policy, so it was not attempted.

From the code:
- **Activation and admin account creation:** both use `auth.admin.createUser` with the service-role key, which "Allow new users to sign up = off" does not block. Activation then signs the user in with `signInWithPassword`.
- **Existing login and password recovery:** unaffected by that setting.
- **YouTube:** connects through the app's own Google OAuth routes, not Supabase Auth providers.
- **Sign-up:** nothing calls `signUp`.

Still to verify on a real non-production project, with the setting off:
- activation end to end;
- admin create;
- login;
- recovery email;
- YouTube connect.

## 6. Release checklist

| Item | State |
|---|---|
| Code: tsc, lint, 745 + 19 + 33 unit tests, build | Ready |
| Migration harness 84/84; rehearsal on production-shaped data 13/13 checks; verify scripts | Ready (local) |
| Preview read-only guard | Ready. Takes effect on the next preview build. |
| Delete or confirm protection on the `d6fd238` preview | **Owner.** Vercel dashboard, or approve team access. |
| Full production backup and a restore test into an isolated database | **Blocked.** Owner runs the three dumps; an isolated target is needed (below). |
| Real-Auth test with sign-up off | **Blocked.** Needs an isolated Supabase project. |
| Apply 0025–0037 to production | **Owner approval**, after the two items above. |
| Auth: sign-up off; Site URL and redirects; password rules | **Owner approval** |
| A `verification_reviewers` row | **Owner approval** |
| Environment: `RESEND_API_KEY` and a verified sender, `CRON_SECRET`, `ROLE_MAILBOX_FORWARD_TO` | **Owner input** |
| Merge PR #6 and deploy | After everything above |

**An isolated target needs one of the following:**
- **(a)** Supabase Pro on the organisation (branching, daily backups, PITR; paid);
- **(b)** pausing `localbasic` to free a Free-plan slot for a throwaway project;
- **(c)** a machine with Docker Hub access to run `supabase start` and restore the dumps there.

**Production migration order:** 0025 → 0037, one transaction per file, then `supabase/verify/*.sql` and `scripts/rehearsal/post-checks.sql` adapted to production. The adaptation needs the `rh` checksum baseline taken just before migrating. **Recovery:** restore the three dump files into the project, per Supabase's restore guide, then redeploy `5580a78`.
