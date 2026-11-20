# Identity document security and retention (2026-11-02)

## Capture

### Creator identity images

The selfie, ID front and ID back are Live Camera Capture only (`CameraCapture.tsx`):
- `getUserMedia` into an in-page `<video>`, a canvas frame and a JPEG of at most 1600 px.
- There is no file input, no gallery, no drag-and-drop and no URL field. Camera failure never falls back to an upload.
- Every failure is explained: denied, no camera, busy, insecure or unsupported. The application stays saved and can be resumed from the emailed link.

### What the camera flow is not

It is **not**:
- liveness detection;
- face matching;
- biometric verification;
- proof that a person was present.

A reviewer compares the photos by eye. The product records the method `manual_document_review` and never says "identity verified".

### Server-side checks on a camera image

| Check | Where |
|---|---|
| Must be a well-formed JPEG within 320×240 and 4096 px | `lib/verification/camera.ts` |
| No EXIF segment (a browser canvas writes none; camera apps and galleries almost always do) | `lib/verification/camera.ts` |
| Identity images must be `camera` + `image/jpeg` | Database: `verification_identity_images_are_camera` |
| An ordinary document cannot claim to be a camera image, and the reverse | `storeDocument` |

### Limitation

- The server cannot prove a frame came from a live camera.
- A determined person can strip EXIF from a gallery photo and post it to the API.
- Closing that gap needs a liveness provider, which is an owner decision (paid, biometric, legal review).

### Selfie and avatar are separate

| | Selfie | Profile avatar |
|---|---|---|
| Bucket | `verification-docs` (private) | `avatars` (public) |
| Table | `verification_documents` | `profiles.avatar_url` |
| Code path | Verification document routes | `/api/uploads/avatar` |
| Affected by public-profile visibility settings (0028) | No | Yes |

## Storage and access

| Control | Implementation |
|---|---|
| Private storage | Bucket `verification-docs`, `public = false`. It has no `storage.objects` policies, so only the service role can read or write. |
| No permanent URLs | Nothing returns a public URL. Reviewers get a **5-minute** signed URL from `viewVerificationDocument`. |
| Access audit | Every view writes a `document_viewed` event (who, when, which document type). |
| Reviewer authorization | Admin role **and** a row in `verification_reviewers`, checked in the app and in the database. The table is empty by default, so the system fails closed. Other admins see no cases (RLS) and cannot open documents. |
| No self-review | `verification_transition` refuses a reviewer acting on their own case. |
| Object names | `<case uuid>/<random uuid>.<ext>`, generated on the server. Nothing from the request reaches the path, and the database CHECK rejects anything else. Path traversal is not possible. |
| File validation | Magic bytes decide the type (never the name or declared MIME), with a 5 MB cap, an 8-file cap and the camera checks above. |
| Errors | Responses carry codes only (`type`, `too_large`, `not_camera` …), never file contents, paths or URLs. |
| Logs | `lib/log.ts` masks strings. Document events carry ids and types only. Signed URLs and tokens are never logged. |
| Applicant access | Applicants never get their documents back. The preview shown after capture is the local frame only. |

## Retention: 12 months (owner decision, migration 0040)

- **Period:** 365 days, fixed in code (`RETENTION_DAYS`, `lib/verification/retention.ts`) and in the database (`private.verification_purge_due`). There is no environment variable; changing it is a migration.
- **What is due:** the stored files of a case **decided** (approved or rejected) more than 365 days ago, by `reviewed_at`, or **abandoned in draft** for 365 days, by `updated_at`. Cases submitted, under review or waiting for information are never due.
- **Protection against early deletion:** a trigger on `verification_documents` refuses to set `purged_at` before the case is due (`retention:not_due`), whoever asks, the service role included, and a purge can never be undone (`retention:immutable`).
- **Scheduled:** `/api/cron/verification-retention` runs daily (`vercel.json`, 02:43 UTC). It needs `CRON_SECRET` and is refused on previews.
- **Sequence** (`lib/verification/purge.ts`):
  1. the database marks the row purged and returns the object name;
  2. the file is deleted from the private bucket;
  3. the deletion is confirmed.

  Unconfirmed deletions are retried on every run. A failed deletion writes `document_purge_failed` (code only). Deleting an already-missing file succeeds.
- **Audit:** the document row stays (type, size, dates, `purged_at`, `purge_confirmed_at`) with a `document_purged` event holding the document type and `retention_days: 365`. Neither holds the file or its contents.
- **Not purged:** the public avatar copied from a creator's profile photo at activation is part of the public profile, not an identity document, and is managed by the creator.
- **Production:** `CRON_SECRET` is not set there yet, so the job does not run until the owner sets it.

## Malware scanning

### Status

**Absent.** Uploads are type-checked, not scanned.

### Mitigations

- Only PDF and three image types are accepted.
- Files are never served to the applicant.
- Reviewers open them through a short-lived link in the browser's own viewer.

### Options, none activated

| Option | Cost | Notes |
|---|---|---|
| Self-hosted ClamAV (container or Supabase Edge Function calling clamd) | Free (hosting only) | Scan on upload before inserting the row; quarantine bucket. |
| Re-encode images server-side (decode + re-encode JPEG) | Free | Strips any payload from images; does not cover PDFs. Public avatars already have their metadata stripped losslessly (`lib/image-metadata.ts`), which is not a payload scan. |
| Commercial scanning API | Paid | Needs approval (rule 5). |

## Egypt PDPL (Law 151/2020) checklist, for legal review

This is not a claim of compliance.

- [ ] **Lawful basis and consent.** Is explicit consent for processing identity data and a facial image recorded? Today the applicant ticks a consent box at submission, and that box text needs legal review.
- [ ] **Sensitive data.** Is a facial image or national ID "sensitive personal data" under the law? If so, what extra consent or licence applies?
- [ ] **Licence and registration.** Does the operator need a licence or permit from the Personal Data Protection Center (PDPC) to process this data?
- [ ] **Data protection officer.** Must one be appointed?
- [ ] **Purpose limitation.** Is the stated purpose (verifying that applicants are who they claim) written in the Privacy Policy?
- [ ] **Retention period.** 12 months is decided and enforced (migration 0040). Legal review should confirm it, and whether fraud-flagged evidence may need a longer period.
- [ ] **Data subject rights.** Define a procedure for access, correction and deletion of verification data.
- [ ] **Cross-border transfer.** Supabase storage region and Resend (email) processing location: is the transfer permitted, and under what safeguards?
- [ ] **Security measures.** Does the access control and audit above meet the law's technical and organisational requirements?
- [ ] **Breach notification.** Define a procedure and the notification timeline to the PDPC.
- [ ] **Processor agreements.** Supabase, Vercel and Resend.
- [ ] **Minors.** Is age checked before processing ID data (date of birth is collected)?
