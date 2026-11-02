# G content intelligence: architecture (2026-11-02)

## What G knows about a creator (built)

G's context is built from the caller's own data only, through RLS, never the service role:
- the assessment: metrics with provenance;
- the classification (0024): categories, games, formats;
- language and country;
- the content plan (0029);
- collaborations, with each one's computed next step.

The code is in `lib/g/context.ts` and `lib/g/collab.ts`.

## Idea → approve → script (built; 0029 not applied)

1. **Propose.** G proposes an idea as a `content_draft` (kind `idea`). The prompt (rule 9) requires each idea to state:
   - concept;
   - why it fits this creator;
   - audience;
   - format;
   - hook;
   - source.
   A source may be cited only if it is in G's DATA. Otherwise G says "based on your profile".
2. **Confirm.** The creator edits the proposal in a `ConfirmActionForm`. Confirming calls the ordinary `saveContentItem` server action, which applies the mask, rate limit and ownership checks.
3. **Approve.** In `/content`, **Approve** moves the idea to `drafting`; **Set aside** archives it (`decideIdea`, confirmed).
4. **Script.** "Ask G for a script" pre-fills G's input only; it never auto-sends. G returns a script draft as a new proposal, saved after confirmation again.
5. **Guardrails:**
   - G never executes anything itself;
   - a proposal with an ungrounded figure is dropped;
   - free text is masked (§6.1).

## News and trend monitoring (design only, not built, not running)

Requested: monitor news for the creator's categories, games and esports, using legal sources only.

### Sources

| Requirement | Design |
|---|---|
| Legal sources only | An owner-approved allow-list of official RSS/Atom feeds (game publishers' news pages, esports league feeds) and licensed news APIs. No scraping of sites whose terms forbid it, and no paywalled content. |
| Storage | `news_items(id, source_id, url, title, published_at, terms jsonb, fetched_at)`. Store headline, link and date only, never full articles. Purge after 30 days. |

### Pipeline

| Requirement | Design |
|---|---|
| Matching | Deterministic tags against the taxonomy ids; no model is needed to match. |
| Use in G | Matching items enter G's DATA as citable sources. The rule 9 "source" field can then name a real headline and link. |
| Scheduler | A Vercel cron route, like `/api/cron/youtube-data-freshness`. It needs `CRON_SECRET` (not set in production) and **owner approval to activate**. |
| Cost | Free RSS by default. Any paid news API needs approval (rule 5). |

### Status

- No table, route or cron exists.
- Nothing in the UI claims that monitoring runs.

## Known limits

- Idea quality with the live NVIDIA model was not evaluated in this pass. Without the model, G answers with rules-only cards and does not invent ideas.
- There is no explicit "content goals" field. G uses classification and plan data only.
