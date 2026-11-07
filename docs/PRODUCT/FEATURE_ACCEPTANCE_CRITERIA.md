# Feature acceptance criteria (2026-11-07)

These criteria apply to the items in `ONE_MONTH_COMPLETION_ROADMAP.md`, by ID.

**Every item must also pass:**
- `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build`;
- `scripts/local-migrations-test.sh` (when SQL changed);
- CI on the branch.

**No item may:**
- touch production;
- apply a migration remotely;
- send real email;
- call a paid service;
- change a commercial rule.

**"Verified" means** the stated check ran in the real app against the isolated Supabase stack (`scripts/isolated-validation/`), with external calls mocked, unless the item says otherwise.

## P0

**P0-1: Password reset**
1. The login page shows "Forgot password?". It opens a form that accepts an email.
2. Unknown and known emails get the same message and the same response time class. The request is rate-limited, and the limit is in `rate-limit-coverage.test.ts`.
3. A recovery email goes only to an existing account; in the isolated stack it is captured by Mailpit.
4. The link lands on a page that sets a new password under the same rules as activation (10+ characters, mixed types). Afterwards the user is signed in and the old password fails.
5. A used or expired link shows a neutral error and offers to send a new one.
6. All copy is in all 5 dictionaries, with RTL correct.
7. A source guard test: no `signUp` call, and no recovery path that creates an account.

**P0-2: Deal room resilience**
1. A deal whose `security_check` or `company_profile` is `{}`, null, or the wrong type renders the room, the chat and the composer. The intelligence panel hides or degrades.
2. A unit test covers each malformed shape.
3. Rerunning the isolated flow 4 with the original masked fixture (`security_check = {}`) passes.

**P0-3: Email notifications**
1. Each listed event sends exactly one email to the other party, and none to the actor:
   - invitation received;
   - invitation accepted or declined;
   - terms confirmed;
   - deliverable submitted or reviewed;
   - collaboration completed;
   - new message in an in-app room, debounced to one per room per window.
2. The email contains no message text, amounts or contact details, only the event and a link into the app. A test asserts this.
3. A muted category sends nothing.
4. Each send carries an idempotency key, and a retried send does not duplicate (mock provider check).
5. A failed send is recorded and never blocks the in-app action.
6. The mock outbox shows only `@example.invalid` recipients in tests.

**P0-4: Comparison view**
1. A company can select 2–4 creators from Discover or a shortlist and open a side-by-side table.
2. Every value shows its provenance (verified, synced, self-reported, missing) and its freshness date. Verified geography older than 30 days is not shown as verified.
3. No contact or intake field appears; the data comes from `creator_directory()` only.
4. A creator and a non-company are refused on the server.
5. It works with NVIDIA disabled.
6. It is usable at 390 px, and in Arabic RTL.

**P0-5: G without the model**
1. With `NVIDIA_API_KEY` unset, G still offers at least one proposal type relevant to the page:
   - **content draft** for a creator;
   - **invitation** for a company with a published brief;
   - **message draft** in a collaboration.
2. Each proposal is labelled "template".
3. Template proposals pass `allowedProposals`, grounding and masking.
4. They execute only after `ConfirmActionForm` confirmation, through the ordinary server action.
5. Unit tests cover each role, plus the refusal of ids that are not the caller's.

**P0-6: Journey runs**
Flows 5–8 pass on the isolated stack, re-run after each P0 item:
- **Flow 5:** a company publishes a brief and invites a creator; the creator accepts; a deal room opens in `negotiating`; both confirm terms; the room becomes `agreed`; a deliverable is submitted, sent back for revision, resubmitted and approved; the company completes. Every step's `collaboration_events` row exists, both parties got in-app (and, after P0-3, email) notifications, and no third party can read any of it (REST check).
- **Flow 6:** a creator edits the media kit; hides a section; the hidden section is absent from `/p/<slug>` for a signed-out visitor; the portfolio stays off by default; a brand is named only with consent.
- **Flow 7:** a reviewer rejects one application and requests info on another; each applicant gets the right email (mock); the request-info applicant resumes, edits, resubmits and is approved; `verification_events` records every step with its actor.
- **Flow 8:** a creator applies; captures a selfie and both ID sides with Chromium's fake camera; submits; is approved; activates; reaches the dashboard. The server rejects a non-camera or EXIF-bearing upload.

**P0-7: Support channels**
1. `/admin/system` shows whether the role-mailbox route is configured, without its value.
2. An owner-run check: mail to `support@` arrives in the operator inbox. Recorded as owner-verified, with the date.
3. The Discord invite resolves, and has no expiry and no use limit (owner check).
4. The WhatsApp number answers within the published hours (owner check).
5. Until each check passes, the Support page shows no claim that the channel is staffed.

**P0-8: Owner decisions**
Each of (a)–(d) is recorded in `PENDING_OWNER_DECISIONS.md` with the decision and its date, and the code follows it. No decision is guessed.

## P1

| ID | Accepted when |
|---|---|
| P1-1 | Unread counts are correct for both parties after send, read and reload. The read state is own-rows-only under RLS (REST test). The migration is idempotent and passes the local harness. |
| P1-2 | The test matrix is recorded with device, browser, OS and the result for each: camera grant, deny, missing and busy; selfie and ID capture; voice start, stop, interrupt and mute; wake phrase. Every failure is fixed or documented with a fallback message. |
| P1-3 | axe reports no serious or critical issue on every page in the e2e suites (en/ar, 390/1440). All 8 journeys complete with the keyboard alone. Dialogs trap focus and restore it. |
| P1-4 | No horizontal overflow at 390 px on the DB-backed pages. Screenshots are archived from the isolated flows. |
| P1-5 | Every admin action listed in the design writes one append-only row (actor, action, target, time, no personal data). A non-admin cannot read them (REST). An admin view lists them. |
| P1-6 | **Only after the owner decides.** A representative with `briefs.create` or `collaborations.access` can do exactly that on behalf of the company. Every action records the acting member. Revocation is immediate. Financial and contractual scopes stay refused (SQL tests extended). |
| P1-7 | **Only after the retention decision.** Export returns only the user's own data. Deletion removes OAuth tokens, storage objects and personal fields, keeps legally required records anonymised, requires confirmation and an admin step, and is covered by SQL tests. |
| P1-8 / P1-9 | Counts are fetched from the official API with credentials, labelled *synced* (never *verified*), cleared after 29 days, and failures are logged and never block a save. |
| P1-10 | Each new source is official, free, terms-reviewed, owner-approved, on the host allow-list, and parsed from a real payload in tests. |
| P1-11 | One real sync on the isolated stack stores top content, cadence and verified geography with the right provenance. The consent-screen status is recorded. |
| P1-12 | An identity JPEG is re-encoded server-side, and its stored bytes differ from the upload while it stays a valid camera JPEG. A PDF with JavaScript or embedded files is refused. Tests cover both. |
| P1-13 | 30 benchmark prompts run once; the language-match rate and grounding failures are recorded; no user data is used. |

## Definition of "feature complete" (the freeze gate)

- All of P0 is accepted, and each decided P1 item is accepted. Undecided P1 items are moved to P2 with their impact noted.
- All 8 journeys in `FEATURE_COMPLETION_AUDIT.md` pass in the real app on the isolated stack.
- CI is green on the branch head.
- No open BROKEN item remains in the audit.
