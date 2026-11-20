# Migration 0024 — manual application in the Supabase SQL Editor

**Status: APPLIED to the live project by the owner**, through the Supabase SQL
Editor, and `0024_verify.sql` passed (owner-confirmed, 2026-10-31). This
was not independently re-checked from this repository. **Do not run the
migration again.** It is idempotent, so a rerun would be harmless, but it is
unnecessary. The instructions below are kept as the record of how it was
applied. The verification queries are read-only and safe to rerun at any
time. A SQL Editor run is not recorded in Supabase's migration history (see
"Review findings").

| File | What it is | Writes? |
|---|---|---|
| `0024_marketplace_onboarding_taxonomy_uploads.sql` | The migration, byte-identical to `supabase/migrations/0024_marketplace_onboarding_taxonomy_uploads.sql` (SHA-256 `a37fd640aa0627104166e410a86ae0f2bfd041759934f5b76370dd9f666616f9`) | Yes |
| `0024_prerequisites.sql` | Checks that 0001–0023 are present and the function is safe to replace | No (read-only) |
| `0024_verify.sql` | Post-application checks: tables, columns, constraints, indexes, RLS, grants, RPC, buckets | No (read-only) |

## What 0024 does

All additive, apart from replacing one function:

1. **`profiles`**: adds 5 columns:
   - `creator_categories`, `creator_games`, `content_formats` (`text[]`, default `{}`);
   - `company_website`, `company_industry` (`text`, null).

   It also adds size `CHECK`s and 2 GIN indexes. The columns are **not**
   client-writable: 0003 already removed table-level UPDATE from
   `authenticated`, and 0024 adds an explicit column `revoke`.
2. **`access_requests`**: new table holding Get Started applications.
   - RLS on, with **no** policies, and all access revoked from `anon` and
     `authenticated`. Only the server (service role) reads or writes it.
   - At most one pending application per email (case-insensitive).
3. **`company_members`**: new table linking representative accounts to
   companies.
   - RLS on. One SELECT policy: the member, the company, or an admin.
   - Writes are server/admin only.
4. **`creator_directory()`**: dropped and recreated.
   - It keeps the original 12 columns, in the same order and with the same
     filters.
   - It adds 9 columns: avatar, country, categories, games, formats, base
     rate, two sync timestamps, and the public slug.
   - Verified geography is returned only while under 30 days old.
   - Still `SECURITY DEFINER`, still returns zero rows unless the caller is a
     company or admin, and still has no email, alias, phone or bio.
5. **Storage**: two buckets.
   - `avatars`: public, 2 MB, JPEG/PNG/WebP.
   - `creator-documents`: private, 5 MB, PDF/JPEG/PNG/WebP.
   - No `storage.objects` policies; uploads go through the server only.

It is **compatible with the code now in Production (`5580a78`)**. That code
reads only the original 12 directory columns and never touches the new
tables. The one visible change is that verified geography older than 30 days
stops being shown as verified, which is the stricter, intended behaviour. So
0024 can be applied **before** the new code is deployed (recommended order).

## Review findings

- **No correction needed.** The original migration is unchanged and no
  alternative SQL is proposed.
- **Destructive operations:** the only one is
  `drop function if exists public.creator_directory();`, immediately followed
  by `create function`. It is needed because the return type changes. The
  prerequisite file confirms nothing else depends on the function. Supabase's
  editor may show a "destructive operation" warning for this.
- **Re-runnable:** every statement is idempotent (`if not exists`,
  `drop … if exists`, `on conflict do nothing`). Running it twice is
  harmless; this was tested.
- **Buckets that already exist** are left unchanged (`on conflict do
  nothing`). The verification queries will then show whether their settings
  match.
- **Migration history:** SQL Editor runs are **not** recorded in Supabase's
  migration history (`supabase_migrations.schema_migrations`). 0022 and 0023
  were recorded there. A later `supabase db push` might try to run 0024
  again; that is harmless because it is idempotent, but the history will show
  it as unapplied.
- **Local validation (not Production):**
  - Migrations 0001–0024 were applied to a throwaway local PostgreSQL 16 that
    mimicked Supabase's default grants to `anon`, `authenticated` and
    `service_role`.
  - Every prerequisite and verification check returned `true`; a re-apply
    exited 0.
  - Role tests behaved as designed.
  - The local database was then deleted. A local stub of `auth` and
    `storage` is not the real Supabase services, so run the verification
    queries on the real project.

## Before you start

1. Take a backup, or confirm Point-in-Time Recovery or a recent daily backup
   exists (Dashboard → Database → Backups).
2. Pick a quiet moment. The `profiles` changes take a brief lock, and the
   table is small.
3. Note the row counts:

   ```sql
   select (select count(*) from public.profiles) as profiles,
          (select count(*) from public.media_kits) as media_kits,
          (select count(*) from public.deal_chats) as deal_chats;
   ```

## Steps (Supabase Dashboard)

1. Open the project → **SQL Editor** → **New query**.
2. Paste the whole of **`0024_prerequisites.sql`** → **Run**.
   - Every `ok` must be `true`.
   - If any is `false`, **stop** and report it.
   - The second result lists any existing `avatars` / `creator-documents`
     buckets; normally there are none.
3. **New query** → paste the whole of
   **`0024_marketplace_onboarding_taxonomy_uploads.sql`** → **Run**.
   - Confirm the destructive-operation prompt if it appears; it refers to
     the function replacement.
   - **Success:** "Success. No rows returned", with no error. Notices such as
     "column … already exists, skipping" are fine.
   - **On an error:** copy the exact message and stop.
4. **New query** → paste **`0024_verify.sql`** → **Run**.
   - Every `ok` must be `true`.
   - The final row shows the counts: `profiles`, `media_kits` and
     `deal_chats` must equal step 3 of "Before you start", and both new
     tables must show `0`.
5. Optional: **Database → Advisors → Security** should report no new issues
   for `access_requests`, `company_members` or `creator_directory`.

## If something goes wrong

The migration only adds things, so the deployed app keeps working even if it
stops partway. Re-running it is safe. To undo it completely, ask before
running anything. A rollback would drop the two new tables, the five columns
and the two buckets (deleting any data entered since), and recreate the 0010
version of `creator_directory()`. That is a destructive change and is
deliberately not pre-written here.
