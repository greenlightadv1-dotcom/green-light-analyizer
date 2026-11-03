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
| 0028 | `supabase/migrations/0028_shortlists_portfolio_visibility.sql` | Company shortlists, creator portfolio, public-profile section visibility | Tables `shortlists`, `shortlist_entries`, `portfolio_items`, `public_profile_settings`; three check triggers; `creator_public_profile` redefined with the same columns (hidden sections return NULL); new `creator_public_portfolio` | Yes: see the file header. Rolling back also means re-running 0017's `creator_public_profile`. Ask first. |
| 0029 | `supabase/migrations/0029_content_planning.sql` | Creator content plans (ideas and drafts, status, calendar date) | Table `content_items`, check trigger, owner-only RLS | Yes: `drop table if exists public.content_items;` deletes every draft. Ask first. |
| 0030 | `supabase/migrations/0030_message_notifications.sql` | In-app notification for a new message in a room between two accounts | `notifications.chat_id`; `event_id` nullable; kind/category checks extended; `messages_notify` trigger; one-unread-per-room index | Yes: see the file header. Ask first. |
| 0031 | `supabase/migrations/0031_recent_views.sql` | Synced median views of recent YouTube uploads | Two nullable columns on `media_kits`; no client grant | Yes: drop the two columns |
| 0032 | `supabase/migrations/0032_verification.sql` | Account status, creator KYC, company KYB, representative authorization | `profiles.account_status` (default `active`); `verification_cases`, `verification_documents`, `verification_events`; `verification_transition()`; private bucket `verification-docs` | Yes: see the file header (deletes all verification data; bucket objects must be removed separately). Ask first. |

- Additive only, except that 0028 replaces `creator_public_profile()` with the same signature and columns. With no settings row it returns exactly what 0017 did. No existing table, policy, grant or function changes. 0026 inserts into `deal_chats` only from `collab_respond_invitation` (accepting an invitation opens a deal room) and updates a room's status to `agreed` only from `collab_confirm_terms`.
- **0029 grants:** `anon` none; `authenticated` SELECT of own rows (no admin access); `service_role` writes.
- **0028 grants:** `anon` executes the two public RPCs only; `authenticated` SELECT of own rows (admins: portfolio and settings, read-only; never shortlists); `service_role` writes.
- **0027 grants:** `anon` none; `authenticated` SELECT of their own rows; `service_role` SELECT/DELETE, UPDATE of `read_at` only, and preferences. Only the trigger inserts notifications.
- **0026 grants:** `anon` none; `authenticated` SELECT only (writes go through the server after masking and validation); `service_role` CRUD, except `collaboration_events`, which is SELECT/INSERT only (append-only).
- Idempotent: `if not exists` and `drop ... if exists` throughout.
- **Retention:** the application deletes snapshots older than 29 days, on each sync and in `/api/cron/youtube-data-freshness`. Pruning in the job needs `CRON_SECRET` in Production. Without it, snapshots of creators who never sync again are not pruned (see PENDING_OWNER_DECISIONS.md, item 3).

## Local test (done, reproducible)

`bash scripts/local-migrations-test.sh`:
- creates a throwaway Postgres 16 cluster with Supabase stubs;
- applies 0001–0029 in order;
- re-applies 0024–0029;
- runs all 14 files in `supabase/tests/` (including the collaboration, notification, shortlist/portfolio and content tests);
- runs `supabase/verify/0025_verify.sql` to `0029_verify.sql`.

Result on 2 November 2026: **54 passed, 0 failed**. The stubs aren't the real Supabase services, so run the verification against the real project after applying.

## Application order (Production; needs owner approval)

1. **Back up:** confirm a recent backup or PITR (Dashboard → Database → Backups).
2. **Apply 0025** with one of these, not both:
   - `supabase db push`, which records history; it may also try 0024, which is harmless; or
   - the MCP `apply_migration`, which records history; or
   - the SQL Editor, which does not record history.

   0025 can go before or after the code deploy:
   - **Before:** nothing reads the table yet.
   - **After:** until it's applied, the Media Kit shows "no growth yet" and sync logs `media_kit_snapshot.write_failed`, without failing the sync.
3. **Apply 0026, 0027, 0028, then 0029,** the same way, after 0025. Until 0026 is applied, the Briefs, Opportunities and Collaborations pages show empty lists, and every write answers with a generic error. Until 0027 is applied, the bell shows no badge and the Notifications page is empty. Until 0028 is applied, the Shortlists and Portfolio pages are empty, saving fails with a generic error, and the public profile is unchanged. Until 0029 is applied, the Content plan page is empty and saving fails with a generic error.
4. **Verify:** run `supabase/verify/0025_verify.sql` to `0029_verify.sql`; every `ok` must be `true`.
5. **Advisors:** check Database → Advisors → Security for new warnings on the new tables.

## Blocked migration

The durable admin audit trail (see PENDING_OWNER_DECISIONS.md, item 4) is designed but **not written**, pending owner approval. It was once labelled 0026; it takes the next free number (0033 or later) when approved.

## Update 2026-11-03: 0025–0037 review and execution order

None of 0025–0037 is applied anywhere.

0024 was applied by the owner through the SQL Editor, so it is **not** in Supabase's migration history. A `supabase db push` would try to re-run it. 0024 is idempotent and the local harness re-applies it, but confirm the live schema first with `docs/handoff/migration-0024/0024_verify.sql`.

The local harness (`scripts/local-migrations-test.sh`) applies 0001–0037 to a throwaway Postgres, re-applies 0024–0037 to prove idempotency, and runs every test and verify file: **84 / 84 passed** on 2026-11-03.

| # | Migration | Depends on | Creates or changes | Rollback |
|---|---|---|---|---|
| 0025 | media_kit_snapshots | 0001 | table | drop table |
| 0026 | collaboration_lifecycle | 0024 | briefs, invitations, collaborations, deliverables, events, `collab_*` functions | in file header |
| 0027 | notifications | 0026 | notifications, preferences, trigger | in file header |
| 0028 | shortlists_portfolio_visibility | 0017, 0024 | 4 tables; replaces `creator_public_profile` / `_portfolio` | in file header |
| 0029 | content_planning | 0026 | content_items | drop table |
| 0030 | message_notifications | 0027 | notifications.chat_id, trigger on messages | in file header |
| 0031 | recent_views | 0001 | 2 media_kits columns | drop columns |
| 0032 | verification (rewritten this pass) | 0004, 0024 | account_status, cases (application-owned or profile-owned), documents (camera rule), events, reviewers, application_tokens, transition and activation functions, private bucket | in file header (deletes verification data) |
| 0033 | taxonomy | 0024, 0026 | taxonomy_terms (seeded with existing ids), creator_tags, reference triggers on profiles and briefs | in file header (keeps selections) |
| 0034 | company_permissions | 0024, 0026 | scope and event tables, `company_set_scope`, briefs RLS, **replaces `creator_directory()`** (same signature) | re-create the 0024 function and the 0026 policy, then drop tables |
| 0035 | media_kit_videos | 0001, 0004 | table, `media_kits.recent_videos_complete` | drop table and column |
| 0036 | relay_lifecycle | 0009, 0022 | 5 messages columns plus backfill, `relay_claim` / `relay_record` / `relay_requeue` | in file header |
| 0037 | news_items | — | table | drop table |

**Order:** strictly by number. The hard dependencies are:
- 0026 before 0027, 0029, 0033 and 0034;
- 0027 before 0030;
- 0024 (live) before 0033 and 0034.

**Data effects:**
- 0033 adds a trigger that refuses unknown taxonomy ids. `0033_verify.sql` first checks that every stored value is seeded.
- 0036 backfills relay states. A message relayed before 0036 becomes `sent`; one that failed before 0036 becomes `failed_permanent`, never retryable, so no retry run resends a stale message. Production holds exactly one such message (failed 2026-09-08, read-only check on 2026-11-03); an admin may requeue it deliberately from `/admin/relays`.
- Nothing else rewrites existing rows.

### Safe deployment plan (needs approval at each step)

1. Create a Supabase **branch** or staging project.
2. Apply 0025–0037 there in order, then run every `supabase/verify/00xx_verify.sql`.
3. Point a Vercel **Preview** deployment at that branch.
4. Smoke test:
   - application → camera capture → review → activation email (to a test inbox the owner controls) → account;
   - taxonomy admin;
   - representative scopes;
   - YouTube sync;
   - relay retry with a test sponsor address;
   - news refresh.
5. Apply to production during a quiet window. Back up first (Supabase PITR, or a dump).
6. Set the approved environment variables (see `PRODUCTION_READINESS_REPORT.md`).
7. Deploy.
