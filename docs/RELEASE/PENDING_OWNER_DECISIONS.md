# Pending owner decisions

Only items that need the owner. Nothing here has been changed or invented.

## 1. Legal publication and commission effective dates (blocks release)

- **Now:** `LEGAL_LAST_UPDATED = "31 October 2026"` (`src/lib/constants/legal.ts:76`) and `COMMISSION_EFFECTIVE_DATE = "2026-10-31"` (`src/lib/plans.ts:35`).
- **Rule:** CLAUDE.md §8 says both must equal the day the new Terms are published. That day has passed without publication.
- **Needed:** the actual publication date (and legal review of the Terms).
- **Then:** a one-line code change to both constants, and the release.
- **Unchanged:** pre-existing agreed or earned deals keep their terms.

## 2. Legal operator details (blocks release)

- **Now:** `ENTITY_REGISTERED_NAME`, `ENTITY_ADDRESS` and `ENTITY_REGISTRATION` are empty (`legal.ts:36,44,51`).
- **Owner's statement:** these will be prepared this month.
- **Until then:** they stay empty and are reported as a blocker. They are never invented.

## 3. `CRON_SECRET` in Vercel Production (privacy; strongly recommended before release)

- **What it controls:** the daily job deletes YouTube data at 29 days, as the Privacy Policy promises and YouTube API policy III.E.4 requires. It now also prunes growth snapshots.
- **Without it:** the job answers 401 and deletes nothing.
- **Status:** the live value was not verified; CLAUDE.md §16 recorded it missing on 31 October.
- **Action:** the owner sets a 16+ character value in Vercel → Production, then redeploys.

## 4. Durable audit trail for admin actions (design ready, not implemented)

**Problem**

- Violation bans and dismissals, application rejections and representative unlinks leave no append-only record.
- `violation_logs.reviewed_*` is editable by admins through the database API (0006, lines 60–66), and doesn't record whether the outcome was a ban or a dismissal.
- An unban clears `profiles.banned_*`.
- The server log line is temporary.

**Proposed migration (not written; it takes the next free number when approved, since 0026–0030 are now used)**

1. Extend `admin_actions.action` CHECK with `violation_ban`, `violation_dismiss`, `application_reject` and `representative_unlink`. Add a nullable `subject_id uuid` (the violation, application or member id). Update the table comment, which today scopes it to `/admin/users`.
2. Add `SECURITY DEFINER` functions, executable by `service_role` only, that do the change and the audit insert in **one transaction**:
   - `admin_ban_from_violation(p_admin, p_target, p_log)`;
   - `admin_dismiss_violation(p_admin, p_log)`;
   - `admin_reject_application(p_admin, p_request)`;
   - `admin_unlink_representative(p_admin, p_member)`;
   - `admin_set_ban(p_admin, p_target, p_reason, p_ban boolean)`, which also fixes the non-atomic ban/unban audit (M3).
3. Revoke the `authenticated` UPDATE grant on `violation_logs (reviewed_at, reviewed_by)` and drop `violation_logs_update`, so review data is written only by the server.
4. `admin_actions` stays append-only: no UPDATE or DELETE grant to anyone but the table owner.

**Consequences**

- Admins can no longer edit violation review fields from the browser; the app never did.
- The server actions switch to RPC calls.
- Existing rows are untouched.
- It needs a local test like `supabase/tests/admin_actions_test.sql`, and verification SQL.

**Decision:** approve, change or decline this design.

## 5. Growth history longer than 29 days

- **Today:** snapshots come from the API-key sync, which is Non-Authorized Data, so they are kept at most 29 days.
- **Longer history** is allowed only for Authorized Data (the creator's own OAuth consent), with a re-check of authorization every 30 days [YouTube API policy III.E.4, read 2 November 2026].
- **That would need:** a sync that uses the creator's OAuth token, the Google OAuth verification, and an owner decision.

## 6. Supabase plan

- Free-plan projects pause after about 7 days of low activity, and every inbound offer fails while paused.
- Leaked-password protection is Pro-only.
- **Choose:** Pro ($25/month), or accept both risks (CLAUDE.md §16, item 5).

## 7. Discover deals show the company's real email to the creator

Open since CLAUDE.md §16, item 7: keep it, or mask it.

## 8. NVIDIA quota for an Arabic and Egyptian Arabic G benchmark

The benchmark needs real model calls using the production key and quota. Approve a bounded run, for example 40 scripted prompts with no user data.

## 9. Collaboration lifecycle design

Briefs, invitations, deliverables, revisions and completion are now built (migration 0026, not applied anywhere). Two questions remain open, and the build takes the conservative answer to each until the owner decides:
- **Who on the company side may act.** Today only the company account itself can write briefs, send invitations and review deliverables. A linked representative gets no access to the company's briefs or collaborations. Granting it needs a policy and function change.
- **Reviews (ratings after completion).** Not built. Whether reviews are public, private or admin-only decides the schema, so nothing was guessed.

## 10. Portfolio consent wording and collaboration showcase

The portfolio (migration 0028) names a brand on the public profile only when the creator ticks "The brand agreed to be named on my public profile". Please confirm:
- whether that wording is enough, or legal wants different text or a stronger record (for example, an uploaded approval);
- whether completed Green Light collaborations may appear on a creator's public profile. If so, decide whether the company must consent inside the app. Nothing is shown automatically today.

## 11. Email forwarding (see docs/EMAIL_FORWARDING_DIAGNOSTIC.md)

- **`ROLE_MAILBOX_FORWARD_TO`:** set it in Vercel Production to the inbox that should receive mail sent to support@, privacy@, security@, legal@ and deals@greenlightadvs.com. Today that mail reaches nobody.
- **Relay retry:** should a failed relay of a creator's reply to an email sponsor be retried automatically (risking a duplicate email), offered as a manual "resend" button, or left as a visible failure (today's behaviour)?

