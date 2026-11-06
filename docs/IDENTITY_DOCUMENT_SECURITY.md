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

## Retention (owner and legal decision)

### Current behaviour

- Documents stay until the case or application is deleted. A removed or retaken document is deleted from the bucket at once, and its row keeps `removed_at`.
- No period is assumed.

### Architecture built

- `VERIFICATION_RETENTION_DAYS` (7–3650; unset means off) and `lib/verification/retention.ts`.
- The route `/api/cron/verification-retention` (needs `CRON_SECRET`) deletes files of decided or abandoned cases older than the period. Cases awaiting review are never touched.
- Each deletion leaves the row and a `document_purged` event.

### Not done

- The route is **not** registered in `vercel.json`, and no period is set. Both are owner decisions.

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
| Re-encode images server-side (decode + re-encode JPEG) | Free | Strips any payload from images; does not cover PDFs. |
| Commercial scanning API | Paid | Needs approval (rule 5). |

## Egypt PDPL (Law 151/2020) checklist, for legal review

This is not a claim of compliance.

- [ ] **Lawful basis and consent.** Is explicit consent for processing identity data and a facial image recorded? Today the applicant ticks a consent box at submission, and that box text needs legal review.
- [ ] **Sensitive data.** Is a facial image or national ID "sensitive personal data" under the law? If so, what extra consent or licence applies?
- [ ] **Licence and registration.** Does the operator need a licence or permit from the Personal Data Protection Center (PDPC) to process this data?
- [ ] **Data protection officer.** Must one be appointed?
- [ ] **Purpose limitation.** Is the stated purpose (verifying that applicants are who they claim) written in the Privacy Policy?
- [ ] **Retention period.** Set `VERIFICATION_RETENTION_DAYS` accordingly.
- [ ] **Data subject rights.** Define a procedure for access, correction and deletion of verification data.
- [ ] **Cross-border transfer.** Supabase storage region and Resend (email) processing location: is the transfer permitted, and under what safeguards?
- [ ] **Security measures.** Does the access control and audit above meet the law's technical and organisational requirements?
- [ ] **Breach notification.** Define a procedure and the notification timeline to the PDPC.
- [ ] **Processor agreements.** Supabase, Vercel and Resend.
- [ ] **Minors.** Is age checked before processing ID data (date of birth is collected)?
