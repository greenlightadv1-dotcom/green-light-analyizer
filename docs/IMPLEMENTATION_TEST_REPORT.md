# Implementation test report (2026-11-02)

All runs are local, against code at `e39fdcd`. The commits after it are docs only.

## Results

| Check | Command | Result |
|---|---|---|
| Unit tests (main suite) | `npm test` (1st run) | **685 / 685 pass**, 0 fail |
| Email intake tests (real `intake.ts`, in-memory fakes) | `npm test` (2nd run) | **19 / 19 pass** |
| OAuth callback tests | `npm test` (3rd run) | **33 / 33 pass** |
| Typecheck | `npx tsc --noEmit` | OK |
| Lint | `npm run lint` | exit 0 |
| Production build | `npm run build` | exit 0 |
| Migrations 0001–0032 on a throwaway Postgres, plus `supabase/tests` and `supabase/verify` | `bash scripts/local-migrations-test.sh` | **65 / 65 checks pass** |
| Browser: collaboration, verification, register, G proposals (en/ar, 1440/390 px) | `scripts/collab-ui-e2e.mjs` | **267 pass** |
| Browser: phase-1 UI (confirmations, loading, i18n) | `scripts/phase1-ui-e2e.mjs` | **206 pass** |
| Browser: mobile navigation | `scripts/mobile-nav-e2e.mjs` | **18 pass** |
| Browser: G voice (fake recognizer) | `scripts/g-voice-e2e.mjs` | **18 pass** |
| Browser: G wake phrases | `scripts/g-wake-e2e.mjs` | **31 pass** |

The browser suites ran in Chromium against a local production build, using `/preview/*` pages with mock data.

## Added in this pass

| Area | Tests |
|---|---|
| Role mailboxes | `role-mailbox.test.ts`; 3 intake cases (forwarded, unrouted, loop refused) |
| Message notifications | `supabase/tests/message_notifications_test.sql`, `verify/0030_verify.sql` |
| Synced reach | `engagement.test.ts` (hidden likes, median), `youtube-freshness.test.ts`, `verify/0031_verify.sql` |
| Verification | `verification/rules.test.ts`; `supabase/tests/verification_test.sql`: no self-approval, documents required, cross-user read denied, state machine, representative link; `verify/0032_verify.sql` |
| Registration | `registration.test.ts` (flag, parsing, password policy) |
| Company search | `brief-text.test.ts` (English, Arabic, Arabic digits, merge) |
| Rate limits | `verification_write` coverage entry |

## Not tested (and why)

- **Against a real Supabase project:**
  - the admin verification pages;
  - the email-confirmation flow;
  - real document uploads to Storage.
  These need the migrations applied to a project, which requires approval.
- **Live provider APIs:** live YouTube, Instagram, NVIDIA and Resend calls (no live calls in this pass).
- **Real-world voice:** real microphones, Safari, Firefox and Edge.
- **AI content quality:** the quality of G's ideas and scripts with the live model.
