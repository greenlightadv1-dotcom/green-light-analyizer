# Email and message forwarding: diagnostic (2026-11-02)

Evidence was gathered read-only:
- aggregate SQL against the production database;
- Resend's domain list;
- Resend's received-mail list.

No email was sent, nothing in production was changed, and no personal addresses are reproduced here.

## Summary

There are four separate forwarding paths. One is broken outright, and two have gaps.

| # | Path | Finding | Status |
|---|---|---|---|
| 1 | Mail to `support@` / `privacy@` / `security@` / `legal@` / `deals@greenlightadvs.com` | **Broken.** Received by Resend, rejected by the intake, forwarded to nobody | Fixed locally; needs `ROLE_MAILBOX_FORWARD_TO` in production |
| 2 | In-app rooms (Discover offers, accepted invitations): a new message for the other party | **No forwarding of any kind.** No email (deliberate, §6) and no notification | Fixed locally (migration 0030, in-app notification) |
| 3 | Email rooms: a creator's reply relayed to the sponsor | **Works**, with two gaps: an unchecked outcome write and no retry | Outcome write fixed locally; retry not built |
| 4 | Sponsor email forwarded by a creator's Gmail rule to their alias | **Works** in the evidence available | No change |

## 1. Role mailboxes are forwarded to nobody (root cause)

**Evidence**
- `inbound_emails` holds 3 rows from 2026-10-31, each `rejected` with `no recipient on an accepted inbound domain (analyze.greenlightadvs.com, analyze.greenlight.com)`.
- Resend's received list shows those 3 deliveries were addressed to `support@`, `privacy@` and `security@greenlightadvs.com`. They are test messages from the owner's account.
- Resend lists **both** `greenlightadvs.com` and `analyze.greenlightadvs.com` as verified, with receiving enabled.
- `support@greenlightadvs.com` is published as `SUPPORT_EMAIL` (`src/lib/constants/legal.ts:67`) on the Support page. `privacy@` and `security@` appear in the legal pages.

**Root cause**
- Receiving is enabled on the root domain, and its deliveries go to the same webhook as creator aliases (`src/app/api/webhooks/resend/route.ts` → `processInboundEmail`).
- The intake only knew creator aliases (`findInboundAlias`, accepted domains in `src/lib/alias.ts`). Anything else was rejected as `no recipient on an accepted inbound domain`.
- No other forwarding rule exists in the code or in the Resend configuration that the API exposes. Mail sent to the published support, privacy and security addresses therefore reached no human.

**Fix**
- `src/lib/email/role-mailbox.ts` recognises the root-domain role mailboxes.
- `src/lib/email/intake.ts` then does the following:
  1. fetches the message body (the same Received Emails API as offers);
  2. forwards it from the platform address to the operator inbox in `ROLE_MAILBOX_FORWARD_TO`, with the original sender as Reply-To;
  3. records `processed` with `<mailbox>@ mail forwarded to the operator inbox`.
- No deal room, evaluation or WhatsApp alert is created.
- Attachments are listed by name, not forwarded; the originals stay in Resend.
- **Without `ROLE_MAILBOX_FORWARD_TO`:** the delivery is recorded with an explicit detail (`… ROLE_MAILBOX_FORWARD_TO is not set: nothing was forwarded`) and logged at error level as `inbound.role_mailbox_unrouted`. `/admin/system` lists the variable.
- A forward target equal to a role mailbox is refused, to prevent loops.
- A failed send is recorded and logged as `inbound.role_mailbox_forward_failed`.

**Tests**
- `src/lib/email/role-mailbox.test.ts`: recognition, look-alike domains, loop guard, message shape.
- `src/lib/email/intake-tests/intake.test.ts` (three new cases):
  - a delivery is forwarded and no room is created;
  - with no target configured, nothing is sent and the outcome is logged;
  - a failed send is logged.
- These use the real `intake.ts` with a mocked sender. No email was sent.

**Remaining (needs owner approval)**
- Set `ROLE_MAILBOX_FORWARD_TO` in Vercel Production to an inbox the team reads, then redeploy.
- Optionally disable receiving on the root domain instead, if role mail should go somewhere else entirely. That is a Resend change.

## 2. In-app rooms forwarded nothing to the other party

**Evidence**
- `src/app/(app)/inbox/[chatId]/actions.ts`: `shouldRelay = chat.creator_id === profile.id && !chat.company_id`.
- In rooms with a company account, the relay intentionally does not run. The sponsor is a Green Light user, and emailing their own thread back to them is redundant.
- Nothing else told them a message had arrived. CLAUDE.md §16 lists "company-side new-message notifications" as post-launch.
- Production currently has no in-app rooms with messages (the aggregate query found messages only in email rooms). So the gap is real, but no live message has hit it yet.

**Fix: migration 0030 (not applied)**
- A trigger on `messages` insert notifies the other party of an in-app room. Creators are notified of company messages too.
- There is one unread notification per room and recipient, refreshed by later messages rather than stacked.
- The notification holds ids only, never the text. The category `messages` can be muted.
- Email rooms and system messages notify nobody.
- Opening the notification goes to `/inbox/<room>` (`notificationHref`, tested).

**Tests:** `supabase/tests/message_notifications_test.sql` covers one per room, re-notify after read, both directions, email rooms excluded, muting, and recipient-only RLS. It passes in the local migration harness.

## 3. Email-room relay: works, with gaps

**Evidence:** 9 creator messages exist in email rooms.

| Count | State |
|---|---|
| 5 | `relayed_at` set |
| 1 | `relay_error = 'RESEND_API_KEY is not configured'` (2026-09-08, before the key existed) |
| 3 | Neither (2026-09-08 ×1, 2026-09-22 ×2) |

**Gap A (fixed):** the action wrote the outcome with `update(...)` and ignored that write's error. So a send could succeed (or fail) and leave no record. That matches the three "neither" rows, though it cannot be proven after the fact.
- The write is now checked.
- A failure is logged at error level as `relay.outcome_not_recorded`, with whether the send itself succeeded.

**Gap B (not built):**
- A failed relay is never retried. The creator sees `relayFailed` on that send, and the error is stored on the message.
- A retry would need either a queue or a retry control in the room. That is a product decision (a duplicate email to a sponsor is worse than a visible failure), so it is listed in `PENDING_OWNER_DECISIONS.md` rather than guessed.

**Checked and correct:**
- `from` is the platform address (`fromAddress()`); both domains are verified in Resend.
- `reply_to` is the creator's alias, never their real address.
- The text is the masked text.
- Requests have a 15 s timeout.
- Sending is rate-limited (`message_send`).

**Could not verify:** Resend's sent-email list returned no emails for the connected API key. That key may not be the one production sends with, or the list may not cover the period. So delivery or bounce status of the 5 relayed messages was not confirmed. Check bounces in the Resend dashboard, under the production key's team.

## 4. Creator Gmail forwarding to the alias

- The latest offers forwarded to aliases were processed: 3 `created a deal room` and 1 `appended`, between 2026-09-22 and 2026-09-29.
- One delivery hit an alias that matched no account (`unknown_alias`, 2026-09-22). That fits an alias that was rotated or mistyped.
- No failure on this path appears in the evidence, and the code reads the envelope recipient (`received_for`) as well as To/Cc/Bcc.

## Reproduction (local, no network)

```
npm test
bash scripts/local-migrations-test.sh
```

- `npm test` runs the intake role-mailbox cases.
- `scripts/local-migrations-test.sh` runs the message notification test.

## Update 2026-11-03: relay lifecycle (migration 0036, not applied)

| Previous gap | Now |
|---|---|
| A failed relay was never retried | `messages.relay_status`: `queued → processing → sent / failed_retryable / failed_permanent`. Transient failures back off 2, 4, 8 and 16 minutes; after 5 attempts the relay becomes permanent. |
| The outcome write was unchecked | The outcome is written by `relay_record()`. If that write fails, the log says so (`relay.outcome_not_recorded`), and the claim expires so the message is retried. |
| Messages with neither a relay time nor an error | Every relayed message has a state. The backfill marks old rows `sent` (relayed_at set) or `failed_retryable` (relay_error set). |
| Duplicates on retry | Each send carries the Resend `Idempotency-Key` `gl-relay-<message id>`. `relay_claim()` is a compare-and-swap, so two workers never send at once. |
| Transient and permanent failures handled the same | HTTP 400/401/403/404/422 are permanent. 409, 429, 5xx, timeouts, network errors and a missing `RESEND_API_KEY` are retryable. |
| Provider id not kept | `relay_provider_id` holds the id Resend returns. |
| No admin visibility | `/admin/relays` lists pending and failed relays with state, attempts and the HTTP code only (never message text or addresses), and offers retry. |
| Notifications confused with delivery | In-app notifications (0030) only say a message exists. Only `relay_status = 'sent'` means the provider accepted an email, and that still does not prove the sponsor read it. |

### Retry schedule

`/api/cron/relay-retry` exists, requires `CRON_SECRET`, and is **not** in `vercel.json`. Until it is scheduled (an approval), retries run from `/admin/relays`.

### Tests

- `supabase/tests/relay_lifecycle_test.sql`
- `src/lib/email/relay-lifecycle.test.ts` (mocked provider; no email is sent)

The behaviour of Resend's idempotency key was not observed live. It is taken from Resend's API documentation as previously researched.

## `ROLE_MAILBOX_FORWARD_TO` (not set; instructions only)

- **What it does:** mail to `support@`, `privacy@`, `security@`, `legal@` and `deals@greenlightadvs.com` is forwarded to this one address, with `reply_to` set to the original sender. Without it, that mail is recorded and logged as `inbound.role_mailbox_unrouted`, and reaches nobody.
- **Value:** one operator inbox the owner controls (for example a Google Workspace or Gmail address). It must not be one of the role mailboxes; the code refuses that to prevent a loop.
- **Where:** Vercel, Production environment variable `ROLE_MAILBOX_FORWARD_TO`, then a redeploy.
- **Sender:** forwards go out from `RESEND_FROM_ADDRESS` (default `deals@<inbound domain>`), which must be a verified sender in Resend. That is already the case for relays.
- **Not done here:** the variable was not set and no Resend setting was changed.
