# Taxonomy and gaming catalog (2026-11-02)

## Today: a controlled list in code

Defined in `src/lib/taxonomy.ts` and stored in `profiles.creator_categories`, `creator_games` and `content_formats` (migration 0024, applied).

| List | Items | Limit per creator |
|---|---|---|
| Categories | 13: gaming, esports, tech, entertainment, education, lifestyle, beauty, fitness, finance, food, travel, music, other | 6 |
| Games | 19, among them Valorant, Counter-Strike 2, League of Legends, Dota 2, Fortnite, Minecraft, GTA V / Online, Call of Duty, PUBG / PUBG Mobile, Free Fire, Roblox, EA SPORTS FC, Apex Legends, Rocket League, Mobile Legends, Genshin Impact, plus "Just Chatting", "Variety" and "Other game" | 12 |
| Formats | 8: live stream, long video, short video, esports casting, tutorials, reviews, podcast, social posts | 8 |

### Properties

- Ids are stable, lowercase and language-neutral.
- Category and format labels are translated in all five dictionaries (`taxonomy.*`). Game titles are proper nouns and stay untranslated.
- The lists are validated on the server before any write; the columns are not client-writable.
- Discover filters and G's brief parser (`lib/g/brief-text.ts`, English and Arabic aliases) use the same ids.

## Not built (requested)

| Requirement | Why not yet | Plan |
|---|---|---|
| Database-backed, admin-managed list | Needs a migration and an admin UI. Changing ids under live profiles is a data-integrity risk. | `taxonomy_terms(id text pk, kind, parent_id, label_en, label_ar, active, sort)`. Seed it with **exactly the current ids**, so stored values stay valid. Add a foreign-key-style check through a trigger (arrays cannot hold FKs). Add an admin CRUD page; deactivate terms, never delete them. |
| Genres (FPS, MOBA, battle royale …) and parent/child | Same | `parent_id` on game terms. Discover filters by genre and expands to its games. |
| Main, secondary and streamed games | One flat list today | Add `creator_game_roles(profile_id, game_id, role main\|secondary\|streamed)`, or a jsonb column. Backfill: the first stored game becomes main. Owner sign-off on the UX first. |
| Arabic labels for game titles | Proper nouns | Optional `label_ar` once the table exists |

## Assumptions

- The game list reflects titles popular with MENA creators; it was not drawn from market data.
- Adding a game is a code change today, and will be an admin action after the table exists.
