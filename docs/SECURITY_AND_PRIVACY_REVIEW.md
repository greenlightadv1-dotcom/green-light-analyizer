# Security and privacy review (2026-11-02)

## Scope

- **Covered:** the work added on this branch since `d6b0680`:
  - email forwarding (role mailboxes);
  - message notifications (0030);
  - synced reach (0031);
  - verification and self-registration (0032);
  - avatar upload in the Media Kit;
  - G company search;
  - content-idea decisions.
- **Method:** a source review against each trust boundary, plus the automated guards listed under "Tests".
- **Not covered:** a full penetration test. Nothing was run against production.

## Boundaries and controls

| Boundary | Control | Evidence |
|---|---|---|
| Applicant ↔ other applicants' cases and documents | RLS: subject or admin only. No client writes. Upload route writes only to the caller's own case while it is `draft` or `needs_info`. | `0032_verification.sql`, `verification_test.sql` (cross-user read denied), `api/verification/documents/route.ts` |
| Applicant ↔ admin decisions | `verification_transition()` is service-role only. It checks the actor is an admin and not the subject (no self-approval), and checks the state and the required documents. | SQL tests: self-approve refused, invalid state refused, documents missing refused |
| Identity documents at rest | Private bucket and no `storage.objects` policies. Paths are `<uuid>/<uuid>.<ext>` (no user-chosen names). The type is decided by magic bytes, with a 5 MB cap. | Route, `0032_verify.sql` |
| Document viewing | Admins only, through 5-minute signed URLs. Each view writes a `document_viewed` event. URLs are never returned to the applicant. | `admin/verification/actions.ts` |
| Pending or rejected accounts | `requireProfile` redirects them to `/verification`, and `loadApiSession` answers 403. They cannot reach deals, Discover, G or uploads. | `lib/auth.ts`, `lib/api-session.ts`, guard test |
| Self-registration | Off unless `SELF_SIGNUP_ENABLED=1`. The same response for new and existing emails (no account enumeration). Password policy ≥ 10 characters with all four character classes. Rate limit `verification_write`. Accounts start `pending_verification`. | `lib/registration.ts` + test |
| Email confirmation | `/auth/confirm` uses `verifyOtp` (token hash, allow-listed types). It redirects only to fixed internal paths (`/verification` or `/login`), with no caller-supplied redirect. | Route |
| Role-mailbox forwarding | It forwards only to `ROLE_MAILBOX_FORWARD_TO`. A role mailbox as target is refused (loop guard), and `reply_to` is the original sender. No room or evaluation is created. | `role-mailbox.ts` + tests |
| Message notifications | The trigger stores ids and the kind only, never message text. In-app rooms only, so creator contact never leaves. | `message_notifications_test.sql` |
| Synced reach columns | Server-written only, with no `authenticated` grant. Cleared at 29 days. | `0031_verify.sql` |
| Avatar upload | Owner folder. The previous own object is removed. Magic bytes, 2 MB. The URL field was removed, so no arbitrary external image URLs. | `/api/uploads/avatar` |
| G search from free text | A deterministic parser; text is masked before reaching the model. Results come only from `creator_directory()` (no contact or intake columns). Invented figures are dropped. | `brief-text.test.ts`, `g` tests |

## Privacy

- **Minimisation:**
  - verification `details` holds the form fields: name, date of birth, nationality and phone for creators. No personal ID number is collected (the document image carries it). For companies, it holds the registration and tax numbers, which are business identifiers;
  - events hold ids and codes only;
  - logs go through `lib/log.ts` (masked).
- **No biometrics:** no face or liveness provider is integrated. Approval records `manual_document_review`, and the UI never says "identity verified".
- **Retention:** retention of identity documents is not yet defined. That is an owner decision with a legal input (Egypt PDPL 151/2020). Until it is decided, files stay until the case is deleted.
- **Email:** approval and rejection emails go through the existing system sender. The tests use fakes, and no real email was sent.

## Residual risks and open items

1. **Retention of verification documents:** undefined (owner and legal).
2. **No virus scanning of uploads:** magic bytes and the size cap limit the file type, not its contents. Admins should open documents in the browser viewer only.
3. **Representatives:** linked with no access to company data, which is the safe default. Scopes are not built.
4. **`ROLE_MAILBOX_FORWARD_TO`:** unset. Role mail is recorded but reaches nobody until an approved inbox is set.
5. **Durable admin audit log:** still a design ("0033 or later").
6. **Self-registration:** enabling it widens the attack surface (sign-up abuse). It needs Supabase Auth CAPTCHA or rate limits, an owner decision.

## Tests that enforce these controls

- `marketplace-guards` and `phase1-guards`: source-level authorization and isolation guards, and i18n key parity.
- `rate-limit-coverage.test.ts`: every new write path has a limit.
- `supabase/tests/*.sql` and `supabase/verify/*.sql`: run by `scripts/local-migrations-test.sh`.
