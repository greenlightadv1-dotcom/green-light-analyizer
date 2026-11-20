# Account activation flow (2026-11-02)

## Required sequence

```
Get Started
  → verification application
  → manual review
  → approval email
  → one-time activation link
  → account created
```

No Supabase Auth user and no profile exist before a reviewer approves the application.

## What was wrong before

- `/register` called `supabase.auth.signUp` before any review. A real auth user and a `pending_verification` profile existed from the first click. The flag `SELF_SIGNUP_ENABLED` kept it off by default, but the code path existed.
- Supabase's own sign-up endpoint is reachable with the public anon key whenever "Allow new users to sign up" is on in the Auth settings. That is a bypass no application code can close: see "Required production configuration".

`/register` (action, form, flag) and `/auth/confirm` were removed. `/register` now redirects to `/get-started`.

## Steps as built

| Step | Where | What happens | Account? |
|---|---|---|---|
| 1. Start | `/get-started/<journey>`, `submitAccessRequest` | Writes one `access_requests` row and one `verification_cases` row (`access_request_id`, `profile_id` NULL). Emails a resume link. The answer is identical for a new or an already-open address. | No |
| 2. Continue | `/apply/continue?token=…` | The database checks the resume token. The raw token moves into an httpOnly cookie, and the page redirects so the token leaves the URL. | No |
| 3. Complete | `/apply` and `/api/applications/documents` | Identity details, then documents (camera-only for a creator), consent, submit. Every write is scoped to the application the cookie resolves to. | No |
| 4. Review | `/admin/verification` (reviewers only) | Start review, request information (emails a fresh resume link plus the note), reject (emails the reason; revokes links), or approve. | No |
| 5. Approval email | `sendActivationLink` | A one-time activation token (48 h) is issued by `application_token_issue`. The database refuses unless the actor is a reviewer and every case is approved. A new link revokes earlier ones. No password is emailed. | No |
| 6. Activate | `/activate?token=…`, `activateAccount` | Reading the page checks the token without spending it. Submitting sets the person's own password and runs `runActivation` (below). | **Created here** |
| 7. Signed in | | The session is created and the person lands on `/onboarding`. The data from the application is already on the profile and the case. | Yes |

## Tokens

| Property | Implementation |
|---|---|
| Strength | 32 bytes from the OS CSPRNG (`randomBytes`), base64url |
| Storage | Only the SHA-256 hex digest, in `application_tokens.token_hash` (CHECK `^[0-9a-f]{64}$`). The raw token exists only in the email and the applicant's httpOnly cookie. It is never logged. |
| Expiry | Enforced by the database clock: resume 14 days, activation 48 hours (`lib/verification/tokens.ts`). Bounds are 5 minutes to 30 days. |
| Single use | `completed_at` is set inside `activation_complete`. Any later claim answers `activation:used`. |
| Replay / concurrency | `activation_claim` locks the row (`FOR UPDATE`). A second claim within 2 minutes answers `in_progress`. |
| Revocation | A new activation link revokes older ones. Rejection revokes every link. Activation revokes the rest. |
| Brute force | 256-bit tokens. Rate limit `activation` per hashed client address. 10 attempts per token, then `locked`. |
| Referrer leakage | `/apply` and `/activate` send `referrer: no-referrer`. `/apply/continue` sets `Referrer-Policy: no-referrer` on its redirect. |

## Atomicity and recovery (`lib/verification/activate.ts`)

1. **claim:** lock the token. This refuses used, expired, revoked, locked, busy and unapproved tokens.
2. **auth user:** create it (`email_confirm: true`, because the person proved the address by opening the emailed links). If a crashed attempt already created it, reuse it and set the new password.
3. **checkpoint:** record the auth user id on the token before anything else can fail.
4. **complete:** one transaction creates the profile, links the cases, marks the application approved, links a representative, writes the history and spends the token.

Failure handling:
- **Step 2 fails:** no user exists, so the claim is released and the person can retry at once.
- **Step 4 fails:** the user exists and is recorded. A retry after the 2-minute window reuses that user and completes.

One token can never produce two accounts. These paths are tested in `activate.test.ts` and `supabase/tests/verification_test.sql`.

## Entry-point audit

| Entry point | Can it create an account before approval? |
|---|---|
| `/get-started/*` (`submitAccessRequest`) | No. Writes an application and a case only. |
| `/apply`, `/apply/continue`, `/api/applications/documents` | No. Applicant only, cookie-scoped. |
| `/activate` (`activateAccount`) | Only from a token the database confirms is for a fully approved application. |
| `/register` | Removed (redirect only). |
| `/auth/confirm` | Removed. |
| `/login`, `/set-password` | No. They operate on existing accounts. |
| `/admin/users` `createUser` | Admin-only manual creation, as CLAUDE.md §4 describes. Refused for any application that has a verification case: that application can only become an account through activation. Accounts an admin creates directly do not pass KYC; whether they must is an owner decision. |
| Supabase Auth `/auth/v1/signup` with the anon key | **Open unless disabled in the Supabase project.** See below. |

A user without a profile cannot use the product: `requireProfile` finds no profile, and RLS gives a profile-less user nothing.

## Required production configuration (not changed)

1. **Supabase Auth → "Allow new users to sign up": OFF.**
   - The server creates users with the service role (`auth.admin.createUser`), which is unaffected.
   - This setting was not read or changed from here.
2. **Email sending (`RESEND_API_KEY`, sender domain):** must work, or applicants never receive resume or activation links. Step 1 reports `email_failed` rather than pretending.
3. **Supabase Auth redirect and Site URL:** no longer needed for sign-up confirmation, because nothing uses `signUp`.
4. **Reviewers:** insert at least one admin into `verification_reviewers` (service role / SQL editor), otherwise nobody can review:

   ```sql
   insert into public.verification_reviewers (admin_id, granted_by) values ('<admin uuid>', '<owner uuid>');
   ```

## Not verified

- The flow has not run against a real Supabase project or real email. It is covered by:
  - local Postgres tests of every SQL rule;
  - unit tests of the sequencing;
  - browser tests of the pages in preview mode.
- Behaviour of `auth.admin.createUser` error codes for an existing email was taken from the Supabase JS client's documented `email_exists` code, plus a message fallback. It was not observed live.
