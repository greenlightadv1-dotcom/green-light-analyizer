# Isolated Supabase validation report (2026-11-06)

**Commit tested:** `ae13140`, plus this report's commit, which changes only:
- the test fix described in section 4;
- `scripts/rehearsal/pre-restore.sql`;
- the harness in `scripts/isolated-validation/`.

**Production was not touched.** Every production access in this pass was read-only SQL. No migration, Auth, Storage, environment, Vercel, DNS, OAuth or Resend setting changed anywhere except on the isolated stack. `localbasic` was not used.

## Statuses

| Status | Meaning in this report |
|---|---|
| VERIFIED | Executed against the real Supabase service stack, isolated in this session. **This is the Supabase CLI's local stack, not a hosted Supabase project.** Hosted-only behaviour (dashboard settings, the pooler, platform-managed roles, hosted Storage) is not covered by it. |
| LOCALLY VERIFIED | Plain local PostgreSQL with stubs, or mocks only. |
| CODE REVIEW ONLY | Inspected, not executed. |
| BLOCKED | Could not test. |
| NOT APPROVED | Needs the owner's explicit authorisation. |

## 1. Environment

| Question | Finding |
|---|---|
| Separate hosted Supabase project | **BLOCKED.** The organisation is on Free, with 2 active projects (`green-light`, `localbasic`). A third needs a paid plan, or pausing `localbasic` (owner decision). |
| Branching | **BLOCKED.** Needs Pro. |
| Existing authorised isolated database | None. |
| Local Docker and Supabase CLI | **Available.** The image CDN (`d2glxqk2uabbnd.cloudfront.net`) was added to this personal sandbox environment's allowlist, with approval. |
| Vercel preview with isolated credentials | **BLOCKED.** This session's Vercel connection is refused (403/404) for team `greenlightadv1-6093`. |

**Isolated stack:** Supabase CLI 2.122.1, project `gl-isolated`, all on 127.0.0.1.

| Component | Version |
|---|---|
| Postgres | 17.11.0.006 (production: 17.6.1.166) |
| Auth (GoTrue) | v2.197.0 |
| PostgREST | v16.5 |
| Storage API | v1.84.19 |
| Kong | 2.8.1 |
| Mailpit | v1.31.3 (captures every email locally) |

Realtime, Studio, Edge Runtime, analytics and the pooler were not started.

**Data:**
- **Migrations:** 0001–0024, from the repository files.
- **Users:** the 10 production user ids, recreated as real Auth users through the admin API. Emails are masked (`u-<id prefix>@example.invalid`) and every user has a throwaway test password.
- **Application rows:** the masked production export (`scripts/rehearsal/export-masked.sql`). It keeps ids, foreign keys, states and timestamps, and masks free text.

**Schema equivalence with production** (`scripts/rehearsal/catalog-summary.sql`): columns, constraints, indexes, RLS, policies, table and column grants, function grants, buckets and the realtime publication are identical. There are two expected differences:
- the comment text inside `consume_rate_limit`;
- one extra Supabase-internal storage trigger, from the newer Storage version.

## 2. Production backup procedure

**NOT APPROVED.** Nothing below was run against production. These are the exact commands, rehearsed on the isolated stack (section 3).

```bash
# On a trusted machine. DB_URL from Dashboard → Connect → Session pooler; never paste it into chat or commit it.
umask 077; mkdir -p gl-backup-$(date +%Y%m%d) && cd gl-backup-$(date +%Y%m%d)
supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
psql "$DB_URL" -c "\copy (select version, name from supabase_migrations.schema_migrations order by version) to 'migration_history.csv' csv header"
sha256sum roles.sql schema.sql data.sql migration_history.csv > SHA256SUMS
tar czf - . | gpg --symmetric --cipher-algo AES256 -o ../gl-backup-$(date +%Y%m%d).tgz.gpg
cd .. && rm -rf gl-backup-$(date +%Y%m%d)   # keep only the encrypted archive, off the repository, with restricted access
```

| File | Includes | Excludes |
|---|---|---|
| `roles.sql` | Custom roles | Supabase-managed roles |
| `schema.sql` | Schemas `public` and `private`; tables, constraints, indexes, functions, triggers, RLS policies, grants, default privileges, extensions | Supabase-managed schema definitions (`auth`, `storage` and others come with the platform) |
| `data.sql` | All rows in:<br>- `public`;<br>- `auth`: users with password hashes, identities, sessions, refresh tokens, MFA (empty), audit log;<br>- `storage`: bucket and object metadata | The two empty internal tables that `postgres` cannot write (`-x`). Without `-x` the restore fails (section 3). |
| `migration_history.csv` | The applied-migration history; 0024 is not in it (applied in the SQL Editor) | — |

**Not in any dump.** Record each of these separately:
- **Storage file bytes:** production has 0 objects today.
- **Auth dashboard settings,** from Dashboard → Authentication:
  - "Allow new users to sign up";
  - email provider and "Confirm email";
  - Site URL and redirect URLs;
  - password minimum length and requirements;
  - rate limits;
  - custom SMTP;
  - email templates;
  - JWT expiry;
  - providers.
- **Vercel environment variables (names only):**
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`;
  - `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_INBOUND_DOMAIN`;
  - `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `RESEND_INBOUND_WEBHOOK_SECRET`, `ROLE_MAILBOX_FORWARD_TO`;
  - `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `NVIDIA_REASONING_EFFORT`;
  - `YOUTUBE_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`;
  - `CRON_SECRET`;
  - `TWITCH_*`, `META_*`, `GOOGLE_SAFE_BROWSING_API_KEY`, `WHATSAPP_*`, `DISCORD_*`, `SUPABASE_WEBHOOK_SECRET`;
  - `VERIFICATION_RETENTION_DAYS`, `NEWS_MONITORING_ENABLED`;
  - `NEXT_PUBLIC_ENABLE_UI_PREVIEW` (must stay unset);
  - `PREVIEW_WRITES_ENABLED` (new; previews only).
- **Resend:** sender domain and webhooks.
- **DNS.**

**Handling:** the dumps contain password hashes, session tokens and personal data. Encrypt them, restrict access, never commit them, and delete plaintext copies.

## 3. Restore

| Item | Status | Evidence |
|---|---|---|
| Real production backup restored | **NOT APPROVED / BLOCKED** | No production backup exists. The owner must run section 2. |
| The backup commands produce a complete backup | VERIFIED | Run against the isolated stack holding production-shaped data. `data.sql` held all `auth`, `public` and `storage` tables (48 COPY blocks); `schema.sql` held 99 policy, trigger, function, RLS and grant statements. |
| Supabase's documented restore, as written | **VERIFIED: it fails** | `permission denied for table storage.buckets_vectors`. The single transaction rolled back, so the failure was safe. **Fix:** dump with `-x storage.buckets_vectors -x storage.vector_indexes`. Both tables are empty and internal. The `-x` dump was re-run and confirmed. |
| **Security finding:** the documented restore widens grants | VERIFIED | Into a fresh project, every public table got ALL for `anon` and `authenticated`: 36 table grants against 22, and 96 column grants against 29. `consume_rate_limit` also became callable by `anon`. The cause is that a fresh project's default privileges apply at CREATE time, and a dump holds only GRANTs, never REVOKEs. On a naively restored database a user could rewrite their own `role`, and 0022's server-only deal writes would be undone. **Fix:** `scripts/rehearsal/pre-restore.sql` revokes the fresh project's default privileges first; the dump then re-creates the source's ACLs and defaults exactly. |
| Restore with both fixes, into a brand-new empty Supabase stack | VERIFIED | Data, `auth.users` (password hashes included), `auth.identities` and storage buckets: **15/15 checksums identical**. Catalog: **all 12 kinds identical**. Default privileges equal production's. |
| Restored users sign in through Auth | VERIFIED | Creator, company and admin users: HTTP 200 with a session. |
| A hosted Supabase target | BLOCKED | A hosted target may differ in role permissions. The same commands and checks must be repeated there. |

## 4. Migrations 0025–0037 on the restored Supabase database

| Check | Status | Result |
|---|---|---|
| Baseline 0001–0024 state | VERIFIED | Schema matches production (section 1); data is the masked production export |
| Apply 0025–0037 in order, one transaction each, as `postgres` | VERIFIED | 13/13 applied |
| `scripts/rehearsal/post-checks.sql` | VERIFIED | **13/13 PASS:**<br>- existing rows and columns unchanged in all 12 tables;<br>- 10/10 profiles `active`;<br>- relays: 5 sent, 1 `failed_permanent`, 10 untouched, and the old failure is not claimable;<br>- RLS for creator, company and admin;<br>- taxonomy;<br>- YouTube sync columns;<br>- Get Started rows;<br>- public profile;<br>- representative least privilege;<br>- RLS on all 35 tables;<br>- the private bucket |
| Idempotency: re-apply 0024–0037, then re-check | VERIFIED | 14/14 re-applied; post-checks 13/13 |
| `supabase/verify/*.sql` | VERIFIED | 13/13 |
| `supabase/tests/*.sql` | VERIFIED | 20/20, after one test fix. `company_permissions_test.sql` assumed the database held only its own fixture creator; on production-shaped data the company directory correctly lists 5. The two assertions now count the test's own creator. The local harness still passes 84/84. |
| Grants through the real PostgREST, after migration | VERIFIED | **13/13:**<br>- anon reads no profiles;<br>- a creator reads only their own profile;<br>- a creator cannot change `role`, `account_status` or `inbound_alias`, but can change their display name;<br>- no client insert into `deal_chats` or `messages`;<br>- `consume_rate_limit` and the activation RPCs are refused to clients;<br>- a company reads no creator deals;<br>- the directory exposes no contact fields |

**Production migration method:** apply each file with `psql --single-transaction -v ON_ERROR_STOP=1 -f <file>`, or in the SQL Editor, which is the rehearsed path. **Do not use `supabase db push`.** Production's migration history uses timestamp versions while the repository files are `0001`–`0037`, so the CLI would treat every file as unapplied, or refuse until the history is repaired.

## 5. Auth with "Allow new users to sign up" off

**Settings before** (isolated stack): `enable_signup = true`, email provider on, confirmations off, minimum password length 6, `site_url = http://127.0.0.1:3000`.

**Change:** `[auth] enable_signup = false`, then restart. `GOTRUE_DISABLE_SIGNUP=true` was confirmed in the Auth container.

| Test | Status | Result |
|---|---|---|
| Public `POST /auth/v1/signup` | VERIFIED | 422 `signup_disabled` |
| Magic-link or OTP sign-up for an unknown email | VERIFIED | 422 `signup_disabled` |
| All existing users sign in | VERIFIED | 10/10, via the Auth API. Admin, creator and company also sign in through the app's `/login`. |
| Password recovery | VERIFIED | `/recover` sends the email to Mailpit (nothing leaves the machine). The link verifies (303, recovery session), and the user sets a new password and signs in. Recovery for an unknown email creates no account. |
| App-side "forgot password" | CODE REVIEW ONLY | **There is none.** The app never calls `resetPasswordForEmail` and has no recovery landing page. Recovery today means an admin resets the password, or the platform email. This is a product gap, not a sign-up regression. |
| Admin `createUser` with the service role | VERIFIED | 200. The anon key is refused on the admin API (403). |
| Server-side activation | VERIFIED | Via the real app, below. |
| Existing users not locked out | VERIFIED | 23 pages load for the existing creator, company and admin, with no redirect to `/verification` |
| YouTube OAuth | VERIFIED (start and refusal) / BLOCKED (real consent) | `/api/oauth/youtube/start` redirects (307) to Google's consent page with state and `yt-analytics.readonly`. A forged callback is refused (`oauth_error=youtube`) and stores no token. A real Google consent needs real test credentials and Google's servers; not done. |

## 6. Application workflows (real app against the isolated stack)

The app was built with the isolated stack's URL and keys; the build references neither production's Supabase URL nor its project ref. External integrations (Resend, Google, Meta, Discord, NVIDIA, Safe Browsing) are answered by a local mock (`scripts/isolated-validation/mock-externals.mjs`). Any other non-local request is blocked and recorded. Browser: Chromium via Playwright.

| Flow | Status | Result |
|---|---|---|
| Get Started (company) | VERIFIED | Accepted. `access_requests` and a `company_kyb` case were stored with no profile. **No auth user was created** (10 → 10). |
| Resume email, then the application page | VERIFIED | The email was captured by the mock and the link opens the case. |
| Case details | VERIFIED | Saved through the server action |
| Document uploads | VERIFIED | 3 PDFs stored in the private `verification-docs` bucket. A `selfie` upload on a company case was refused (400); an upload without the applicant cookie was refused (401). |
| Submit for review | VERIFIED | `submitted` |
| Reviewer gate | VERIFIED | An admin not in `verification_reviewers` gets no Approve control. A listed reviewer approves; the case is `approved` and **still no account exists**. |
| Activation | VERIFIED | The activation email was captured by the mock. The form created the auth user **with sign-up disabled** (10 → 11): profile `company`, `active`, linked to the request, request `approved`. The user lands signed in on `/onboarding`. |
| Activation replay | VERIFIED | A second visit shows no form and creates no account. |
| New account signs in again | VERIFIED | `/dashboard` |
| Company Discover | VERIFIED | Lists the existing creators |
| Chat relay (email room) | VERIFIED | One send through the relay lifecycle: `sent`, a provider id stored, 1 attempt, with an idempotency key |
| No unintended external effects | VERIFIED | Only `api.resend.com` appears, mocked, and every recipient is `@example.invalid`. No blocked call, no webhook, no payment. Nothing can leave the sandbox: Resend and the other hosts are not on its allowlist. |
| Camera capture (creator KYC) | LOCALLY VERIFIED | Earlier passes only (fake camera, `camera-capture-e2e.mjs`). Not repeated here. |
| Notifications, collaborations, briefs, content, news, relays admin, taxonomy admin | VERIFIED (pages load) | Not exercised beyond page load in this pass |

**Fixture finding, not a production bug.** The deal room crashed at first because my masking replaced `security_check` with `{}`. Production's 5 non-null rows all carry a `reasons` array (read-only check), and the room renders once the shape is kept. The component reads `security_check.reasons.length` without a guard, so a malformed row would take down the whole room. Low risk: every write path sets `reasons`. Listed as hardening, not changed (feature freeze).

## 7. Preview safety

| Item | Status |
|---|---|
| The `d6fd238` and `ae13140` preview deployments: protection, environment-variable scopes, Supabase target | **BLOCKED.** The Vercel API refuses this connection (403 list, 404 project). It needs the owner to approve team access. No deployment was deleted and no setting changed. |
| `ae13140` and later previews cannot write | LOCALLY VERIFIED | Unit tests, plus a local production build with `VERCEL_ENV=preview`: every write path answers 503, cron 401. |
| `d6fd238` preview | **Unknown.** It predates the guard. If it carries production keys and is unprotected, it can write to production. |

## 8. Remaining risks

1. No production backup exists yet, and nothing has been restored into a hosted Supabase project.
2. The `d6fd238` preview's protection and environment are unverified.
3. The isolated stack runs Postgres 17.11 against production's 17.6, a newer Storage, and local Auth. Hosted-only behaviour is unverified.
4. There is no in-app password reset.
5. Real Google OAuth consent, real Resend delivery and the real NVIDIA model were not exercised.
6. Earlier owner items stand:
   - legal text and operator details;
   - `CRON_SECRET`;
   - a verified Resend sender;
   - the identity retention period;
   - malware scanning;
   - the gated representative scopes.

## 9. Before production approval

1. **Owner:** run section 2 and keep the encrypted archive.
2. **Restore that archive** into an isolated target with the section 3 command (`pre-restore.sql` first, `-x` dump), then compare against production: `catalog-summary.sql` plus the state checksums. Either of these works:
   - this local stack: give the session the encrypted file, or run the restore yourself;
   - a hosted throwaway project.
3. On that restored copy, repeat section 4.
4. **Owner:** approve Vercel team access, or check in the dashboard, then delete or protect the `d6fd238` preview.
5. **Owner:** approve the production plan:
   - migration through `psql` per file;
   - Auth "Allow new users to sign up" off;
   - a `verification_reviewers` row;
   - environment variables.

   Then merge PR #6 and deploy.

## Recommendation

**GO** for the next production-readiness stage: the owner-run production backup, and its restore and rehearsal on an isolated target.

**NO-GO** for production migration or deployment until steps 1–4 of section 9 are done.
