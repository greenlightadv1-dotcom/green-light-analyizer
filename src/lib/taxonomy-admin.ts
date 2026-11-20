import { TERM_KINDS, type TermKind } from "./taxonomy.ts";

/**
 * Validation of an admin's taxonomy edit (0033). Pure — tested in
 * taxonomy.test.ts. The database re-checks ids, parent kinds, cycles and the
 * frozen kind; this gives the admin a precise message first.
 */
export type TermInput = {
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

const ID = /^[a-z0-9_]{2,40}$/;
const clean = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  return s.length > max ? null : s;
};

export function parseTermInput(f: Record<string, unknown>): { ok: true; value: TermInput } | { ok: false; field: string } {
  const id = typeof f.id === "string" ? f.id.trim().toLowerCase() : "";
  if (!ID.test(id)) return { ok: false, field: "id" };
  const kind = String(f.kind ?? "") as TermKind;
  if (!TERM_KINDS.includes(kind)) return { ok: false, field: "kind" };
  const parentRaw = typeof f.parent_id === "string" ? f.parent_id.trim() : "";
  if (parentRaw && !ID.test(parentRaw)) return { ok: false, field: "parent_id" };
  if (parentRaw === id) return { ok: false, field: "parent_id" };
  const label_en = clean(f.label_en, 80);
  const label_ar = clean(f.label_ar, 80);
  if (!label_en) return { ok: false, field: "label_en" };
  if (!label_ar) return { ok: false, field: "label_ar" };
  const description_en = clean(f.description_en, 300);
  const description_ar = clean(f.description_ar, 300);
  if (description_en === null) return { ok: false, field: "description_en" };
  if (description_ar === null) return { ok: false, field: "description_ar" };
  const sort = Number(f.sort_order ?? 100);
  if (!Number.isInteger(sort) || sort < 0 || sort > 10000) return { ok: false, field: "sort_order" };
  return {
    ok: true,
    value: {
      id,
      kind,
      parent_id: parentRaw || null,
      label_en,
      label_ar,
      description_en: description_en || null,
      description_ar: description_ar || null,
      active: f.active === "on" || f.active === true,
      sort_order: sort,
    },
  };
}

const KNOWN = new Set(["parent_missing", "parent_kind", "cycle", "too_deep", "kind_frozen", "in_use", "not_found", "unknown_term"]);
export function taxonomyErrorMessage(message: string | null | undefined): string {
  const m = /taxonomy:([a-z_]+)/.exec(message ?? "");
  const code = m && KNOWN.has(m[1]) ? m[1] : null;
  switch (code) {
    case "parent_missing": return "That parent term does not exist.";
    case "parent_kind": return "That parent is not allowed for this kind (a game goes under a genre or category; a genre, sport, interest, specialization or campaign category under a category).";
    case "cycle": return "That parent would create a loop.";
    case "too_deep": return "The hierarchy is too deep.";
    case "kind_frozen": return "A term's kind cannot change once created. Create a new term and deactivate this one.";
    case "in_use": return "This term is used by profiles, briefs or child terms. Deactivate it instead.";
    case "not_found": return "That term no longer exists.";
    default: return "The change could not be saved.";
  }
}
