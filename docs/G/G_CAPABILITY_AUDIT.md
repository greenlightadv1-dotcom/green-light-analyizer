# G capability audit

Baseline: `7af5d18` (2026-11-19).

**Classification:**
- **E2E**: implemented, and verified end to end in a real browser against the isolated Supabase stack.
- **Impl**: implemented, but not verified end to end (unit or source tests only).
- **Partial**: some of the capability exists.
- **Missing**: absent or broken.

"E2E" here never means "the UI exists" or "a unit test passes".

This table is the state *before* the G completion phase. Results after it are in `G_ACCEPTANCE_REPORT.md`: gaps 1–5 below are closed, apart from the live NVIDIA call.

## 1. Creator G

| Capability | State | Evidence / gap |
|---|---|---|
| Read own profile, media kits and deals (RLS, own client) | E2E | `g-workflows.mjs` checks 1–2: the synced subscriber figure and the creator's own deal rooms are shown |
| Metrics with provenance and last update | E2E (rules) / Impl (AI) | Assessment card shows verified/synced/self-reported/missing badges. The AI wording of provenance is only prompt-enforced |
| Strengths, weaknesses, missing profile items | E2E | Assessment card findings, rendered from codes |
| Content ideas | Partial | With AI: any kind. Without AI: only an idea built from a stored official headline (E2E) |
| Hooks, titles, descriptions, scripts | Partial | AI only. There is no deterministic path, by design: G does not invent creative text without a model |
| Media Kit help | Partial | The "missing" list links to Media Kit. There is no per-field guidance |
| Find relevant opportunities | **Missing** | G reads published briefs for creators but never matches them to the creator or shows them. Only invitations are counted |
| Deals and deliverable status | E2E (deals) / Impl (collaborations) | Collaborations card with next step and deliverable counts. Not exercised with a seeded collaboration |
| Prepare messages without sending | Impl | `message_draft` proposals are copy-only, with a check-in fallback. Not exercised E2E |

## 2. Company G

| Capability | State | Evidence / gap |
|---|---|---|
| Brief understanding from text and the structured brief form | E2E (search) | Criteria from the message become part of the search |
| Create and improve a campaign brief | **Missing** | G can show which brief fields are missing but cannot prepare a brief to save |
| Search the directory | E2E | `g-workflows.mjs` check 6 |
| Compare creators | Impl | `compareCreators` plus the comparison tray. Not exercised E2E |
| Explain recommendations and sources | E2E (rules) | Requirement rows with met/unmet/unknown and provenance |
| Identify already-invited creators | **Partial** | Fallback proposals skip invited pairs (E2E), but the recommendation card does not say who was already invited |
| Prepare invitations | E2E | Check 7, plus no duplicate proposal (check 8) |
| Review deal progress and deliverables | Impl | Collaborations card |

## 3. Admin G

| Capability | State | Evidence |
|---|---|---|
| Navigation help only; no other users' data; no proposals | E2E | Check 9 |

## 4–10. Cross-cutting

| Capability | State | Evidence / gap |
|---|---|---|
| Text conversation | E2E (rules) | |
| Context across turns | Impl | The last 8 turns are sent to the model (masked). The rules engine is stateless per message by design; the compare tray and brief form carry state |
| Conversation persistence | E2E | sessionStorage per user and role; survives navigation (wake/voice e2e); cleared on sign-out |
| Voice: push to talk, states, interruption, mute, errors, Arabic | E2E with a fake recognizer | `g-voice-e2e` 18/18. Real microphone, Safari and Firefox are **not** tested |
| "Hey G" (opt-in, off by default) | E2E with a fake recognizer | `g-wake-e2e` 31/31, including sign-out cleanup and phone layout. No always-on or background-tab listening: it pauses when the tab is hidden |
| Navigation actions, server-filtered to own ids | Impl | `allowedActions` unit tests |
| Proposals: confirmation required; server re-checks | E2E for save and invite | Decline-path and repeated-confirm behaviour **not** tested E2E |
| Server permission enforcement | Impl | `requireRole` in actions (source guards), service-role-only SECURITY DEFINER RPCs (SQL tests) and the DB unique constraint on invitations. Not exercised from a hostile browser session |
| NVIDIA success path | **Not verified** | `integrate.api.nvidia.com` is refused by this sandbox's egress proxy, and no key is present here |
| NVIDIA failure handling (timeout, 4xx/5xx, invalid JSON, invented figures) | Impl | Unit tests on `chat.ts`, grounding and validation. Not E2E through `/api/g` |
| Rate limit (`g_chat`) | Impl | Coverage test only |
| Arabic/English replies | Impl (AI) / E2E (UI strings) | Language hint unit-tested. AI replies were never observed |

## Highest-impact gaps, in priority order

1. **Company:** prepare a campaign brief that is saved as a draft only after confirmation.
2. **Company:** recommendations should say who is already invited, and to which brief.
3. **Creator:** match published briefs to the creator's profile, with the reasons.
4. **Actions:** E2E proof that declining does nothing, that confirming runs exactly once, that repeats are refused, and that a role without the permission is refused by the server.
5. **AI path:** E2E through `/api/g` against a scripted fake NVIDIA covering success (en/ar, history), invalid output, invented figures, errors, 429, timeout and the rate limit. A live NVIDIA call needs the owner (see the acceptance report).

## Status after the completion phase (2026-11-19, second pass)

| Capability | Before | Now | Evidence |
|---|---|---|---|
| Creator: find relevant opportunities | Missing | **E2E** | `matchOpportunities`; g-actions 13, g-ai-paths 11 |
| Company: prepare a brief | Missing | **E2E** | `brief_draft`; g-actions 3, 4, 9, 10 |
| Company: already-invited marker | Partial | **E2E** | g-actions 11, g-ai-paths 10 |
| Company: compare creators | Impl | **E2E** | g-collab-compare 9–12: empty state, DB-equal figures with provenance, foreign id ignored, creator refused |
| Deals and deliverables (both sides) | Impl | **E2E** | g-collab-compare 2, 3, 8: next step, amount and counts from the DB, before and after review |
| Deliverable review confirmation and permissions | (not covered) | **E2E** | g-collab-compare 4–7 |
| Prepare messages without sending | Impl | **E2E** | g-collab-compare 3: copy-only check-in, no form |
| Decline / confirm-once / duplicates / server permissions | Impl | **E2E** | g-actions 1–12, with positive controls |
| Brief creation idempotency (DB) | Missing | **E2E** on the isolated stack | Migration 0038 (not applied to production), SQL test, g-actions 9, 10, 12 |
| AI success, invalid output, errors, timeout, rate limit, Arabic, history | Impl | **E2E against a scripted fake** | g-ai-paths 1–12 |
| AI against the real NVIDIA model | Not verified | **Still not verified**, owner-run | `docs/G/NVIDIA_LIVE_CHECK.md`, `g-ai-live.mjs` |
| Voice with real microphones and browsers | Not verified | **Still not verified**, manual | `docs/G/VOICE_MANUAL_TEST_CHECKLIST.md` |
| Creative text without the AI | Partial (by design) | Unchanged | G does not invent hooks, scripts or trends without a model |
