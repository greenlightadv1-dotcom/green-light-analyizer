# Production readiness report (2026-11-02)

## Verdict

**Not ready for production yet.** The branch passes every local check (`IMPLEMENTATION_TEST_REPORT.md`), but none of it is deployed, and the blockers below remain. Production stays at `main` `5580a78`, unchanged by this work.

## Blockers

### Code

1. **Review:** the branch needs review, and it is not pushed. PR #6 is behind the local commits.
2. **Real-project exercise:** the signed-in flows (verification, admin queue, registration, notifications) have only run against mocks and local Postgres.

### Database (needs approval)

3. **Migrations 0025–0032:** not applied anywhere. Apply them first to a Supabase branch, run `supabase/verify/*.sql`, then production.
4. **Order:** 0026 must precede 0027 and 0029, and 0030 needs 0027.

### Environment (needs approval)

5. **`CRON_SECRET`:** not set, so the YouTube 29-day cleanup is not running. This also covers the 0025 snapshots.
6. **`ROLE_MAILBOX_FORWARD_TO`:** not set, so support@, privacy@ and security@ mail reaches nobody.
7. **`SELF_SIGNUP_ENABLED`:** leave it unset until D2 is decided.
8. **`NEXT_PUBLIC_ENABLE_UI_PREVIEW`:** must stay unset in production.

### Provider

9. **Supabase Auth:**
   - the production Site URL and redirect URLs (including `/auth/confirm`);
   - "Confirm email" and the stronger password rules (§16 item 5).
10. **Google OAuth:** consent-screen verification for the YouTube scopes. Status unknown.
11. **Meta:** App Review and a Graph version upgrade before Instagram can be enabled.
12. **Identity verification:** no face or liveness provider. Its selection needs approval (D3/D4).

### Legal

13. **Operator details:** `ENTITY_*` in `lib/constants/legal.ts`, and `LEGAL_LAST_UPDATED`.
14. **Terms §2:** update before self-registration is enabled.
15. **Privacy policy:** cover identity documents (what is collected, purpose, retention, admin access) before KYC goes live. Also cover PDPL 151/2020.

### Business (owner decisions)

`docs/RELEASE/PENDING_OWNER_DECISIONS.md` items 9–13, plus:
- representative permission scopes;
- the retention period for identity documents;
- relay retry policy (item 11);
- pricing from synced reach (item 12);
- payment-rails wording in the approval email (item 13);
- news-monitoring sources and the scheduler;
- Supabase Free vs Pro (§16 item 5).

## Release sequence once approved

1. Push the branch and update PR #6.
2. Run CI.
3. Apply 0025–0032 to a Supabase branch, then verify.
4. Run a signed-in preview smoke test of each journey.
5. Apply the migrations to production.
6. Set the approved env vars.
7. Merge, deploy and run the §16 smoke test.
8. Follow `docs/RELEASE/ROLLBACK_PLAN.md`.
