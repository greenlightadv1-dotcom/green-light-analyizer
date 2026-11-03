/**
 * Collaboration lifecycle rules shared by the server actions and the UI
 * (migration 0026). Pure, so it is unit-tested directly. The database
 * functions enforce the same rules on their own; this module only decides
 * which buttons to show and how to read a refusal.
 */
import type {
  BriefStatus,
  CollaborationStatus,
  DeliverableStatus,
  InvitationStatus,
  SponsorshipType,
} from "../types/database.ts";
import { SEED_TAXONOMY, knownBriefCategories, type TaxonomySnapshot } from "../taxonomy.ts";

export const BRIEF_PLATFORMS = ["youtube", "twitch", "kick", "instagram", "tiktok", "x"] as const;
export const SPONSORSHIP_TYPES: SponsorshipType[] = [
  "video_dedicated", "integration", "story_share", "live_mention", "post", "other",
];
export const LIMITS = {
  title: [3, 120],
  description: [10, 5000],
  summary: 2000,
  message: 2000,
  note: 2000,
  terms: [10, 5000],
  deliverableTitle: [2, 120],
  reason: [3, 1000],
  countries: 20,
  categories: 10,
  amountMax: 10_000_000,
} as const;

/** Map a database refusal ("collab:<code> …") to a dictionary key. */
const KNOWN = new Set([
  "not_found", "brief_not_published", "creator_not_found", "already_invited", "invalid_state",
  "note_required", "invalid_input", "no_terms", "not_active", "too_many", "no_deliverables",
  "deliverables_open",
]);
export function collabErrorKey(message: string | null | undefined): string {
  const m = /collab:([a-z_]+)/.exec(message ?? "");
  return m && KNOWN.has(m[1]) ? `collab.errors.${m[1]}` : "ui.errors.generic";
}

/** A US-dollar amount: digits with up to two decimals, within bounds. */
export function parseAmount(raw: unknown, { required = false } = {}): { ok: true; value: number | null } | { ok: false } {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s) return required ? { ok: false } : { ok: true, value: null };
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(s)) return { ok: false };
  const n = Number(s);
  return n >= 0 && n <= LIMITS.amountMax ? { ok: true, value: n } : { ok: false };
}

export function parseDay(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(`${s}T00:00:00Z`))) return { ok: false };
  return { ok: true, value: s };
}

const within = (s: string, [min, max]: readonly [number, number]) => s.length >= min && s.length <= max;

export type BriefInput = {
  title: string;
  description: string;
  sponsorship_type: SponsorshipType | null;
  platforms: string[];
  target_countries: string[];
  categories: string[];
  deliverables_summary: string | null;
  budget_min_usd: number | null;
  budget_max_usd: number | null;
  start_date: string | null;
  due_date: string | null;
};

/**
 * Validate a brief form. Text is trimmed but not masked here: the server
 * masks contact details before saving. Unknown platforms, categories and
 * malformed country codes are dropped rather than stored.
 */
export function parseBrief(f: Record<string, unknown>, snap: TaxonomySnapshot = SEED_TAXONOMY): { ok: true; value: BriefInput } | { ok: false; errorKey: string } {
  const title = String(f.title ?? "").trim();
  const description = String(f.description ?? "").trim();
  if (!within(title, LIMITS.title)) return { ok: false, errorKey: "collab.errors.title" };
  if (!within(description, LIMITS.description)) return { ok: false, errorKey: "collab.errors.description" };
  const summary = String(f.deliverables_summary ?? "").trim();
  if (summary.length > LIMITS.summary) return { ok: false, errorKey: "collab.errors.invalid_input" };
  const type = String(f.sponsorship_type ?? "");
  const min = parseAmount(f.budget_min_usd);
  const max = parseAmount(f.budget_max_usd);
  if (!min.ok || !max.ok) return { ok: false, errorKey: "collab.errors.amount" };
  if (min.value !== null && max.value !== null && max.value < min.value) return { ok: false, errorKey: "collab.errors.budget_order" };
  const start = parseDay(f.start_date);
  const due = parseDay(f.due_date);
  if (!start.ok || !due.ok) return { ok: false, errorKey: "collab.errors.date" };
  if (start.value && due.value && due.value < start.value) return { ok: false, errorKey: "collab.errors.date_order" };
  const list = (v: unknown) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim()).filter(Boolean);
  const platforms = [...new Set(list(f.platforms))].filter((p) => (BRIEF_PLATFORMS as readonly string[]).includes(p));
  const countries = [...new Set(list(f.target_countries).map((c) => c.toUpperCase()))]
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .slice(0, LIMITS.countries);
  // Content categories and admin-defined campaign categories (0033); unknown ids are dropped.
  const categories = knownBriefCategories(list(f.categories), snap).slice(0, LIMITS.categories);
  return {
    ok: true,
    value: {
      title,
      description,
      sponsorship_type: (SPONSORSHIP_TYPES as string[]).includes(type) ? (type as SponsorshipType) : null,
      platforms,
      target_countries: countries,
      categories,
      deliverables_summary: summary || null,
      budget_min_usd: min.value,
      budget_max_usd: max.value,
      start_date: start.value,
      due_date: due.value,
    },
  };
}

/** Which brief actions the owning company may take. */
export function briefActions(status: BriefStatus): { edit: boolean; publish: boolean; archive: boolean; invite: boolean } {
  return {
    edit: status !== "archived",
    publish: status === "draft",
    archive: status !== "archived",
    invite: status === "published",
  };
}

export type Side = "company" | "creator";

/** Invitation actions per side and status (mirrors 0026). */
export function invitationActions(side: Side, status: InvitationStatus) {
  return {
    accept: side === "creator" && status === "pending",
    decline: side === "creator" && (status === "pending" || status === "changes_requested"),
    requestChanges: side === "creator" && status === "pending",
    revise: side === "company" && status === "changes_requested",
    withdraw: side === "company" && (status === "pending" || status === "changes_requested"),
  };
}

/** Collaboration-level actions per side and state (mirrors 0026). */
export function collaborationActions(
  side: Side,
  c: {
    status: CollaborationStatus;
    proposed_terms: string | null;
    proposed_amount_usd: number | null;
    company_confirmed_at: string | null;
    creator_confirmed_at: string | null;
  },
  deliverables: { status: DeliverableStatus }[],
) {
  const negotiating = c.status === "negotiating";
  const hasTerms = c.proposed_terms !== null && c.proposed_amount_usd !== null;
  const confirmedBySide = side === "company" ? c.company_confirmed_at !== null : c.creator_confirmed_at !== null;
  return {
    proposeTerms: negotiating,
    confirmTerms: negotiating && hasTerms && !confirmedBySide,
    addDeliverable: side === "company" && (negotiating || c.status === "active"),
    complete:
      side === "company" && c.status === "active" && deliverables.length > 0 && deliverables.every((d) => d.status === "approved"),
    cancel: negotiating || c.status === "active",
  };
}

/** Deliverable-level actions (mirrors 0026). */
export function deliverableActions(side: Side, collab: CollaborationStatus, d: { status: DeliverableStatus; submitted_at: string | null }) {
  const active = collab === "active";
  return {
    submit: side === "creator" && active && (d.status === "pending" || d.status === "revision_requested"),
    review: side === "company" && active && d.status === "submitted",
    remove: side === "company" && (collab === "negotiating" || active) && d.status === "pending" && d.submitted_at === null,
  };
}
