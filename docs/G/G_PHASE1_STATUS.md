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

## E–G: pending

(Updated as each step lands.)

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
4. **Grounding rejection rate:** over around 20 varied questions, how often `g.reply_ungrounded` fires. A high rate means most answers fall back to rules.
5. Latency against the 25s model budget, token use, and 429 behaviour under the rate limit.
