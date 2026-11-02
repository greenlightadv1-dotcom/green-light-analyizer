# Database migration plan

## Current live state (read-only check, 2 November 2026)

- **Migration history** (`supabase_migrations.schema_migrations`): 0001–0023.
  Two early migrations appear twice under different version numbers (`company_access`, `company_access_revoke_anon_directory`); this is historical.
- **0024:** applied by the owner through the SQL Editor, so it is **not** in the history. Its objects exist: `access_requests`, `company_members`, the `profiles` taxonomy columns, the `avatars` and `creator-documents` buckets, and `creator_directory()`. **Do not re-run it by hand.**
  - It is idempotent, so `supabase db push` re-running it is harmless.
  - To make the history truthful without re-running the SQL, an owner can record it with `supabase migration repair --status applied 0024`, using the version naming the project uses. That is an owner-run operation.
- **0025:** not applied. `media_kit_snapshots` does not exist.

## New migration in this release

| Id | File | Purpose | Objects | Reversible |
|---|---|---|---|---|
| 0025 | `supabase/migrations/0025_media_kit_snapshots.sql` | Real, dated stats snapshots for growth | Table `public.media_kit_snapshots` (FK to `media_kits` and `profiles`, cascade); unique (kit, day); 3 indexes; RLS on; SELECT policy for the owner or an admin; `authenticated`: select only; `anon`: none; `service_role`: full | Yes: `drop table if exists public.media_kit_snapshots;` deletes the history. Ask first. |

- Additive only. No existing table, policy, grant or function changes.
- Idempotent: `if not exists` and `drop ... if exists` throughout.
- **Retention:** the application deletes snapshots older than 29 days, on each sync and in `/api/cron/youtube-data-freshness`. Pruning in the job needs `CRON_SECRET` in Production. Without it, snapshots of creators who never sync again are not pruned (see PENDING_OWNER_DECISIONS.md, item 3).

## Local test (done, reproducible)

`bash scripts/local-migrations-test.sh`:
- creates a throwaway Postgres 16 cluster with Supabase stubs;
- applies 0001–0025 in order;
- re-applies 0024 and 0025;
- runs all 10 files in `supabase/tests/`;
- runs `supabase/verify/0025_verify.sql`.

Result on 2 November 2026: **38 passed, 0 failed**. The stubs aren't the real Supabase services, so run the verification against the real project after applying.

## Application order (Production; needs owner approval)

1. **Back up:** confirm a recent backup or PITR (Dashboard → Database → Backups).
2. **Apply 0025** with one of these, not both:
   - `supabase db push`, which records history; it may also try 0024, which is harmless; or
   - the MCP `apply_migration`, which records history; or
   - the SQL Editor, which does not record history.

   0025 can go before or after the code deploy:
   - **Before:** nothing reads the table yet.
   - **After:** until it's applied, the Media Kit shows "no growth yet" and sync logs `media_kit_snapshot.write_failed`, without failing the sync.
3. **Verify:** run `supabase/verify/0025_verify.sql`; every `ok` must be `true`.
4. **Advisors:** check Database → Advisors → Security for new warnings on `media_kit_snapshots`.

## Blocked migration

The durable admin audit trail (see PENDING_OWNER_DECISIONS.md, item 4) is designed but **not written**, pending owner approval.
