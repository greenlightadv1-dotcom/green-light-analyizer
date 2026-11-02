# Creator KYC: implemented specification (2026-11-02)

This describes what the code does. Everything is on the development branch and **not deployed**. Migration 0032 is **not applied** to any database.

> **Updated 2026-11-02 (follow-up pass).**
> - Verification now happens **before an account exists** (docs/ACCOUNT_ACTIVATION_FLOW.md).
> - The identity images are **camera-only** (docs/IDENTITY_DOCUMENT_SECURITY.md).
>
> The sections below were updated to match. Self-registration was removed.

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

- **Types:** `selfie`, `id_front`, `id_back`. All three are captured with the device camera in the page (`CameraCapture`): no file picker, gallery, drag-and-drop or URL. Passport and "other" uploads are no longer accepted for a creator.
- **Required to submit:** all three. This is enforced by `verification_transition()` in the database and mirrored in `lib/verification/rules.ts`, where a test pins the two together. The database also requires each of these to be `capture_method = 'camera'` and JPEG.
- **Storage:**
  - private bucket `verification-docs`, 5 MB limit;
  - PDF, JPEG, PNG or WebP, decided by the file's own bytes (`sniffType`);
  - path `<case uuid>/<random uuid>.<ext>`;
  - at most 8 live documents per case.
- **Upload** (`/api/applications/documents` before an account exists, cookie-scoped; `/api/verification/documents` for an existing account):
  - only to the caller's own case, and only while it is `draft` or `needs_info`;
  - camera images must be well-formed JPEGs with no EXIF, within dimension bounds (`lib/verification/camera.ts`);
  - a retake replaces the earlier image of the same kind;
  - the route never returns a URL;
  - removal marks the row removed and deletes the object.
- **Viewing:**
  - verification reviewers only (an admin listed in `verification_reviewers`), through a **5-minute** signed URL issued by `viewVerificationDocument`;
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
- **Approving an application** (no account yet) emails a one-time activation link. The account is created only when the applicant uses it.
- **Approving an existing account's case** sets a pending account `active`, as before.
- **Rejecting** closes the application and revokes its links.
- Only a verification reviewer decides. Other admins are refused by the database.

## Applicant experience (`/apply`, and `/verification` for existing accounts)

- `/apply` is reached from the emailed link. It shows who is applying, the steps, the details form, three camera slots (each with why it is needed, how to take it, preview, retake and confirm), the documents still missing, a consent box, a confirmed submission, and the history.
- A denied or missing camera is explained, and the page never falls back to an upload. The application stays saved and the emailed link resumes it on another device.
- `/verification` uses the same editor for an existing account.
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

## Retention (owner and counsel to set)

- A configurable purge job exists (`VERIFICATION_RETENTION_DAYS`, `/api/cron/verification-retention`). It is off until a period is set, and it is not scheduled.
- Until then documents stay until the case is deleted. See docs/IDENTITY_DOCUMENT_SECURITY.md.

## Rollout (needs owner approval)

1. Apply migration 0032.
2. In Supabase Auth, turn **off** "Allow new users to sign up". Accounts are created only by the server after approval.
3. Grant at least one admin review access (`verification_reviewers`).
4. Update Terms §2 to describe this sequence: the team approves every application, and the applicant then creates their account from the approval email.
5. Set the retention period and add it to the Privacy Policy.
