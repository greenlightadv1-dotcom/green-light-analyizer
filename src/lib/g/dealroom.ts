import type { CollaborationStatus, DealStatus, DeliverableStatus } from "../types/database.ts";
import { maskSensitiveData } from "../mask.ts";
import { nextStep, type NextStep } from "./collab.ts";

/**
 * Deal Room intelligence for G (Phase 1C). Pure — unit-tested in
 * dealroom.test.ts. The loader (dealroom-server.ts) reads the rows with the
 * caller's own client and checks the caller is a party before calling this.
 *
 * Two kinds of output, never mixed:
 *   - RECORDED facts, copied from database columns with their dates: the deal
 *     status and offer, the terms and whether both sides confirmed them
 *     (frozen), the deliverables and their review state.
 *   - INTERPRETATIONS, computed by fixed rules from the conversation and
 *     always labelled as such: questions that look unanswered, and amounts in
 *     messages that differ from the recorded terms.
 * A chat message never changes recorded terms. Only both parties confirming
 * new terms does (0026), and G cannot do that: it prepares, the user confirms.
 */

export type DealRoomRow = {
  id: string;
  creator_id: string | null;
  company_id: string | null;
  deal_status: DealStatus;
  sponsorship_type: string | null;
  offered_amount: number | null;
  created_at: string;
};

export type DealRoomCollab = {
  id: string;
  status: CollaborationStatus;
  proposed_terms: string | null;
  proposed_amount_usd: number | null;
  proposed_by: string | null;
  company_confirmed_at: string | null;
  creator_confirmed_at: string | null;
  agreed_amount_usd: number | null;
  agreed_terms: string | null;
  agreed_at: string | null;
};

export type DealRoomDeliverable = {
  title: string;
  status: DeliverableStatus;
  due_date: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  revision_count: number;
};

export type DealRoomMessage = { sender_id: string | null; message_text: string; created_at: string };

export type Speaker = "you" | "other_party" | "sponsor_email" | "platform";

export type DealRoomBrief = {
  /** Recorded: the deal row. */
  deal: {
    id: string;
    status: DealStatus;
    source: "in_app" | "email";
    sponsorship_type: string | null;
    offered_amount_usd: number | null;
    created_at: string;
  };
  /** Recorded: the collaboration terms, if this room belongs to one. */
  terms: {
    collaboration_id: string;
    state: "none" | "proposed" | "frozen";
    amount_usd: number | null;
    text: string | null;
    proposed_by: "you" | "other_party" | null;
    you_confirmed: boolean;
    other_confirmed: boolean;
    agreed_at: string | null;
    collaboration_status: CollaborationStatus;
  } | null;
  /** Recorded: deliverables with their review state. */
  deliverables: DealRoomDeliverable[];
  /** Recorded, trimmed: the latest messages, masked, oldest first. */
  thread: { total: number; included: number; messages: { from: Speaker; at: string; text: string }[] };
  /** Interpretation: questions from the other side after your last message. */
  openQuestions: { at: string; excerpt: string }[];
  /** Interpretation: amounts in messages that differ from the recorded amount. */
  inconsistencies: { at: string; from: Speaker; mentioned_usd: number; recorded_usd: number; recorded_as: "agreed_amount" | "proposed_amount" | "offered_amount" }[];
  /** Computed from recorded state, for the viewer's side. */
  next: NextStep | DealNextStep;
};

export type DealNextStep = "reply_to_offer" | "negotiate_or_agree" | "await_settlement" | "settled" | "contact_support";

const PLATFORM_PREFIX = "Deal Co-Pilot";
export const THREAD_MAX_MESSAGES = 12;
export const THREAD_MAX_CHARS = 4_000;
const MESSAGE_MAX_CHARS = 500;

export function speakerOf(m: DealRoomMessage, viewerId: string): Speaker {
  if (m.sender_id === viewerId) return "you";
  if (m.sender_id) return "other_party";
  return m.message_text.trimStart().startsWith(PLATFORM_PREFIX) ? "platform" : "sponsor_email";
}

const AMOUNT =
  /(?:[$]\s?(\d[\d,]*(?:\.\d+)?)\s?([kK])?)|(?:\b(\d[\d,]*(?:\.\d+)?)\s?([kK])?\s?(?:usd|us dollars?|dollars?|دولار)(?![A-Za-z]))/gi;

/** Dollar amounts a message states ("$1,200", "1.5k USD", "900 dollars"). */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const raw = (m[1] ?? m[3] ?? "").replace(/,/g, "");
    let v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (m[2] || m[4]) v *= 1_000;
    out.push(v);
  }
  return out;
}

function trimThread(messages: { from: Speaker; at: string; text: string }[]) {
  const recent = messages.slice(-THREAD_MAX_MESSAGES);
  // Keep the newest messages within the character budget.
  const kept: typeof recent = [];
  let used = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const len = recent[i].text.length;
    if (used + len > THREAD_MAX_CHARS && kept.length) break;
    kept.unshift(recent[i]);
    used += len;
  }
  return kept;
}

function dealNext(status: DealStatus): DealNextStep {
  switch (status) {
    case "new":
      return "reply_to_offer";
    case "negotiating":
      return "negotiate_or_agree";
    case "agreed":
      return "await_settlement";
    case "paid":
      return "settled";
    default:
      return "contact_support";
  }
}

export function buildDealRoomBrief(input: {
  viewerId: string;
  viewerSide: "creator" | "company";
  deal: DealRoomRow;
  collaboration: DealRoomCollab | null;
  deliverables: DealRoomDeliverable[];
  messages: DealRoomMessage[];
}): DealRoomBrief {
  const { viewerId, viewerSide, deal, collaboration: c } = input;
  const all = input.messages
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((m) => ({
      from: speakerOf(m, viewerId),
      at: m.created_at,
      // Stored text is already masked (§6.1); masked again in case a row
      // predates that rule, and capped so one long email cannot crowd out the rest.
      text: maskSensitiveData(m.message_text).maskedText.slice(0, MESSAGE_MAX_CHARS),
    }));

  let terms: DealRoomBrief["terms"] = null;
  if (c) {
    const youConfirmed = Boolean(viewerSide === "company" ? c.company_confirmed_at : c.creator_confirmed_at);
    const otherConfirmed = Boolean(viewerSide === "company" ? c.creator_confirmed_at : c.company_confirmed_at);
    const frozen = Boolean(c.agreed_at) || ["active", "completed"].includes(c.status);
    terms = {
      collaboration_id: c.id,
      state: frozen ? "frozen" : c.proposed_terms ? "proposed" : "none",
      amount_usd: frozen ? c.agreed_amount_usd : c.proposed_amount_usd,
      text: maskSensitiveData((frozen ? c.agreed_terms : c.proposed_terms) ?? "").maskedText.slice(0, 1_000) || null,
      proposed_by: c.proposed_by ? (c.proposed_by === viewerId ? "you" : "other_party") : null,
      you_confirmed: youConfirmed,
      other_confirmed: otherConfirmed,
      agreed_at: c.agreed_at,
      collaboration_status: c.status,
    };
  }

  // The amount the conversation is checked against: frozen terms first, then
  // the terms on the table, then the sponsor's stated offer.
  const reference: { usd: number; as: DealRoomBrief["inconsistencies"][number]["recorded_as"] } | null =
    terms?.state === "frozen" && terms.amount_usd !== null
      ? { usd: Number(terms.amount_usd), as: "agreed_amount" }
      : terms?.state === "proposed" && terms.amount_usd !== null
        ? { usd: Number(terms.amount_usd), as: "proposed_amount" }
        : deal.offered_amount !== null
          ? { usd: Number(deal.offered_amount), as: "offered_amount" }
          : null;

  const inconsistencies: DealRoomBrief["inconsistencies"] = [];
  if (reference && reference.usd > 0) {
    for (const m of all) {
      if (m.from === "platform") continue; // the Co-Pilot's own recommendation is not a party's statement
      for (const v of amountsIn(m.text)) {
        if (Math.abs(v - reference.usd) > 0.05 * reference.usd) {
          inconsistencies.push({ at: m.at, from: m.from, mentioned_usd: v, recorded_usd: reference.usd, recorded_as: reference.as });
        }
      }
    }
  }

  // Unanswered-looking questions: from anyone but you and the platform, after
  // your last message. A heuristic, labelled as an interpretation.
  const lastMine = all.map((m) => m.from).lastIndexOf("you");
  const openQuestions = all
    .slice(lastMine + 1)
    .filter((m) => (m.from === "other_party" || m.from === "sponsor_email") && /[?؟]/.test(m.text))
    .slice(-3)
    .map((m) => ({ at: m.at, excerpt: m.text.slice(0, 240) }));

  const thread = trimThread(all);
  return {
    deal: {
      id: deal.id,
      status: deal.deal_status,
      source: deal.company_id ? "in_app" : "email",
      sponsorship_type: deal.sponsorship_type,
      offered_amount_usd: deal.offered_amount === null ? null : Number(deal.offered_amount),
      created_at: deal.created_at,
    },
    terms,
    deliverables: input.deliverables,
    thread: { total: all.length, included: thread.length, messages: thread },
    openQuestions,
    inconsistencies: inconsistencies.slice(-5),
    next: c ? nextStep(viewerSide, c, input.deliverables) : dealNext(deal.deal_status),
  };
}
