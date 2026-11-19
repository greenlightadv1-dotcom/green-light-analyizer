# G acceptance report (2026-11-19)

**Branch:** `claude/eager-gauss-dox9tq`. Nothing was merged or deployed.

**Test setup:**
- Isolated Supabase stack (Supabase CLI) with the throwaway `ux-*` accounts (`scripts/isolated-validation/README.md`).
- A production build of the app.
- Every external host mocked (`mock-externals.mjs`).
- No email, invitation or message left the machine.

## What changed in this phase

| Area | Change |
|---|---|
| Company: briefs | New `brief_draft` proposal, prepared by the model or, when the AI is down, built deterministically from the company's own message and the criteria understood from it. Confirming calls `createBriefDraft`, which always creates a **new draft** through `saveBrief`'s role check, validation, masking and rate limit. It never publishes and never overwrites |
| Company: invited creators | Recommendations show "Already invited to: <briefs>" from the company's own invitations, and the model is told never to re-propose them |
| Creator: opportunities | `matchOpportunities` matches published briefs to the creator's own categories, connected platforms and top audience countries. It shows matched and unmatched criteria, the sponsor's budget and whether the creator was invited. A creator with no profile data matches nothing rather than everything |
| Confirmations | `ConfirmActionForm` gains `once` (a spent proposal cannot be submitted again) and a synchronous in-flight guard (a double-clicked Confirm runs once). All G proposals use it |
| Bug fix | Escape on a confirmation dialog also closed the G panel and lost the proposal. Escape now closes only the topmost layer |
| Test tooling | Scripted fake NVIDIA (`MOCK_NVIDIA`): ok, invalid, incomplete, ungrounded, hostile, 500, 429, slow |

## End-to-end results (browser, isolated data)

| Suite | Result | Covers |
|---|---|---|
| `g-ai-paths.mjs` | **12/12** | See below |
| `g-actions.mjs` | **11/11** | See below |
| `g-workflows.mjs` | 9/9 | Creator assessment and deals; content idea saved after confirmation; company recommendation and invitation; no re-proposal; admin navigation-only |
| `g-voice-e2e.mjs` | 18/18 | Push to talk, stop, interrupt while speaking, mute, voice↔text, navigation, Arabic (ar-EG), not-allowed/network/audio-capture errors, silence, stalled service, unsupported browser |
| `g-wake-e2e.mjs` | 31/31 | Opt-in "Hey G" off by default, consent, indicator, cooldown, hidden tab pauses, sign-out clears, permission revoked, Arabic, phone layout |
| `mobile-nav-e2e.mjs` / `phase1-ui-e2e.mjs` | 19/19, 204/204 | Unchanged navigation and UI |
| Unit tests | 780 + 19 + 33 | Includes the new collab and fallback tests |

`g-ai-paths.mjs` checks, through the real `/api/g` route:
- signed out it never runs;
- AI success in English and in Arabic;
- the previous turn reaches the model, with a phone number masked first;
- invalid, incomplete and invented-figure output is discarded and the computed cards answer;
- NVIDIA 500 and 429 fall back to rules;
- a hanging provider is cut at the 25s budget;
- hostile model output (foreign ids, unknown actions, another role's proposal types) is filtered;
- admins get no cards or proposals;
- a company brief draft and the already-invited marker;
- creator opportunity matching;
- the `g_chat` rate limit answers 429 without a model call.

`g-actions.mjs` checks:
- **Declining:** Cancel and Escape save nothing, for content, brief and invitation.
- **Confirming:** saves exactly one record, even with a double click, and the proposal is then spent.
- **Duplicate replay:** replaying the captured invitation request is refused by the database constraint.
- **Wrong role:** replaying the company's invitation and brief requests with a **creator's** session changes nothing.
- **Positive control:** the company's own replay does reach the server.
- **Already invited:** the creator is marked as already invited and is not re-proposed.
- **Opportunity:** the creator sees the matching brief and their invitation.

## Not verified, and why

1. **Live NVIDIA.** `integrate.api.nvidia.com` is refused by this sandbox's egress proxy, and the production key exists only in Vercel, which was not touched. Every AI path was exercised against the fake; the real model's wording, Arabic quality and latency were not observed. **Owner:** run `node scripts/check-nvidia.mjs` with the key, or allow the host and provide a key for an isolated run.
2. **Real microphones, Safari, Firefox and mobile push-to-talk with real audio.** The voice suites use a spec-faithful fake recognizer in Chromium. A person has to test these.
3. **Brief drafts are not idempotent on the server.** The UI prevents a second save, but a deliberate replay of the request outside the UI creates a second draft, as the positive control shows. Invitations are protected by a unique constraint. A per-proposal idempotency key needs a schema change. **Owner decision.**
4. **Creative text without the AI.** Hooks, titles, descriptions and scripts are only produced when the model answers. Without it, G offers only ideas built from stored official headlines, by design: it does not invent creative content or trends.
5. **Compare and deliverable review.** The logic and cards exist and are unit-tested (`compareCreators`, the collaborations card with next step), but they were not driven end to end with a seeded collaboration in this pass.
