# Creator KYC: implemented specification (2026-11-02)

This describes what the code does. Everything is on the development branch and **not deployed**. Migration 0032 is **not applied** to any database.

## What it is, and what it is not

- **It is:** collection of identity details and identity document images, stored privately, then reviewed manually by a Green Light admin. Approval records `method = 'manual_document_review'`.
- **It is not:**
  - a face match;
  - a liveness check;
  - a check against a government database.

  No identity-verification provider is integrated. The UI never says "identity verified". It says "Documents reviewed and approved by our team. This is a manual document review, not a biometric identity check." The `provider` method is reserved, and the database refuses it without a provider reference.

## Data collected (`verification_cases.details`)

| Field | Required | Validation | Re-used from |
|---|---|---|---|
| `legal_name` | yes | ≤ 120 chars | `profiles.full_name` (offered, editable) |
| `date_of_birth` | yes | real date, past, ≥ 1900 | — |
| `nationality` | yes | ISO 3166-1 alpha-2 | `profiles.country` |
| `phone` | yes | `+` and 7–19 digits/spaces/dashes | — |

Rules for pre-filled values:
- A value already saved on the case always wins over the profile value.
- Pre-filled values are shown with a notice and are never treated as verified.
- No full ID number is stored; the document image holds it.

## Documents

- **Types:** `id_front`, `id_back`, `passport`, `other`.
- **Required to submit:** `id_front` **or** `passport`. This is enforced by `verification_transition()` in the database and mirrored in `lib/verification/rules.ts`, where a test pins the two together.
- **Storage:**
  - private bucket `verification-docs`, 5 MB limit;
  - PDF, JPEG, PNG or WebP, decided by the file's own bytes (`sniffType`);
  - path `<case uuid>/<random uuid>.<ext>`;
  - at most 8 live documents per case.
- **Upload** (`/api/verification/documents`):
  - only to the caller's own case, and only while it is `draft` or `needs_info`;
  - the route never returns a URL;
  - removal marks the row removed and deletes the object.
- **Viewing:**
  - admins only, through a **5-minute** signed URL issued by `viewVerificationDocument`;
  - each view writes a `document_viewed` event.

## States

```
draft ──submit (subject; required documents present)──▶ submitted
submitted ──start_review (admin)──▶ under_review
submitted | under_review ──request_info (admin, note required)──▶ needs_info ──submit──▶ submitted
submitted | under_review ──approve (admin)──▶ approved
submitted | under_review | needs_info ──reject (admin, reason required)──▶ rejected
```

- Every transition runs in `verification_transition()`: SECURITY DEFINER, `service_role` only. The function:
  - locks the case row;
  - checks the actor (the subject may only submit; an admin may not decide their own case);
  - writes the history row in the same transaction.
- **Approving** a pending self-registered account sets `profiles.account_status = 'active'`.
- **Rejecting** one sets `'rejected'`.
- Existing admin-created accounts are `active` by default and are unaffected.

## Applicant experience (`/verification`)

- The page sits outside the app shell. A pending or rejected account is redirected here from every app page (`requireProfile`), and every API answers 403 `pending_verification`, except this page's own upload route.
- It shows: status, the team's request, the details form, the drag-and-drop uploader with progress, the required documents still missing, a consent box, a confirmed submission, and the history.
- It says the team **aims** to review within 24 hours, which is not a guarantee.

## Emails

- On approve, reject or request-info, `notifyDecision` sends a system email through the existing Resend helper to the account's own address. A failure is logged and never undoes the decision.
- The approval email states:
  - there is no subscription fee;
  - the 10% commission on completed deals is settled manually;
  - nothing is charged automatically.

  No price is invented. The wording is pending owner review (PENDING_OWNER_DECISIONS item 13).
- Tests check the template and never send.

## Face and liveness: provider evaluation (not integrated)

The existing research in `docs/GREEN_LIGHT_VERIFICATION_AND_ONBOARDING.md` §3.3 still applies. It covers Didit, Veriff, Sumsub and Uqudo; for Valify (Egypt) it says only "Not researched". Didit publishes a free tier (500/month) and a $0.33 core-KYC price.

None of the following was re-verified in this pass:
- Egypt availability per provider beyond the published coverage tables;
- data residency;
- DPA terms;
- certifications.

Egypt's Personal Data Protection Law (No. 151 of 2020) treats biometric data as sensitive. Whether processing it needs a licence or registration is a question for counsel. **Integrating a provider needs owner approval and a legal opinion first**, so the system stays on manual review.

## Retention (not implemented; owner and counsel to set)

- No deletion job exists yet. Documents stay until the case or account is deleted (cascade), and the storage object must then be removed by the server.
- A retention period (for example, delete documents N days after a decision) must be set and published in the Privacy Policy before launch.

## Rollout (needs owner approval)

1. Apply migration 0032.
2. Decide D2: keep admin-created accounts only (today), or enable self-registration. For self-registration:
   - set `SELF_SIGNUP_ENABLED=1`;
   - enable email sign-ups and "Confirm email" in Supabase Auth;
   - set the email confirmation template's link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`;
   - update Terms §2, which currently says the team creates every account.
3. Set the retention period and add it to the Privacy Policy.
