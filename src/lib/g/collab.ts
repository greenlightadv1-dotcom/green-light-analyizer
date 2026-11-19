import type { CollaborationStatus, ContentKind, DeliverableStatus, InvitationStatus, Role } from "../types/database.ts";
import { maskSensitiveData } from "../mask.ts";

/**
 * G and the collaboration lifecycle, content plans and prepared actions.
 * Pure — unit-tested in collab.test.ts.
 *
 * G prepares; it never executes. A proposal is a filled-in form the user
 * reviews, can edit, and confirms in a dialog; only then does the client call
 * the product's ordinary server action, which re-checks role, ownership,
 * masking and rate limits exactly as if the user had typed it. Everything a
 * proposal refers to must come from the user's own authorized context.
 */

export type CollabSummary = {
  id: string;
  title: string;
  status: CollaborationStatus;
  side: "company" | "creator";
  agreed_amount_usd: number | null;
  deliverables: Record<DeliverableStatus, number>;
  next: NextStep;
};

export type NextStep =
  | "propose_terms"
  | "confirm_terms"
  | "wait_for_other_side"
  | "add_deliverables"
  | "submit_work"
  | "review_work"
  | "wait_for_review"
  | "wait_for_submission"
  | "complete"
  | "done";

type CollabRow = {
  status: CollaborationStatus;
  proposed_terms: string | null;
  company_confirmed_at: string | null;
  creator_confirmed_at: string | null;
};

/** The next step for this side, mirroring the 0026 state machine. */
export function nextStep(side: "company" | "creator", c: CollabRow, deliverables: { status: DeliverableStatus }[]): NextStep {
  if (c.status === "completed" || c.status === "cancelled") return "done";
  if (c.status === "negotiating") {
    if (!c.proposed_terms) return "propose_terms";
    const mine = side === "company" ? c.company_confirmed_at : c.creator_confirmed_at;
    return mine ? "wait_for_other_side" : "confirm_terms";
  }
  const count = (s: DeliverableStatus) => deliverables.filter((d) => d.status === s).length;
  if (!deliverables.length) return side === "company" ? "add_deliverables" : "wait_for_other_side";
  if (side === "creator") {
    if (count("pending") + count("revision_requested")) return "submit_work";
    if (count("submitted")) return "wait_for_review";
    return "wait_for_other_side";
  }
  if (count("submitted")) return "review_work";
  if (count("approved") === deliverables.length) return "complete";
  return "wait_for_submission";
}

export function countDeliverables(ds: { status: DeliverableStatus }[]): Record<DeliverableStatus, number> {
  const out: Record<DeliverableStatus, number> = { pending: 0, submitted: 0, revision_requested: 0, approved: 0 };
  for (const d of ds) out[d.status] += 1;
  return out;
}

export type InvitationSummary = { id: string; brief_id: string; title: string; status: InvitationStatus; proposed_amount_usd: number | null };

// ---------------------------------------------------------------------------
// Prepared actions (proposals)
// ---------------------------------------------------------------------------

export type GProposal =
  | { type: "content_draft"; kind: ContentKind; title: string; body: string }
  | { type: "invitation"; brief_id: string; creator_id: string; message: string; creator_name?: string }
  | { type: "message_draft"; collaboration_id: string; text: string }
  /**
   * A campaign brief G filled in for a company. Confirming saves it as a
   * DRAFT through the ordinary brief action (validation, masking, rate
   * limit); it is never published or sent to anyone from G.
   */
  | {
      type: "brief_draft";
      title: string;
      description: string;
      platforms: string[];
      categories: string[];
      target_countries: string[];
      budget_min_usd: number | null;
      budget_max_usd: number | null;
      /**
       * Idempotency key (0038), assigned by the server route after filtering,
       * never taken from the model. The same prepared draft always carries the
       * same key, so saving it twice creates one brief.
       */
      request_key?: string;
    };

export type ProposalScope = {
  role: Role;
  /** Company: its own published briefs. */
  publishedBriefIds: ReadonlySet<string>;
  /** Company: creators from the authorized directory. */
  creatorIds: ReadonlySet<string>;
  /** Pairs already invited, as `${brief}:${creator}`. */
  invited: ReadonlySet<string>;
  /** Collaborations the user is a party to. */
  collaborationIds: ReadonlySet<string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: ContentKind[] = ["idea", "script", "hook", "title", "description"];
const clean = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? maskSensitiveData(v.trim().slice(0, max)).maskedText : null;

/**
 * Keep only proposals this user could make themselves, with ids from their
 * own context and text masked. Unknown types, another role's proposal, an id
 * outside the scope, or a pair already invited are dropped. At most 2.
 */
export function allowedProposals(candidates: unknown, scope: ProposalScope): GProposal[] {
  if (!Array.isArray(candidates) || scope.role === "admin") return [];
  const out: GProposal[] = [];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    if (r.type === "content_draft" && scope.role === "creator") {
      const kind = KINDS.includes(r.kind as ContentKind) ? (r.kind as ContentKind) : null;
      const title = clean(r.title, 160);
      const body = clean(r.body, 4000);
      if (kind && title && body) out.push({ type: "content_draft", kind, title, body });
    } else if (r.type === "invitation" && scope.role === "company") {
      const brief = typeof r.brief_id === "string" && UUID.test(r.brief_id) ? r.brief_id : null;
      const creator = typeof r.creator_id === "string" && UUID.test(r.creator_id) ? r.creator_id : null;
      const message = clean(r.message, 2000);
      if (brief && creator && message && scope.publishedBriefIds.has(brief) && scope.creatorIds.has(creator) && !scope.invited.has(`${brief}:${creator}`)) {
        out.push({ type: "invitation", brief_id: brief, creator_id: creator, message });
      }
    } else if (r.type === "brief_draft" && scope.role === "company") {
      const title = clean(r.title, 120);
      const description = clean(r.description, 5000);
      const short = (v: unknown, max: number) =>
        Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && /^[a-z0-9_-]{1,40}$/i.test(x)))].slice(0, max) : [];
      const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10_000_000 ? Math.round(v) : null);
      const min = money(r.budget_min_usd);
      const max = money(r.budget_max_usd);
      if (title && title.length >= 3 && description && description.length >= 10) {
        out.push({
          type: "brief_draft",
          title,
          description,
          platforms: short(r.platforms, 6),
          categories: short(r.categories, 10),
          target_countries: short(r.target_countries, 20).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)),
          budget_min_usd: min !== null && max !== null && min > max ? null : min,
          budget_max_usd: max,
        });
      }
    } else if (r.type === "message_draft") {
      const id = typeof r.collaboration_id === "string" && UUID.test(r.collaboration_id) ? r.collaboration_id : null;
      const text = clean(r.text, 2000);
      if (id && text && scope.collaborationIds.has(id)) out.push({ type: "message_draft", collaboration_id: id, text });
    }
    if (out.length === 2) break;
  }
  return out;
}

/** The text of a proposal, for the grounding check (no invented figures). */
export function proposalText(p: GProposal): string {
  if (p.type === "content_draft") return `${p.title}\n${p.body}`;
  if (p.type === "invitation") return p.message;
  if (p.type === "brief_draft") return [p.title, p.description, p.budget_min_usd ?? "", p.budget_max_usd ?? ""].join("\n");
  return p.text;
}

/** Which proposal types the prompt may offer this role. */
export function proposalTypesFor(role: Role): GProposal["type"][] {
  return role === "creator" ? ["content_draft", "message_draft"] : role === "company" ? ["invitation", "message_draft", "brief_draft"] : [];
}

// ---------------------------------------------------------------------------
// Opportunities for a creator: published briefs matched to their own profile
// ---------------------------------------------------------------------------

export type OpportunityBrief = {
  id: string;
  title: string;
  platforms: string[] | null;
  categories: string[] | null;
  target_countries: string[] | null;
  budget_min_usd: number | null;
  budget_max_usd: number | null;
  due_date: string | null;
};

export type OpportunityMatch = {
  brief_id: string;
  title: string;
  /** Criteria the brief states and this creator meets, from the creator's own data. */
  matched: { kind: "category" | "platform" | "country"; values: string[] }[];
  /** Criteria the brief states that the creator's data does not show. */
  unmatched: ("category" | "platform" | "country")[];
  budget_min_usd: number | null;
  budget_max_usd: number | null;
  due_date: string | null;
  invited: boolean;
};

/**
 * Which published briefs fit this creator, and why, using only what the
 * creator's own profile and media kits state (categories, connected
 * platforms, top audience countries). A brief that states a criterion the
 * creator does not meet is still listed with that criterion unmet; a brief
 * that matches nothing is left out. Ordered by how many stated criteria
 * match. Budgets and dates are the sponsor's own figures. Pure.
 */
export function matchOpportunities(
  creator: { categories: readonly string[]; platforms: readonly string[]; countries: readonly string[] },
  briefs: readonly OpportunityBrief[],
  invitedBriefIds: ReadonlySet<string>,
  max = 5,
): OpportunityMatch[] {
  const lower = (xs: readonly string[] | null | undefined) => (xs ?? []).map((x) => x.toLowerCase());
  const mine = { category: lower(creator.categories), platform: lower(creator.platforms), country: lower(creator.countries) };
  const out: (OpportunityMatch & { score: number })[] = [];
  for (const b of briefs) {
    const stated = { category: lower(b.categories), platform: lower(b.platforms), country: lower(b.target_countries) };
    const matched: OpportunityMatch["matched"] = [];
    const unmatched: OpportunityMatch["unmatched"] = [];
    for (const kind of ["category", "platform", "country"] as const) {
      if (!stated[kind].length) continue;
      const hit = stated[kind].filter((v) => mine[kind].includes(v));
      if (hit.length) matched.push({ kind, values: hit.map((v) => (kind === "country" ? v.toUpperCase() : v)) });
      else unmatched.push(kind);
    }
    if (!matched.length) continue;
    out.push({
      brief_id: b.id,
      title: b.title,
      matched,
      unmatched,
      budget_min_usd: b.budget_min_usd,
      budget_max_usd: b.budget_max_usd,
      due_date: b.due_date,
      invited: invitedBriefIds.has(b.id),
      score: matched.length * 10 - unmatched.length,
    });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ score: _score, ...m }) => m);
}
