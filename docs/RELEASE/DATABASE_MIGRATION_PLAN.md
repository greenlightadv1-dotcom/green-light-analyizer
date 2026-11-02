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
| 0026 | `supabase/migrations/0026_collaboration_lifecycle.sql` | Briefs, invitations, collaborations, deliverables and their history | Tables `briefs`, `invitations`, `collaborations`, `deliverables`, `collaboration_events`; `private.is_creator()`; 12 `collab_*` SECURITY DEFINER functions (service_role only); RLS on every table | Yes: the file header lists the drop statements. They delete all collaboration data and the deal rooms stay. Ask first. |

| 0027 | `supabase/migrations/0027_notifications.sql` | In-app notifications for collaboration events, and per-person muting | Tables `notifications`, `notification_preferences`; trigger `collaboration_events_notify` and two `private` functions; RLS recipient-only | Yes: the file header lists the drop statements. They delete every notification and preference. Ask first. |

- Additive only. No existing table, policy, grant or function changes. 0026 inserts into `deal_chats` only from `collab_respond_invitation` (accepting an invitation opens a deal room) and updates a room's status to `agreed` only from `collab_confirm_terms`.
- **0027 grants:** `anon` none; `authenticated` SELECT of their own rows; `service_role` SELECT/DELETE, UPDATE of `read_at` only, and preferences. Only the trigger inserts notifications.
- **0026 grants:** `anon` none; `authenticated` SELECT only (writes go through the server after masking and validation); `service_role` CRUD, except `collaboration_events`, which is SELECT/INSERT only (append-only).
- Idempotent: `if not exists` and `drop ... if exists` throughout.
- **Retention:** the application deletes snapshots older than 29 days, on each sync and in `/api/cron/youtube-data-freshness`. Pruning in the job needs `CRON_SECRET` in Production. Without it, snapshots of creators who never sync again are not pruned (see PENDING_OWNER_DECISIONS.md, item 3).

## Local test (done, reproducible)

`bash scripts/local-migrations-test.sh`:
- creates a throwaway Postgres 16 cluster with Supabase stubs;
- applies 0001–0027 in order;
- re-applies 0024–0027;
- runs all 12 files in `supabase/tests/` (including `collaboration_lifecycle_test.sql` and `notifications_test.sql`);
- runs `supabase/verify/0025_verify.sql`, `0026_verify.sql` and `0027_verify.sql`.

Result on 2 November 2026: **46 passed, 0 failed**. The stubs aren't the real Supabase services, so run the verification against the real project after applying.

## Application order (Production; needs owner approval)

1. **Back up:** confirm a recent backup or PITR (Dashboard → Database → Backups).
2. **Apply 0025** with one of these, not both:
   - `supabase db push`, which records history; it may also try 0024, which is harmless; or
   - the MCP `apply_migration`, which records history; or
   - the SQL Editor, which does not record history.

   0025 can go before or after the code deploy:
   - **Before:** nothing reads the table yet.
   - **After:** until it's applied, the Media Kit shows "no growth yet" and sync logs `media_kit_snapshot.write_failed`, without failing the sync.
3. **Apply 0026, then 0027,** the same way, after 0025. Until 0026 is applied, the Briefs, Opportunities and Collaborations pages show empty lists, and every write answers with a generic error. Until 0027 is applied, the bell shows no badge and the Notifications page is empty.
4. **Verify:** run `supabase/verify/0025_verify.sql`, `0026_verify.sql` and `0027_verify.sql`; every `ok` must be `true`.
5. **Advisors:** check Database → Advisors → Security for new warnings on the new tables.

## Blocked migration

The durable admin audit trail (see PENDING_OWNER_DECISIONS.md, item 4) is designed but **not written**, pending owner approval. It was once labelled 0026; it takes the next free number (0028 or later) when approved.
