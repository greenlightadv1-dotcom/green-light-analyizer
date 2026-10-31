/**
 * Creator classification — the controlled vocabulary for categories, games and
 * content formats (feature 3).
 *
 * Initial taxonomy assumptions, stated rather than hidden:
 * - Green Light's existing copy and data are gaming-first (Twitch/Kick/
 *   YouTube streamers, MENA audience), so the game list covers titles and
 *   genres that dominate streaming and sponsorship there, not a full catalogue.
 * - Categories are the broad content verticals the AI pricing already reads
 *   from media_kits.content_category (CATEGORY_CPM in lib/ai/heuristic.ts).
 * - Anything not on the list is "other": a creator is never forced into a
 *   wrong slot, and the list grows by adding an id here (no migration; the
 *   columns in 0024 only bound the array length).
 *
 * Ids are stable, lowercase and language-neutral; labels are translated in the
 * dictionaries under `taxonomy.*` (game titles are proper nouns and are not
 * translated).
 *
 * Pure — unit-tested in taxonomy.test.ts.
 */

export const CONTENT_CATEGORIES = [
  "gaming",
  "esports",
  "tech",
  "entertainment",
  "education",
  "lifestyle",
  "beauty",
  "fitness",
  "finance",
  "food",
  "travel",
  "music",
  "other",
] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

/** Game ids and their display titles (proper nouns, shown untranslated). */
export const GAMES = {
  valorant: "Valorant",
  counter_strike: "Counter-Strike 2",
  league_of_legends: "League of Legends",
  dota2: "Dota 2",
  fortnite: "Fortnite",
  minecraft: "Minecraft",
  gta: "Grand Theft Auto V / Online",
  call_of_duty: "Call of Duty",
  pubg: "PUBG / PUBG Mobile",
  free_fire: "Free Fire",
  roblox: "Roblox",
  ea_fc: "EA SPORTS FC",
  apex_legends: "Apex Legends",
  rocket_league: "Rocket League",
  mobile_legends: "Mobile Legends",
  genshin_impact: "Genshin Impact",
  just_chatting: "Just Chatting",
  variety: "Variety / multiple games",
  other_game: "Other game",
} as const;
export type GameId = keyof typeof GAMES;
export const GAME_IDS = Object.keys(GAMES) as GameId[];

export const CONTENT_FORMATS = [
  "live_stream",
  "long_video",
  "short_video",
  "esports_casting",
  "tutorials",
  "reviews",
  "podcast",
  "social_posts",
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

/** Limits match the CHECK constraints in migration 0024. */
export const TAXONOMY_LIMITS = { categories: 6, games: 12, formats: 8 } as const;

export type CreatorClassification = {
  creator_categories: ContentCategory[];
  creator_games: GameId[];
  content_formats: ContentFormat[];
};

export type ClassificationResult =
  | { ok: true; value: CreatorClassification }
  | { ok: false; error: string };

function pick<T extends string>(
  raw: readonly unknown[],
  allowed: readonly T[],
  limit: number,
  label: string,
): { ok: true; value: T[] } | { ok: false; error: string } {
  const seen = new Set<T>();
  for (const item of raw) {
    if (typeof item !== "string" || !(allowed as readonly string[]).includes(item)) {
      return { ok: false, error: `Unknown ${label}.` };
    }
    seen.add(item as T);
  }
  if (seen.size > limit) return { ok: false, error: `Pick at most ${limit} ${label}.` };
  // Stable order: the order of the allowed list, not the submitted order.
  return { ok: true, value: allowed.filter((a) => seen.has(a)) };
}

/**
 * Validate a submitted classification. Every value must be a known id;
 * duplicates collapse; unknown values are refused rather than silently
 * dropped, so a tampered form fails loudly instead of saving half of it.
 */
export function parseClassification(input: {
  categories: readonly unknown[];
  games: readonly unknown[];
  formats: readonly unknown[];
}): ClassificationResult {
  const categories = pick(input.categories, CONTENT_CATEGORIES, TAXONOMY_LIMITS.categories, "categories");
  if (!categories.ok) return categories;
  const games = pick(input.games, GAME_IDS, TAXONOMY_LIMITS.games, "games");
  if (!games.ok) return games;
  const formats = pick(input.formats, CONTENT_FORMATS, TAXONOMY_LIMITS.formats, "content formats");
  if (!formats.ok) return formats;
  return {
    ok: true,
    value: {
      creator_categories: categories.value,
      creator_games: games.value,
      content_formats: formats.value,
    },
  };
}

/** Keeps only known ids, for reading stored or RPC data defensively. */
export function knownCategories(values: readonly string[] | null | undefined): ContentCategory[] {
  return CONTENT_CATEGORIES.filter((c) => values?.includes(c));
}
export function knownGames(values: readonly string[] | null | undefined): GameId[] {
  return GAME_IDS.filter((g) => values?.includes(g));
}
export function knownFormats(values: readonly string[] | null | undefined): ContentFormat[] {
  return CONTENT_FORMATS.filter((f) => values?.includes(f));
}

export function gameTitle(id: string): string {
  return (GAMES as Record<string, string>)[id] ?? id;
}
