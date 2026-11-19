# Registration, onboarding and trust verification

Branch `claude/eager-gauss-dox9tq`, 2026-11-19. **Not deployed.** Migration 0039 is applied to the isolated stack only.

This extends the 0032 system (applications before any account, emailed resume links, cases, camera-only identity images, reviewer allowlist, one-time activation; see `ACCOUNT_ACTIVATION_FLOW.md` and `IDENTITY_DOCUMENT_SECURITY.md`). No parallel system was added.

## Journey (all three account types)

| # | Step | Where | What is real |
|---|---|---|---|
| 1 | Choose the account type | `/get-started` → `/get-started/<journey>` | Creator, Company or Company Representative, each with its own form |
| 2 | Short application (name, email, …) | same page | Writes `access_requests` and one `verification_cases` row. **No account** |
| 3 | "Check your email" | same page | Says the link verifies the address, lasts 14 days, and links to "request a new link" |
| 4 | Email verification | `/apply/continue?token=…` | Opening the link records `access_requests.email_verified_at` and an `email_verified` history event. The token moves into an httpOnly cookie |
| 5–n | Multi-step application | `/apply` | Progress bar, "Step x of n", one short step at a time, "Save and continue". Each step saves only its own fields (`mergeDetails`). Resumes at the first incomplete step |
| last | Review and submit | `/apply` | Every field and document with Missing/Provided, Edit links, email-verified line, WhatsApp note, consent. Submit only once everything is there, behind a confirmation |
| — | Status | `/apply` | Submitted, Under review, More information needed, Approved, Not approved, with a computed journey tracker (Account type → Verify email → Application → Review → Create account) |
| — | Account creation | `/activate?token=…` | After approval only: one-time link, password, account created (unchanged from 0032) |

**Checking status later:** the sign-in page links to `/apply` ("Applied for an account? Check your application status"). An applicant has no password before approval. They enter their email and receive a fresh link. A **rejected** application now also gets a link (0039), read-only, so the person can read the reviewer's reason.

### Steps per account type

| Creator (`creator_kyc`) | Company (`company_kyb`) | Representative (`representative`) |
|---|---|---|
| Personal details: legal name, date of birth, nationality, **WhatsApp number** | Company details: registered name, registration no., tax no., country, business activity | Personal details: legal name, **WhatsApp number** |
| Public profile: main platform, handle, profile links (≤5), categories (1–3), **public profile photo** | Online presence: website, official social links (≤5), both optional | Company you represent: company name, website (optional), job title |
| Identity photos (camera only): selfie, ID front, ID back | Authorized representative: full legal name, job title, WhatsApp number | Identity photos (camera only): selfie, ID front, ID back (**new**) |
| Review and submit | Company documents: commercial register, tax card, authorization letter (+ other) | Proof of authorization: authorization letter (+ other) |
| | Review and submit | Review and submit |

## Email verification

- Supabase Auth's own confirmation flow is **not** used: no account exists before approval, and public sign-up stays off. Proof of control is opening the emailed link (32 random bytes; only the SHA-256 is stored; 14 days), the same token 0032 already used.
- The proof is now **recorded** (`email_verified_at`, event `email_verified`, compare-and-set so only the first opening counts) and **enforced** in three places:
  - the database: trigger `verification_submit_guard`, which refuses `verification:email_unverified` even against a direct service-role update;
  - the server action;
  - the review step.
- **Expired link:** a neutral page plus "email me a link". **Resend:** the same form. **Duplicate:** one pending application per address (0024 unique index); a second Get Started answers the same way and sends a fresh link. **Already verified:** reopening a link keeps the first timestamp.
- The answer never reveals whether an address has applied.
- On activation, the auth user is created already confirmed (unchanged), because the address was proven here.

## Phone

- Collected as a **WhatsApp contact number**: creator `phone`, company `contact_phone`, representative `phone`.
- Validated for shape and stored without spaces or dashes.
- **No OTP, no SMS, no paid verification.** The applicant is told so on the field and on the review step, and the reviewer sees "not verified (no OTP or SMS in this phase)".

## Creator KYC

- **Private details** (legal name, date of birth, nationality, WhatsApp) live in the case and are seen only by reviewers.
- **Public profile:**
  - fields: main platform (YouTube, Twitch, Kick, Instagram, TikTok, X), handle, profile links, categories (from `CONTENT_CATEGORIES`, max 3);
  - the public profile photo is a separate document type, `profile_photo`. It is uploaded (not camera), image-only and ≤ 2 MB. It is required for an application only; an existing account manages its photo in its profile.
- **Private identity images:** selfie, ID front, ID back, captured by the in-page camera only, as before. They are never public.
- **At activation** (`carry-over.ts`, best effort):
  - the photo is copied from the private bucket into the public `avatars` bucket through the normal avatar checks;
  - the main handle and the categories go to `profiles.social_links` / `creator_categories`;
  - identity images and legal details are never copied.
- **Portfolio visibility** is untouched: items stay private until the creator chooses (0028).
- **Review:** manual. No face matching and no liveness check, and the product never says "identity verified".

## Company KYB

- Company details, business activity, optional website and social links.
- The authorized representative's full name, job title and WhatsApp number.
- Commercial register, tax card and authorization letter are required (the database enforces this, as in 0032). Review is manual.

## Representative authorization

- **New:** a representative now also provides camera identity images (selfie, ID front and back); the database requires them.
- **Typing a company name grants nothing.** Approval (`verification_transition('approve')`) requires the reviewer to choose an existing company account explicitly (`verification:company_required`). It then writes `company_members`, attributed to the reviewer and recorded in the history.
- **Even then, the link grants no data:** the company itself must grant scopes at `/team` (0034). Financial and contractual scopes stay refused.
- The reviewer page says this next to the typed company name.

## Status lifecycle

| Status (DB) | Applicant sees | Access |
|---|---|---|
| no `email_verified_at` | "Check your email" / "not verified yet" | Cannot submit |
| `draft` | The wizard | Can edit |
| `submitted` / `under_review` | "Submitted for review" / "Under review", no promised time | Read-only |
| `needs_info` | The reviewer's request plus a computed "still missing" list; the wizard reopens; "Send for review again" | Can edit; history kept |
| `approved` | Application: "we emailed a one-time link". Account: "approved after a manual review" | Activation link / active account |
| `rejected` | "Not approved" plus the reason the reviewer typed (labelled for them as shown to the applicant) | Read-only; no activation. A rejected **account** is `account_status='rejected'`, confined to `/verification` by `requireProfile`, and refused by `loadApiSession` (403) |

**"Within 24 hours":** nothing in the product guarantees or schedules it. The copy now says the team reviews by hand and emails at a decision or a request, and promises no time. Restoring a time commitment is an owner decision.

## Admin review (`/admin/verification`, reviewers only)

Already present, unchanged:
- queue;
- per-case details;
- documents through 5-minute signed links, each view logged;
- start review, approve, request information, reject (note required);
- the activation link;
- history with the actor's name and time;
- `verification_reviewers` allowlist, and no self-review.

Added:
- **Trust checks:**
  - email verified (time) or not;
  - WhatsApp not verified;
  - for representatives, that the typed company grants nothing.
- **Possible duplicates (signals, not decisions):**
  - another case with the same WhatsApp number;
  - for creators, the same legal name and date of birth;
  - for companies, the same registration number or the same tax number;
  - other applications from the same email.
- **"Still missing":** fields and documents.
- **Labels saying which notes the applicant sees.** Every reviewer note (approve, request information, reject) is shown or emailed to the applicant. There is no internal-only note.

**Admin-created accounts:** a creator or company created at `/admin/users` now starts as `pending_verification`, confined to `/verification` after the forced password change. Creators get a `creator_kyc` case opened; companies choose company or representative there. Admin accounts stay `active`. Existing accounts are **not** changed.

## Database (0039, isolated stack only)

- `access_requests.email_verified_at`.
- Document type `profile_photo`, constrained to an image upload.
- Event `email_verified`.
- Trigger `verification_submit_guard` (security definer, not executable by clients) enforces:
  - an application's email is verified;
  - a representative has selfie, ID front and ID back;
  - a creator application has a profile photo.
- `application_token_issue` / `application_token_lookup`: a resume link may be issued and used for a rejected application (read-only).
- No grant changes; RLS unchanged. Rollback is in the migration header.

## Security summary

- **Email and documents:**
  - email verified before submission, enforced in the database;
  - document URLs never leave the reviewer action (unit-guarded);
  - type by magic bytes; the public photo is image-only and size-capped.
- **Representatives:** an association needs explicit reviewer approval of an existing company, then company-granted scopes.
- **Separation of data:** identity images and private details are never copied to the profile.
- **Abuse limits:** rate limits unchanged (`access_request`, `activation`, `application_write`, `upload`); a rejected application cannot be edited or activated.
- **Duplicates** are surfaced to reviewers, never auto-decided.

## Evidence

- `bash scripts/local-migrations-test.sh`: **92 / 92**, including `supabase/tests/registration_trust_test.sql` (new), the updated `verification_test.sql`, idempotent re-apply of 0039, and `0039_verify.sql`.
- Unit tests: **787 + 19 + 33**, including new `rules`, `duplicates` and `public-profile` tests.
- `scripts/isolated-validation/registration-smoke.mjs`: **9 / 9** on a production build against the isolated stack (run with `APP_URL=http://localhost:3200`). It found and fixed one real bug: a saved step did not advance.
- **Not exercised:**
  - the camera in a browser (identity rows were seeded);
  - activation and its photo/handle carry-over;
  - the company and representative wizards in a browser;
  - the earlier browser suites, axe and keyboard checks after these changes.

  These are part of the deferred testing phase.

## Update 2026-11-19: notes, reapplication, photo metadata, retention (migration 0040, isolated stack only)

Owner decisions applied:
- no account before approval (unchanged);
- separate internal and applicant-facing notes;
- reapplication after rejection, with enhanced review for fraud;
- EXIF/GPS removal from public photos;
- 12-month retention.

### Reviewer notes, two kinds

| | Applicant-facing | Internal |
|---|---|---|
| Stored in | `verification_cases.info_request` / `decision_reason` (unchanged) | `verification_notes` (new table) |
| Who reads it | The applicant (their own case, RLS) and reviewers | Reviewers only, through RLS. The case's subject never, even if they are a reviewer |
| Written by | `verification_transition()` | `verification_add_note()` / `verification_flag()`: service-role only; each checks the reviewer allowlist and refuses self-review |
| Email | Yes (decision, information request) | Never |
| History (`verification_events`, readable by the applicant) | Events as before | **No event at all**, so not even the existence of a note leaks |
| Direct writes | n/a | No INSERT, UPDATE or DELETE for anyone, the service role included (append-only) |

The reviewer page reads notes with the reviewer's own session, so RLS applies, and labels each field "shown to the applicant" or "reviewers only". Every decision form has an optional internal-note field, written before the decision.

### Reapplication and enhanced review

- **Ordinary rejection:**
  - an applicant without an account starts a new application. The rejected one stays read-only, with a "Start a new application" link;
  - a rejected **account** can open a new case at `/verification` (`verification_reapply()`). The account moves from `rejected` to `pending_verification`, still confined, and becomes `active` only when a reviewer approves the new case;
  - the old case and its history are kept;
  - the one-open-case-per-kind rule now ignores rejected cases.
- **Missing information:** the existing "more information needed" workflow, unchanged.
- **Suspected fraud, identity forgery or impersonation:**
  - a reviewer flags the case (`verification_flags`, reviewers only), and an explanation is required, stored as an internal note;
  - the flag changes nothing by itself: no status change, no ban, nothing sent to the applicant;
  - approving the flagged case, or any later case from the same email, is refused by the database (`verification:enhanced_review_note_required`) until the approving reviewer writes an internal justification note after the flag. The flag's own explanation does not count;
  - the queue and the case page mark these cases "enhanced review";
  - rejecting or requesting information needs nothing extra.

### Public photo metadata

- **What is stripped:** `lib/image-metadata.ts` removes EXIF (including GPS, make, model and dates), XMP, IPTC, comments, PNG text and time chunks, and data after the image end, losslessly. Pixels are copied byte for byte.
- **Orientation:** a rotated JPEG keeps only a minimal orientation tag, so photos are not shown sideways.
- **Where it applies:** every public avatar upload (`storeUpload("avatar")`), which includes the copy made at activation from the private `profile_photo`. A file it cannot parse is refused, never published as-is.
- **What is untouched:** the original stays in the private verification bucket for the reviewer, and identity and company documents are never altered.
- **Verified with an independent reader:** `scripts/isolated-validation/exif-strip-check.py` (Pillow, real JPEG, PNG and WebP; GPS gone, pixels identical), and through the real avatar route on the isolated stack.

### Retention

See `IDENTITY_DOCUMENT_SECURITY.md`, *Retention: 12 months*. In short:
- the database refuses to purge before 365 days;
- a daily scheduled job (needs `CRON_SECRET`) deletes due files, audits each purge without its contents, and records and retries failures.

### Evidence

| Check | Result |
|---|---|
| `scripts/local-migrations-test.sh` | **96 / 96**, including `supabase/tests/review_notes_flags_retention_test.sql` and `0040_verify.sql` |
| Unit tests | **799 + 19 + 33**, including `image-metadata`, `purge`, `retention` and `notes-separation` (applicant code never touches notes or flags; internal notes never reach email, logs or history) |
| `scripts/isolated-validation/review-retention-check.mjs` | **3 / 3** against the real isolated services: real storage purge (366 days deleted, 300 kept, early purge refused, audited once, unauthorized calls refused); notes and flags through the real PostgREST (subject and company read nothing, reviewer reads, direct inserts and RPCs refused); a GPS JPEG through the real avatar route published without GPS (confirmed again with Pillow on the exact public bytes) |
| `exif-strip-check.py` | **4 / 4** |
| `registration-smoke.mjs` | **9 / 9** (no regression) |

The isolated run also found and fixed a real bug: the purge looked for decided cases by `updated_at` instead of `reviewed_at`, so a case touched after its decision would never have been purged.

## Owner decisions

1. **Terms §2 and accounts before approval.** The Terms say every account is created by the team after review, so applicants have no password before approval and track their status by emailed link. If applicants must sign in with a password *before* approval, Terms §2 must change first (separate approval).
2. **Existing active accounts:** whether to require verification of accounts created before this change (none are flipped today).
3. **Review-time commitment:** whether to promise a time (for example, "an email within 24 hours"), which needs a staffed process and working Resend in production.
4. ~~Re-application after rejection~~: decided and implemented (0040). Enhanced review is linked by email only: a flagged person reapplying with a different email is caught only by the reviewer-visible duplicate signals (phone, name and date of birth, registration or tax number), not by the database rule.
5. ~~Internal reviewer notes~~: done (0040).
6. **12-month retention:** decided and implemented (0040). It runs in production only once `CRON_SECRET` is set. Legal review should confirm the period, including whether evidence from fraud-flagged cases may need longer. Nothing claims legal compliance.
7. **Privacy Policy:** the public photo, the WhatsApp number and duplicate signals may need a sentence. Not changed without approval.
8. **Kick handles** have no `social_links` slot, so a Kick creator's handle stays private after activation.
9. ~~EXIF on the public photo~~: stripped (0040). Images are not re-encoded, so this is metadata removal, not a malware scan.
