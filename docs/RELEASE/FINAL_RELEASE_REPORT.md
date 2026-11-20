# Final release report (2026-11-03)

## Verdict: not deployed

The branch is pushed and PR #6 is updated. Production was **not** deployed, and no production migration, Auth, environment, Resend, DNS or cron setting was changed.

There are two reasons:

1. **The new code cannot run safely on the current production database.** Production has migrations up to 0024. Read-only checks on 2026-11-03 found that 0025–0037 are absent: there is no `account_status`, and none of the tables 0025–0037 add. Two features that work on production today would break if this branch were deployed as it is:
   - **YouTube sync.** `syncYouTubeStats` writes the 0031 columns (`recent_median_views`, `recent_views_sample`) in its main update. Without them the update fails, and the creator sees "stats not saved".
   - **Get Started.** An application now also writes a `verification_cases` row (0032). Without that table, every application answers "unavailable".

   Collaborations, notifications, shortlists, portfolio, content, verification, taxonomy, team, relays and news would also be unavailable.
2. **Production migrations are blocked by the owner's own preconditions.** These require a verified backup and a staging test before any production migration. The Supabase organisation is on the **Free** plan. That plan has no branching, no point-in-time recovery, and no backup this session can download and restore-test. This session has no database password, so it cannot take a `pg_dump` either.

## Exact approval needed to release

1. **Backup (owner).** Run `supabase db dump` (schema) and `supabase db dump --data-only`, or `pg_dump`, against `kpuecrvdrkhemyvibyfa`. Then check that the dump restores into a throwaway Postgres. Alternatively, upgrade to Pro for daily backups, PITR and branching. That is a paid decision.
2. **Migrations (owner approval).** Apply 0025–0037 in order, as in `DATABASE_MIGRATION_PLAN.md`.
   - Every one is additive and idempotent: no table or column is dropped, and no existing row is deleted.
   - Existing rows change in two places only:
     - `profiles.account_status` is added with default `active`, which affects all 10 profiles;
     - 0036's relay backfill touches existing messages (see the plan).
   - 0033 adds taxonomy triggers on `profiles` and `briefs`. Production profiles hold no categories, games or formats today (read-only check), so no existing row conflicts.
   - 0028 and 0034 replace `creator_public_profile()` and `creator_directory()`.
3. **Supabase Auth.** Turn "Allow new users to sign up" **off**.
   - Impact, established from the code:
     - Activation and admin account creation both use `auth.admin.createUser` with the service role, which this setting does not affect.
     - Nothing calls `signUp` (guarded by `registration.test.ts`).
     - Password sign-in, password recovery and Google OAuth for YouTube are unaffected. YouTube OAuth is a separate token flow, not Supabase Auth sign-in.
   - Not tested on a real Supabase project.
4. **At least one row in `verification_reviewers`.** Until then, nobody can approve an application.
5. **Merge PR #6, then deploy to production.** Only after steps 1–4. Then run the smoke test in CLAUDE.md §16.

## Quality gates (local, this session, after the 0036 fix)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | 740/740, 19/19, 33/33 |
| `npm run build` | exit 0 |
| `scripts/local-migrations-test.sh` (0001–0037 on throwaway Postgres; RLS and authorization negative tests) | 84/84 |
| Browser suites (camera 38, collab 310, phase1 206, mobile-nav 18, g-voice 18, g-wake 31) | from the previous pass at `1ac02d1`; not re-run, since the only change since then is SQL and docs |
| Client bundle scan for secret variable names or key prefixes | none found |

There was no real Supabase, Resend, NVIDIA or camera-hardware testing.

## Security findings this pass

| Finding | Resolution |
|---|---|
| The 0036 backfill made the one production message that failed on 2026-09-08 retryable, so a retry run would have emailed a two-month-old message. | **Fixed:** it is backfilled as `failed_permanent`, and an admin can requeue it explicitly. |
| Deploying without migrations breaks YouTube sync and Get Started. | **Release blocked** (above). |
| Identity capture: `DocumentUploader` (a file picker) exists. | Used only for company documents. Identity types require `capture=camera` server-side, and the database requires `capture_method='camera'`. |
| Residual limit: a crafted direct POST with an EXIF-free JPEG passes the camera check. | Documented in `IDENTITY_DOCUMENT_SECURITY.md`. There is no hardware attestation, liveness or face matching, and none is claimed. |

## Still disabled or owner-dependent (unchanged)

- Identity retention: `VERIFICATION_RETENTION_DAYS` is unset, so nothing is purged.
- Malware scanning: none. Uploads are restricted to magic-byte-checked types and sizes.
- News cron and relay-retry cron: not in `vercel.json`.
- Instagram: disabled. TikTok and X: planned. Twitch and Kick: self-reported.
- Gated representative scopes.
- Legal (needs owner and counsel):
  - Terms §2 wording for the new flow;
  - Privacy Policy identity-document section;
  - the PDPL checklist;
  - the `ENTITY_*` operator details.
- `CRON_SECRET`, `ROLE_MAILBOX_FORWARD_TO`, and a verified Resend sender for activation mail.

## Rollback

Production is unchanged at `main` `5580a78`, deployment `dpl_mBdwmQuq6HS8n32i7aRMYPWMKTfy`, so there is nothing to roll back. For the eventual release, see `ROLLBACK_PLAN.md`.
