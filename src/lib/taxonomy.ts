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
/** A category id. The seed list above, plus anything an admin adds (0033). */
export type ContentCategory = string;

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
export type GameId = string;
export const GAME_IDS = Object.keys(GAMES) as (keyof typeof GAMES)[];

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
export type ContentFormat = string;

/** Limits match the CHECK constraints in migration 0024. */
export const TAXONOMY_LIMITS = { categories: 6, games: 12, formats: 8, tags: 20 } as const;

export type CreatorClassification = {
  creator_categories: ContentCategory[];
  creator_games: GameId[];
  content_formats: ContentFormat[];
  creator_tags: string[];
};

export type ClassificationResult =
  | { ok: true; value: CreatorClassification }
  | { ok: false; error: string };

function pick(
  raw: readonly unknown[],
  allowed: string[],
  limit: number,
  label: string,
): { ok: true; value: string[] } | { ok: false; error: string } {
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || !allowed.includes(item)) return { ok: false, error: `Unknown ${label}.` };
    seen.add(item);
  }
  if (seen.size > limit) return { ok: false, error: `Pick at most ${limit} ${label}.` };
  // Stable order: the taxonomy's display order, not the submitted order.
  return { ok: true, value: allowed.filter((a) => seen.has(a)) };
}

/** Ids a write may contain: active terms of these kinds, plus whatever the row already holds. */
function allowedIds(snap: TaxonomySnapshot, kinds: TermKind[], previous: readonly string[] | null | undefined): string[] {
  return termsOf(snap, kinds, { activeOnly: false })
    .filter((t) => t.active || (previous ?? []).includes(t.id))
    .map((t) => t.id);
}

/**
 * Validate a submitted classification against the taxonomy. Every value must
 * be a known id of the right kind; a deactivated term is accepted only if the
 * profile already had it (so deactivating never forces anyone to change);
 * duplicates collapse; unknown values are refused rather than silently
 * dropped. The database trigger in 0033 applies the same rule.
 */
export function parseClassification(
  input: { categories: readonly unknown[]; games: readonly unknown[]; formats: readonly unknown[]; tags?: readonly unknown[] },
  snap: TaxonomySnapshot = SEED_TAXONOMY,
  previous: Partial<CreatorClassification> = {},
): ClassificationResult {
  const categories = pick(input.categories, allowedIds(snap, ["category"], previous.creator_categories), TAXONOMY_LIMITS.categories, "categories");
  if (!categories.ok) return categories;
  const games = pick(input.games, allowedIds(snap, ["game"], previous.creator_games), TAXONOMY_LIMITS.games, "games");
  if (!games.ok) return games;
  const formats = pick(input.formats, allowedIds(snap, ["format"], previous.content_formats), TAXONOMY_LIMITS.formats, "content formats");
  if (!formats.ok) return formats;
  const tags = pick(input.tags ?? [], allowedIds(snap, TAG_KINDS, previous.creator_tags), TAXONOMY_LIMITS.tags, "tags");
  if (!tags.ok) return tags;
  return {
    ok: true,
    value: { creator_categories: categories.value, creator_games: games.value, content_formats: formats.value, creator_tags: tags.value },
  };
}

function known(snap: TaxonomySnapshot, kinds: TermKind[], values: readonly string[] | null | undefined): string[] {
  return termsOf(snap, kinds, { activeOnly: false }).map((t) => t.id).filter((id) => values?.includes(id));
}

/** Keeps only known ids, for reading stored or RPC data defensively. */
export function knownCategories(values: readonly string[] | null | undefined, snap: TaxonomySnapshot = SEED_TAXONOMY): ContentCategory[] {
  return known(snap, ["category"], values);
}
export function knownGames(values: readonly string[] | null | undefined, snap: TaxonomySnapshot = SEED_TAXONOMY): GameId[] {
  return known(snap, ["game"], values);
}
export function knownFormats(values: readonly string[] | null | undefined, snap: TaxonomySnapshot = SEED_TAXONOMY): ContentFormat[] {
  return known(snap, ["format"], values);
}
export function knownTags(values: readonly string[] | null | undefined, snap: TaxonomySnapshot = SEED_TAXONOMY): string[] {
  return known(snap, TAG_KINDS, values);
}
export function knownBriefCategories(values: readonly string[] | null | undefined, snap: TaxonomySnapshot = SEED_TAXONOMY): string[] {
  return known(snap, BRIEF_CATEGORY_KINDS, values);
}

export function gameTitle(id: string, snap: TaxonomySnapshot = SEED_TAXONOMY): string {
  return termById(snap, id)?.label_en ?? (GAMES as Record<string, string>)[id] ?? id;
}

// ---------------------------------------------------------------------------
// Database-backed taxonomy (migration 0033)
// ---------------------------------------------------------------------------
//
// The catalogue lives in public.taxonomy_terms and is managed at
// /admin/taxonomy. The lists above are its SEED (the same ids the migration
// inserts, pinned by taxonomy.test.ts) and the fallback when the table is not
// there yet. Every consumer reads a TaxonomySnapshot: the server loads it
// (lib/taxonomy-server.ts) and passes it down, so there is one list, not one
// per component.

export const TERM_KINDS = ["category", "genre", "game", "sport", "format", "interest", "specialization", "campaign_category"] as const;
export type TermKind = (typeof TERM_KINDS)[number];
export type TaxonomyTerm = {
  id: string;
  kind: TermKind;
  parent_id: string | null;
  label_en: string;
  label_ar: string;
  description_en: string | null;
  description_ar: string | null;
  active: boolean;
  sort_order: number;
};
export type TaxonomySnapshot = { terms: TaxonomyTerm[]; source: "database" | "seed" };

/** Kinds a creator picks as tags (profiles.creator_tags). */
export const TAG_KINDS: TermKind[] = ["sport", "interest", "specialization"];
/** Kinds a brief may carry as categories (briefs.categories). */
export const BRIEF_CATEGORY_KINDS: TermKind[] = ["category", "campaign_category"];

const CATEGORY_EN: Record<string, string> = {
  gaming: "Gaming", esports: "Esports", tech: "Tech", entertainment: "Entertainment", education: "Education", lifestyle: "Lifestyle",
  beauty: "Beauty", fitness: "Fitness", finance: "Finance", food: "Food", travel: "Travel", music: "Music", other: "Other",
};
const FORMAT_EN: Record<string, string> = {
  live_stream: "Live streams", long_video: "Long videos", short_video: "Short videos", esports_casting: "Esports casting",
  tutorials: "Tutorials", reviews: "Reviews", podcast: "Podcast", social_posts: "Social posts",
};
/** Genre parents of the seeded games, as inserted by 0033. */
export const SEED_GENRES: Record<string, { en: string; games: string[] }> = {
  genre_tactical_shooter: { en: "Tactical shooter", games: ["valorant", "counter_strike"] },
  genre_shooter: { en: "Shooter", games: ["call_of_duty"] },
  genre_battle_royale: { en: "Battle royale", games: ["fortnite", "pubg", "free_fire", "apex_legends"] },
  genre_moba: { en: "MOBA", games: ["league_of_legends", "dota2", "mobile_legends"] },
  genre_sandbox: { en: "Sandbox", games: ["minecraft", "roblox"] },
  genre_open_world: { en: "Open world / action", games: ["gta", "genshin_impact"] },
  genre_sports_racing: { en: "Sports and racing", games: ["ea_fc", "rocket_league"] },
};

function seedTerm(id: string, kind: TermKind, label: string, sort: number, parent: string | null = null): TaxonomyTerm {
  return { id, kind, parent_id: parent, label_en: label, label_ar: label, description_en: null, description_ar: null, active: true, sort_order: sort };
}

export const SEED_TAXONOMY: TaxonomySnapshot = {
  source: "seed",
  terms: [
    ...CONTENT_CATEGORIES.map((id, i) => seedTerm(id, "category", CATEGORY_EN[id], id === "other" ? 1000 : (i + 1) * 10)),
    ...Object.entries(SEED_GENRES).map(([id, g], i) => seedTerm(id, "genre", g.en, (i + 1) * 10, "gaming")),
    ...GAME_IDS.map((id, i) => {
      const genre = Object.entries(SEED_GENRES).find(([, g]) => g.games.includes(id))?.[0] ?? "gaming";
      return seedTerm(id, "game", GAMES[id], (i + 1) * 10, genre);
    }),
    ...CONTENT_FORMATS.map((id, i) => seedTerm(id, "format", FORMAT_EN[id], (i + 1) * 10)),
  ],
};

function sorted(terms: TaxonomyTerm[]): TaxonomyTerm[] {
  return [...terms].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

/** Terms of the given kinds, in display order. `activeOnly` hides deactivated ones (pickers). */
export function termsOf(snap: TaxonomySnapshot, kinds: TermKind | TermKind[], { activeOnly = true } = {}): TaxonomyTerm[] {
  const ks = Array.isArray(kinds) ? kinds : [kinds];
  return sorted(snap.terms.filter((t) => ks.includes(t.kind) && (!activeOnly || t.active)));
}

export function termById(snap: TaxonomySnapshot, id: string): TaxonomyTerm | undefined {
  return snap.terms.find((t) => t.id === id);
}

/** Label in the viewer's language: Arabic when asked for and present, else English. */
export function termLabel(snap: TaxonomySnapshot, id: string, locale: string = "en"): string {
  const t = termById(snap, id);
  if (!t) return id;
  return locale === "ar" && t.label_ar.trim() ? t.label_ar : t.label_en;
}
