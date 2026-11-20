# Implementation test report (updated 2026-11-03)

All runs are local, on branch `claude/eager-gauss-dox9tq`.

## Automated local tests

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm test` (three runs) | **740 / 740**, **19 / 19** (email intake), **33 / 33** (OAuth callback); 0 failures |
| Typecheck | `npx tsc --noEmit` | OK |
| Lint | `npm run lint` | exit 0 |
| Production build | `npm run build` (preview on) | exit 0 |
| Migrations 0001–0037 on a throwaway Postgres, re-applying 0024–0037, plus every `supabase/tests` and `supabase/verify` file | `bash scripts/local-migrations-test.sh` | **84 / 84** |

### What the SQL tests cover (negative cases included)

| Area | Test file |
|---|---|
| Registration and activation: no account before approval; only a reviewer approves; no self-approval; documents required; camera-only identity images; activation refused before approval; older links revoked; concurrent claim refused; replay refused; expiry enforced by the DB clock; crash recovery reuses the created user; rejection closes the application; RLS (non-reviewer admin, other users, anon) | `verification_test.sql` |
| Taxonomy: seed equals the code list; parent kinds; cycles; frozen kind; unknown ids refused; deactivation keeps stored data; delete refused while in use; grants | `taxonomy_test.sql` |
| Representative scopes: least privilege; owner-only grant; gated and unbuilt scopes refused; cross-company isolation; immediate revocation; relink clears scopes; audit | `company_permissions_test.sql` |
| Uploads: owner/admin read only; hidden counts NULL | `media_kit_videos_test.sql` |
| Relay: exclusive claim; never resent once sent; backoff; permanent failure; requeue; 5-attempt cap; stale-claim recovery; no client access | `relay_lifecycle_test.sql` |

### What the unit tests cover

| Area | Test file |
|---|---|
| Token strength and shape, hash-only storage, refusal keys | `tokens.test.ts` |
| Camera JPEG checks: EXIF refused, PNG/PDF refused, truncated or corrupt refused, bounds | `camera.test.ts` |
| Activation sequencing: replay, concurrency, user-creation failure, existing email, crash recovery | `activate.test.ts` |
| Retention: off by default, bounds | `retention.test.ts` |
| Source-level guards: no `signUp` anywhere, `/register` removed, document routes never return URLs, reviewer checks | `registration.test.ts`, `rules.test.ts` |
| Permissions-Policy header | `security-headers.test.ts` |
| Taxonomy parity and rules | `taxonomy.test.ts` |
| Scope catalogue equals the SQL; actor from session | `company-access.test.ts` |
| Analytics provenance: hidden likes never 0%; uncovered windows unknown | `content-analytics.test.ts` |
| Relay idempotency with a mocked provider | `relay-lifecycle.test.ts` |
| News parsers on real payloads; host allow-list | `news.test.ts` |
| G language and fact/recommendation rules | `conversation.test.ts` |

## Mocked integration tests

- Email intake runs the real `intake.ts` against fakes.
- Relay runs against a fake provider that honours idempotency keys.
- Activation runs against an in-memory token model.
- **No real email was sent.**

## Browser tests

Chromium, against the local production build with the UI preview on.

| Suite | Result |
|---|---|
| `camera-capture-e2e.mjs`: Chromium's fake camera; real `getUserMedia` → canvas → JPEG checked with the server function; no file input anywhere; denied, missing and busy camera explained with no fallback; Arabic RTL; 390 px; activation form; `/register` redirect; bad token; upload without an application refused | **38 passed** |
| `collab-ui-e2e.mjs`: every preview page in en/ar at 1440 and 390 px, including apply, activate and Get Started; camera-only verification; Media Kit content panel | **310 passed** |
| `phase1-ui-e2e.mjs` | **206 passed** |
| `mobile-nav-e2e.mjs` | **18 passed** |
| `g-voice-e2e.mjs` (fake recognizer) | **18 passed** |
| `g-wake-e2e.mjs` | **31 passed** |

## Not tested: external services or owner configuration needed

- Real Supabase project: migrations, RLS on the real platform, Storage uploads, `auth.admin.createUser`, sign-in after activation.
- Real email delivery: resume, activation, decisions, relay, role-mailbox forwarding.
- Real camera hardware, iOS Safari, Android Chrome, Firefox.
- A live YouTube sync with the 50-upload read.
- Live news fetch from the app. The parsers were tested on payloads fetched externally on 2026-11-03, because the sandbox blocks those hosts.
- The live NVIDIA model with the new prompt rules.
- Admin pages: `/admin/taxonomy`, `/admin/relays`, `/admin/news`, `/admin/verification` and `/team` need a database and have no preview.
