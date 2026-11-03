# Taxonomy and gaming catalog (updated 2026-11-03)

## Source of truth: `taxonomy_terms` (migration 0033, not applied)

| Kind | Used for | Stored on |
|---|---|---|
| `category` | Content verticals | `profiles.creator_categories`, `briefs.categories` |
| `genre` | Groups games (parent of `game`) | (structure only) |
| `game` | Games a creator plays | `profiles.creator_games` |
| `format` | Content formats | `profiles.content_formats` |
| `sport`, `interest`, `specialization` | Creator tags | `profiles.creator_tags` (new) |
| `campaign_category` | Extra brief categories a company can pick | `briefs.categories` |

Each term has a stable `id` (the stored value), English and Arabic labels and descriptions, a parent, an active flag and a sort order.

## Seed and compatibility

- 0033 inserts **exactly** the ids already in use: 13 categories, 19 games and 8 formats, the list `src/lib/taxonomy.ts` held.
- It adds 7 genres as parents of those games.
- Every stored selection stays valid, and `taxonomy.test.ts` pins the code seed to the SQL seed.
- No sports, interests, specializations or campaign categories are seeded; admins add them. Nothing was invented.
- `src/lib/taxonomy.ts` keeps the seed only as the fallback when the table is absent. Every consumer reads one snapshot, loaded once per request (`lib/taxonomy-server.ts`) and passed down (`TaxonomyProvider`):
  - onboarding and Media Kit pickers;
  - Discover filters;
  - the brief form;
  - G's brief builder;
  - server validation.

## Rules

| Rule | Where |
|---|---|
| Ids `^[a-z0-9_]{2,40}$`, never renamed; kind frozen after creation | DB constraint and trigger |
| Parents: game → genre or category; genre/sport/interest/specialization/campaign category → category; no cycles | DB trigger `taxonomy_parent_check` |
| Every id written to profiles or briefs must exist with the right kind | DB trigger and `parseClassification` / `parseBrief` |
| A newly picked id must be active; an id a row already holds stays valid after deactivation | DB trigger and `parseClassification` |
| A term used by a profile, brief or child term cannot be deleted, only deactivated | `taxonomy_delete()` |
| Catalogue is public read; writes are service role from admin-only actions | RLS and grants |

## Admin management (`/admin/taxonomy`)

Admins can:
- add a term;
- edit its labels, descriptions, parent, order and active flag;
- delete a term only while its usage count is 0.

The page shows each term's usage.

## Labels and languages

- Seeded ids keep their dictionary translations in all five languages.
- A term added by an admin shows its Arabic label in Arabic and its English label in every other language. French, Spanish and German labels for new terms are not stored; that is a known limitation.

## Not done

- **Discover filters:** they cover categories and games, with games grouped by genre in the select. Filtering by creator tags is not built, and `creator_directory()` does not return `creator_tags`, since that would need an RPC change.
- **Main / secondary / streamed games:** not built. That needs a role per game and owner sign-off on the UX.
