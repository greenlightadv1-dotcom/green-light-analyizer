/**
 * The entity the user is looking at, read from the page path the client sends
 * (Phase 1B). Pure — unit-tested in entity.test.ts.
 *
 * The path is a hint about WHAT to load, never about WHOSE: the server loads
 * the entity with the caller's own client (RLS) and then checks explicitly
 * that the caller is a party to it (lib/g/dealroom-server.ts). An id the
 * caller cannot read gives the same answer as one that does not exist, so G
 * never confirms another user's deal, collaboration or brief exists.
 */

export type PageEntity = { kind: "deal" | "collaboration" | "brief"; id: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ROUTES: [RegExp, PageEntity["kind"]][] = [
  [new RegExp(`^/(?:preview/)?inbox/(${UUID})/?$`, "i"), "deal"],
  [new RegExp(`^/(?:preview/)?collaborations/(${UUID})/?$`, "i"), "collaboration"],
  [new RegExp(`^/(?:preview/)?briefs/(${UUID})/?$`, "i"), "brief"],
];

export function pageEntity(page: string): PageEntity | null {
  for (const [re, kind] of ROUTES) {
    const m = re.exec(page);
    if (m) return { kind, id: m[1].toLowerCase() };
  }
  return null;
}

/**
 * Untrusted text goes into the prompt between `<<<NAME` and `NAME>>>` fences.
 * A user, sponsor or deal-room message containing those markers could close a
 * fence early and make what follows read like the prompt's own text. The
 * markers are replaced by look-alikes before the text is embedded, so a fence
 * can only be opened and closed by the prompt itself.
 */
export function neutraliseFences(text: string): string {
  return text.replace(/<<</g, "‹‹‹").replace(/>>>/g, "›››");
}
