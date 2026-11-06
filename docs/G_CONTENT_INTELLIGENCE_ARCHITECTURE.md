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

## Official news (built 2026-11-03; migration 0037 not applied; not scheduled)

### Sources

The allow-list lives in `src/lib/news/sources.ts`. Each source was verified live on 2026-11-03 through an external fetch, because the sandbox network blocks these hosts.

| Source | Official? | Cost | What is kept |
|---|---|---|---|
| YouTube Official Blog RSS (`https://blog.youtube/rss/`) | Yes (Google) | Free | Headline, link, publication date |
| Valve Steam Web API `ISteamNews/GetNewsForApp` for CS2, Dota 2, PUBG, Apex Legends, Rocket League | Yes (Valve; documented, no key) | Free | Developer announcements only. Third-party press items in the same feed are dropped. |

- Each link must be https and on the source's own host.
- No article text is stored or shown. Nothing is generated or summarised.
- Terms still need owner and legal review: the Steam Web API Terms of Use and the YouTube blog's terms. Attribution is the source name and a link back.

### Not included

These were not verified, and their unofficial APIs or scraping are not used:
- Riot Games, Epic, Minecraft, EA, Twitch;
- esports league sites;
- sports bodies.

Each can be added once an official feed is confirmed and the owner approves.

### How it runs

| Path | State |
|---|---|
| `/admin/news` → "Refresh now" | Built. Admin only, one request per source, notifies nobody. |
| `/api/cron/news-refresh` | Built. Off unless `CRON_SECRET` **and** `NEWS_MONITORING_ENABLED=1`. **Not in `vercel.json`**, so nothing runs on a schedule. |
| Retention | Headlines older than 60 days are deleted on each refresh. |

### Where it shows

- **Content plan:** an "Official news for your topics" panel, matched by the creator's taxonomy categories and games (plus YouTube platform news when they have a YouTube kit). Each headline shows its source and publication date.
- **G:** on content questions, up to 5 matching headlines go into DATA as `officialNews`, with title, link, source and date. Prompt rule 9 lets an idea cite only a source present in DATA.

### Not verified

- A refresh has never run from the deployed app; the parsers are tested against the real payloads fetched on 2026-11-03.
- Sports news has no source yet.

## Known limits

- Idea quality with the live NVIDIA model was not evaluated in this pass. Without the model, G answers with rules-only cards and does not invent ideas.
- There is no explicit "content goals" field. G uses classification and plan data only.
