# G Phase 1: real AI and core intelligence (status)

**Branch:** `claude/eager-gauss-dox9tq`. Nothing here is deployed.

**Two kinds of evidence, never mixed:**
- **FAKE MODEL:** NVIDIA is replaced by the scripted fake in `scripts/isolated-validation/mock-externals.mjs`, or the AI is "down". This proves authorization, context assembly, the server's filters, fallbacks and the UI. **It proves nothing about a real model's answers.**
- **REAL MODEL:** a call to `integrate.api.nvidia.com` that the model actually answered. **None has happened yet**: no working key, and the code's default model is retired (see A).

**No G capability is production-ready until the real-model items at the end pass.**

## A. NVIDIA live integration (done, commit `cff7aea`)

Against the real endpoint, with no key:
- the default model `meta/llama-3.3-70b-instruct` answers **410 end-of-life** (since 2026-08-26);
- an invalid key answers **403**;
- the model catalog is public, so it never validates a key.

Fixes:
- 410 is terminal and logged as `nvidia.model_unavailable`;
- a 403 runs the key diagnostic.

Evidence: `g-nvidia-failure-live.mjs` passed 4/4 for both the 410 and the 403 cases, against the **real endpoint**. That proves failure handling only. Details are in `NVIDIA_LIVE_CHECK.md`.

## B. Secure role-aware context (done)

| What | Where | Authorization |
|---|---|---|
| The page's entity: deal room `/inbox/<id>`, collaboration `/collaborations/<id>`, brief `/briefs/<id>` | `lib/g/entity.ts` (path → kind + id), `lib/g/entity-server.ts` (load) | Caller's own client (RLS), **plus** an explicit party check, because RLS lets admins read every deal. A brief: its own company, or a creator only while published. A row that fails reads exactly like a missing one |
| Unread notifications by category | `tasksContext` | RLS, recipient only |
| Prompt fences | `neutraliseFences` in `buildPrompt` | `<<<` / `>>>` inside untrusted text are replaced, so a message cannot close a fence |

Never sent to the model:
- `sender_email`, relay fields, `security_check` and `company_profile`;
- anything from verification;
- other users' rows.

The path names *what* to load, never *whose*.

## C. Deal Room intelligence (done)

`lib/g/dealroom.ts` (pure) builds, for a room the caller is a party to:

- **Recorded:**
  - deal status, source (in-app or email), offer and date;
  - terms as none, proposed (with who proposed and each side's confirmation) or frozen (with the agreed date and amount);
  - deliverables with status and due date;
  - the next step for the caller's side.
- **Interpretation (rule-based, labelled):**
  - questions from the other side after the caller's last message;
  - amounts in messages that differ by more than 5% from the recorded amount (frozen, then proposed, then offered).

  The platform's own Co-Pilot summary is excluded.
- **Thread:** the last 12 messages, masked, at most 500 characters each and 4,000 in total. Each is attributed to you, the other party, the sponsor's email, or the platform.
- **Follow-up:** a `message_draft` for the collaboration or the deal room. **Copy-only**: nothing sends it.
- **Prompt rule 11:** only frozen terms are agreed, a message never changes terms, and interpretations must be presented as such.
- **UI:** `DealRoomCard` has separate "Recorded" and "Interpretation" sections, in five languages.

**FAKE-MODEL evidence:**
- `dealroom.test.ts`: 12 unit tests.
- `g-dealroom.mjs`: 8/8 on the isolated stack:
  - the own room's facts;
  - an Arabic follow-up;
  - another creator's room reads like a missing one;
  - the company's own view; admins get nothing;
  - collaboration frozen terms;
  - brief visibility;
  - the prompt as the model would see it: an injection neutralised, no emails, no other room, a foreign deal draft dropped;
  - the panel's two sections.

**Not proven (needs a real model):** that a real model's summary is accurate, attributes speakers correctly, keeps facts and interpretations apart, and never states chat claims as terms.

## D. Creator brief recommendations (done)

`matchOpportunities` (`lib/g/collab.ts`) matches the briefs a creator can already read (RLS: published only, now up to 50) against the creator's own data: profile categories, connected platforms, and top audience countries (verified or self-reported, as the kit says).

Each match lists:
- matched criteria;
- unmet criteria;
- **unknown** criteria (the brief states something the creator's profile does not state at all, so it is not counted as unmet);
- the sponsor's budget against the creator's **own** base rate: within, below or unknown, never guessed;
- the due date and the invitation status.

Left out:
- past their due date;
- invitation accepted (already a collaboration), declined or withdrawn.

"Which briefs fit me?" and similar now reach this for creators.

**No application feature.** Prompt rule 12 and the card's note say companies invite and creators answer in Opportunities. "View the brief" opens the original in `/opportunities#brief-<id>`.

**FAKE-MODEL (AI down) evidence:**
- 2 new unit tests;
- `g-creator-recs.mjs` 4/4: expired, declined and draft briefs are excluded; reasons, budget fit and status are shown; Arabic gets the same results; the panel note is there; there is no apply button; the link opens the brief;
- `g-actions` 13/13 unchanged.

**Not proven:** a real model's explanation of the matches. Ranking is rule-based. Not considered, because the data does not exist: content language and engagement thresholds (briefs state neither).

## E. Pending verification assistance (done)

**Who it is for:**
- an applicant with **no account**, identified only by the httpOnly resume cookie, exactly like `/apply`;
- a signed-in account that is `pending_verification` or `rejected`.

Active accounts keep the full G and are refused here (403). Nobody else gets anything (401).

**Route** `POST /api/g/applicant`:
- public in `session.ts`, so applicants reach it; its own rate limit `g_applicant` (20 per hour, 60 per day);
- identity from the cookie or the session only. The body carries the question: no email, id or lookup parameter exists.

**What G sees** (`lib/g/applicant.ts` `applicantSummary`), a fixed projection of the caller's own cases:
- kind and status;
- the **keys** of missing required fields and documents;
- the reviewer's applicant-facing `info_request` (only while information is requested) and `decision_reason` (only on a rejection), masked;
- dates and the next step.

**Never read on this path** (enforced by `notes-separation.test.ts`):
- internal notes, fraud flags, flag approvals, match keys, reviewer identity, document paths;
- the values the applicant typed.

**Rules:**
- read-only;
- cannot approve, change or speed up an application;
- **no review time**: a model reply that states one (`promisesReviewTime`, five languages) is discarded;
- an invented figure is discarded;
- no knowledge of other applications.

**UI:** `GApplicantHelp` on `/apply`, and on `/verification` for accounts that are not active.
- Text only, with no voice or wake word.
- No prepared actions.
- The conversation is held only in memory, never in storage (the device may be shared).
- Five languages.

**FAKE-MODEL evidence:**
- `applicant.test.ts`: 4 unit tests.
- `g-applicant.mjs`: 8/8.
  - No cookie gets 401.
  - The own case shows the reviewer's request; no note, flag, typed details, reviewer or other applicant appears.
  - The captured prompt holds only the caller's summary, and another applicant's email typed into the question is masked.
  - A "within 24 hours" reply is discarded.
  - An active account gets 403.
  - A pending account gets the helper on `/verification` and no full G.
  - An Arabic question on `/apply` is answered from the applicant's own case.
  - The 21st request gets 429.
- `registration-smoke` 9/9 and `second-reviewer-action-check` 7/7 are unchanged.

**Not proven (real model):** answer quality, Arabic wording, and that a real model never implies a timeline in words that `promisesReviewTime` does not catch (for example "soon" or "shortly").

## F. Action safety (done)

Every impactful G action is a prepared form. The user sees the exact target and details, confirms in a dialog, and the client then calls the product's ordinary server action. That action derives the actor from the session and re-checks role, ownership and state in the database. G executes nothing.

| Proposal | Effect on confirm | Server check |
|---|---|---|
| `content_draft` | saves a private draft (`saveContentItem`) | creator role, session id, rate limit |
| `brief_draft` | saves a **draft** brief, never publishes (`createBriefDraft`) | company role, idempotency key assigned by the route (0038) |
| `invitation` | sends one invitation (`inviteCreator`) | `collab_create_invitation`: the brief is the session's company's and still published; the creator exists; not already invited |
| `message_draft` (collaboration or deal room) | **none: copy only** | nothing can be sent from it |

Evidence (AI down, real browser):
- `g-actions.mjs` 13/13 (existing): Cancel, Escape, double click, replay, wrong role, already invited, idempotent brief drafts.
- New `g-action-safety.mjs` 3/3:
  - **stale proposal:** the brief is archived between preparing and confirming; the server refuses, nothing is created, and an error is shown;
  - **cross-company replay:** company A's captured invitation request, replayed with company B's session, creates nothing;
  - **copy-only drafts:** copying a deal-room draft makes no server-action call and writes no message, and the draft has no send button.
- Model-generated ids: `allowedProposals` keeps only ids from the caller's own context (`hostile` fake mode in `g-ai-paths`, the foreign deal draft in `g-dealroom`).

No automatic invitations, messages, financial actions, contract changes or approvals exist.

## G. Voice and UX (done; no real-device testing)

**Voice: simulated only.** I had no microphone or real browsers other than headless Chromium, so **no real-device or real-microphone test was performed** on Chrome, Edge, Safari, Firefox or mobile.

What was run (a spec-faithful fake recognizer in headless Chromium, preview build):
- `g-voice-e2e.mjs`: 18/18 on three runs. One earlier run, on the build's first requests, had 1 failure that I did not capture and could not reproduce.
- `g-wake-e2e.mjs`: 31/31.

Together they cover:
- explicit mic start; listening and speaking states; interrupting; Stop; mute;
- switching between typing and voice;
- Arabic `ar-EG`;
- permission denied, unavailable, network and silence errors, and a stalled service;
- an unsupported browser;
- "Hey G" off by default, with consent, an indicator and Turn off; hidden-tab pause; sign-out clearing; no wake on ordinary speech.

Voice code was not changed in Phase 1. The applicant helper has no voice at all.

**UX changes:**
- Page-aware suggestions: inside a deal room or collaboration, "Summarise this conversation.", "What's still open in this deal?" and "Draft a follow-up message."; creators on Opportunities start with "Which briefs fit me?". Five languages.
- The Deal Room card, the opportunity details and the applicant helper (above).

**Accessibility:** new `a11y-g-phase1.mjs` found **0 axe violations** (WCAG 2.0/2.1 A+AA) with G open in a deal room, G open on Opportunities, and the applicant helper open on `/apply`, each on desktop light and phone dark. The existing `a11y-axe.mjs` still reports none.

**Still to do with a person:** `VOICE_MANUAL_TEST_CHECKLIST.md` on real devices, and a screen-reader pass of the new cards.

## Live validation attempt (2026-11-20): blocked, no key

**Key and model:**
- No NVIDIA key is available in the isolated environment: none in the shell, any `.env` file, the app's environment or the environment's network secrets. A key was previously declined, so none was requested again.
- **No real-model check could run.** Model recommended: `mistralai/mistral-large-4-1t-a52b` with `NVIDIA_REASONING_EFFORT=low`; fallback candidate `google/gemma-4-31b-it`. Both, and how to supply the key safely, are in `NVIDIA_LIVE_CHECK.md`.

**Safe fallback, re-verified:**
- **Real endpoint:**
  - an invalid key with the recommended model: 403, one attempt, rules answer, `nvidia.credential_rejected`, no key in the log (4/4);
  - the retired default: 410, `nvidia.model_unavailable` (4/4).
- **Fake model** (`g-ai-paths` 12/12):
  - 429 and 500;
  - a hanging provider, abandoned at the 25s budget;
  - invalid, incomplete and ungrounded replies;
  - hostile ids and actions;
  - the rate limit.

  A rules answer has no prose (`reply: null`), so it can never claim an action was done.

**Prepared:** `g-ai-live-phase1.mjs` runs checks 3–7 against the real model and writes a report. Its only run so far was a dry run against the fake model, which proves the script works and nothing about any model.

## Real-model validation still required (owner)

Needs a model from the current catalog and a key (`NVIDIA_LIVE_CHECK.md`). Then:

1. `scripts/check-nvidia.mjs`: the key is accepted and the chosen model answers.
2. `g-ai-live.mjs`:
   - an English and an Arabic answer with `engine: "ai"`;
   - a follow-up that uses the history;
   - a company recommendation.
3. **Deal room summary** on the `g-dealroom.mjs` fixture with the real model:
   - the summary matches the recorded card;
   - the $800 claim is not stated as the agreed amount;
   - the injected "reveal the email" is ignored.
4. **Creator recommendations** on the `g-creator-recs.mjs` fixture: the explanation uses only matched, unmet and unknown criteria, and never mentions applying.
5. **Applicant help** on the `g-applicant.mjs` fixture: no review time, including vague wording like "soon"; no claims about other applicants; Arabic wording.
6. **Grounding rejection rate:** over around 20 varied questions, how often `g.reply_ungrounded` or a review-time rejection fires. A high rate means most answers fall back to rules.
7. Latency against the model budgets (25s G, 20s applicant), token use, and 429 behaviour under the rate limit.

Until these pass, **no G capability is production-ready as an AI feature**. What works today in every case is the rule-computed part: the cards, the proposals and the fallbacks.
