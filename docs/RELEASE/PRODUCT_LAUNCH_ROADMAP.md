# Product launch roadmap

**Based on:** `PRODUCT_COMPLETENESS_AUDIT.md` (IDs below refer to it), branch at `1e8db30`, 2026-11-20.

**Ground rules:**
- Planning only.
- No pricing, commission, Terms or Privacy changes are proposed here without separate approval.
- Decided items are not reopened: admin-gated accounts, mandatory email verification, phone without OTP, manual KYC and KYB, 365-day retention, reapplication, separate internal notes, and the 10% commission.

**G is central.** G's validation work sits in P0 and P1 as its own track, not after polish.

## Priority definitions

| Priority | Meaning |
|---|---|
| **P0** | Prevents core usage, or is a critical security or data risk. Launch cannot happen without it |
| **P1** | Essential to the intended experience (including G as a real interactive assistant) |
| **P2** | Important; before launch or shortly after |
| **P3** | Optional |

## P0: launch blockers

| # | Item | Audit ID | Type | Depends on |
|---|---|---|---|---|
| P0-1 | Decide and set up a production backup and rollback method (Pro plan PITR, or a verified `pg_dump` process) | D1 | Owner decision, then ops | O1 |
| P0-2 | Malware scanning on all 5 upload paths, fail-closed, with quarantine, submission waiting on clean files, and the EICAR test | D5, S6 | Build | O8 (scanner hosting) |
| P0-3 | Set `CRON_SECRET` in production; confirm both crons answer 200 | D3 | Owner config | — |
| P0-4 | Fill the legal operator details; review the Privacy Policy coverage of KYC documents, retention and fingerprints | D4, P3 | Owner, then legal | O2 |
| P0-5 | Supabase Auth: public sign-up off, Site URL and redirects, password policy | D6 | Owner config | — |
| P0-6 | Staff at least two verification reviewers | A2 | Owner action | — |
| P0-7 | Apply 0025–0041 to production in order, after P0-1; deploy the branch together with them | D1, D2 | Release | P0-1, P0-2, P0-3, P0-5 |
| P0-8 | **G live-model validation:** run `g-ai-live.mjs` and the NVIDIA check (`scripts/check-nvidia`) from an environment with egress; record the model, latency, grounding rejections and Arabic quality | G1, G9 | Test | NVIDIA key reachable |
| P0-9 | Production smoke test (§16 item 3), extended to the new flows. Steps: Get Started → email link → submit → approval by two reviewers → activation → login; brief → invite → accept → terms → deliverable → paid; live Resend inbound, relay and WhatsApp | C12, DR3, S4, S5 | Test | P0-7 |

## P1: essential experience

| # | Item | Audit ID | Notes |
|---|---|---|---|
| **G track** | | | |
| P1-G1 | Give G read access to the deal-room thread (masked, fenced, the caller's own RLS) so it can summarise and draft from what the sponsor said | G4 | Reuse the deal-room reply generator's context loader; no new tables |
| P1-G2 | G for pending and verifying accounts: a scoped, read-only "verification helper" mode (own case status and missing fields, no documents, no notes or flags) | G13 | Must never expose internal notes or flags |
| P1-G3 | Real-microphone voice validation on Chrome, Edge and Safari (desktop and mobile), using `VOICE_MANUAL_TEST_CHECKLIST.md`; fix what fails | G10 | Needs a person with devices |
| P1-G4 | Deliverable proposal kinds (prepare a submission note; prepare a revision request), confirm-to-execute like the others | G7 | |
| P1-G5 | Streaming replies, or at least progressive status | G11 | Grounding must still run on the full reply before it is shown, so streaming may be status-only |
| **Marketplace** | | | |
| P1-1 | Email notifications for collaboration events (invitation, terms proposed or confirmed, deliverable submitted or reviewed), respecting `notification_preferences` and sent through the relay lifecycle | S3 | Resend free tier is 3,000 a month, so watch volume |
| P1-2 | Creator applications to published briefs | C10 | Needs O3 |
| P1-3 | Dispute workflow: reason and evidence when setting `disputed`, an admin dispute queue, resolution outcome, events | DR7, A5, K8 | Settlement stays manual |
| P1-4 | Creator earnings view: agreed amount, the 10% commission shown for information, paid status per deal | C15 | Display only; nothing moves money. Needs O4 |

## P2: important, before or soon after launch

| # | Item | Audit ID |
|---|---|---|
| P2-1 | Admin audit-log viewer and the durable admin audit table (next free migration, 0042+) | A7 |
| P2-2 | Admin deals oversight: filters by status and age; a reconciliation list for `agreed` deals awaiting `paid` | A6 |
| P2-3 | Discover side-by-side comparison UI (G already compares) | K3 |
| P2-4 | Brief recommendations for creators (rules first, then G) | C11, G5 |
| P2-5 | Deliverable and chat file attachments (only after P0-2) | C14, DR4 |
| P2-6 | Accessibility and mobile pass on the wizard, camera capture, admin review screens and 0025+ pages | P4, P5, S8 |
| P2-7 | Camera-less fallback for identity capture (e.g. continue the application on a phone through the resume link) | C2 |
| P2-8 | Integrations: Instagram on a current Graph version; Kick official API; feed median reach into pricing | C6 (O9) |
| P2-9 | YouTube OAuth Google verification submitted and passed | C7 |
| P2-10 | Representative write scopes (briefs, invitations, messages) | R3, R4 (O7) |
| P2-11 | Realtime two-session browser test | DR10 |
| P2-12 | Error tracking service | S10 |

## P3: optional

- Global search (S1).
- Reviews and ratings (C16, O5).
- Admin reporting and metrics (A8).
- G admin summaries (G14).
- Server-side G memory (G8).
- Admin and `lib/` translations (S9).
- A PDF contract for frozen terms (DR5).

## Sequence

```
Week A  Owner decisions O1, O2, O8 ──┐
        P0-3, P0-5, P0-6 (config)    │  (parallel)
        P0-8 G live validation       │
        P0-2 malware scanning build ─┤
Week B  P0-1 backup ready ───────────┤
        P0-7 migrations + deploy ◄───┘
        P0-9 production smoke test
Week C+ P1 G track  ║  P1-1 email notifications  ║  P1-3 disputes
        P1-2, P1-4 once O3 and O4 are decided
Then    P2 in the listed order; P2-5 only after P0-2
```

## Parallelisable tracks

These can run at the same time without blocking each other:

1. **Owner configuration:** P0-3, P0-4, P0-5, P0-6.
2. **Malware scanning:** P0-2, which needs only the O8 decision.
3. **G validation:** P0-8 now, then P1-G1, P1-G2 and P1-G4 (code, independent of production). P1-G3 needs a person and devices.
4. **Marketplace:** P1-1 and P1-3 (independent of each other). P1-2 and P1-4 wait for their owner decisions.

Serial points:
- P0-7 waits for P0-1, P0-2, P0-3 and P0-5.
- P0-9 waits for P0-7.
- P2-5 waits for P0-2.

## Owner decisions still required

Only items that genuinely need approval and are not already decided:

| # | Decision | Blocks |
|---|---|---|
| O1 | Production backup method: Supabase Pro ($25/mo, PITR, no pausing) or Free plus a verified manual dump (§16 item 5) | P0-1, P0-7 |
| O2 | Approval to update the Privacy Policy (and the date) so it describes identity documents, 365-day retention and fingerprints, if review shows it doesn't; plus the operator details | P0-4 |
| O3 | Whether creators may apply to published briefs, or invitations only | P1-2 |
| O4 | Whether creators see a per-deal commission and earnings figure, computed at 10% for display only | P1-4 |
| O5 | Reviews and ratings (PENDING item 9) | C16 |
| O6 | Whether Discover deals keep showing the company's real email to the creator (§16 item 7) | K9 |
| O7 | Representative write, financial and contractual scopes (PENDING item 9) | P2-10 |
| O8 | Malware scanner hosting: a self-hosted ClamAV host outside Vercel, or an approved service; any cost or new processor needs approval | P0-2 |
| O9 | Use median reach in pricing (decision 12); portfolio consent wording (item 10) | P2-8, C9 |
