import type { DealStatus, SponsorshipType } from "@/lib/types/database";
import { CATEGORY_CPM, DEFAULT_CPM, TYPE_MULTIPLIER } from "../ai/heuristic.ts";
import { extractOfferedAmount, parseAmountToken } from "../email/parse.ts";
import { isVerifiedGeoFresh } from "../oauth/youtube-freshness.ts";

/**
 * Creator pricing and staged negotiation — the Deal Room's reply co-pilot.
 *
 * Everything the sponsor will read is built here from server-side facts: the
 * deal row, the thread as stored (already masked), and the creator's media kit.
 * No figure is accepted from the browser except the creator's own private
 * minimum, which only steers the draft and never appears in it.
 *
 * Rules this module holds:
 * - Every number in the rate breakdown says where it came from: verified
 *   (fresh OAuth analytics), synced (public platform stats, ≤30 days old),
 *   self-reported (typed into the media kit), estimated (derived from synced
 *   stats), assumption (a Green Light default, not market data), or missing.
 * - Nothing is invented. No reach means no analytics-based rate; no stated
 *   budget means the reply asks for one rather than assuming it.
 * - The first reply explores scope and asks for the budget range before the
 *   creator names a final price.
 * - The private minimum never reaches sponsor-facing text: the deterministic
 *   replies never print it, the model is never given it, and
 *   `revealsPrivateMinimum` rejects any draft that contains it.
 * - Nothing here sends, accepts or commits. Every output is a draft the
 *   creator edits and sends themselves.
 *
 * Pure — unit-tested in negotiation.test.ts.
 */

// --- campaign scope ----------------------------------------------------------

export type CampaignScope = {
  /** Number of deliverables the sponsor named ("2 videos"), or null if not stated. */
  deliverableCount: number | null;
  /** True when the sponsor asked for paid usage / whitelisting / ad rights. */
  paidUsageRequested: boolean;
  /** Usage-rights duration in months when stated, Infinity for "perpetual". */
  usageMonths: number | null;
  /** True when the sponsor asked for category exclusivity. */
  exclusivityRequested: boolean;
  /** Exclusivity length in days when stated. */
  exclusivityDays: number | null;
  /** True when the sponsor mentioned a date, deadline or timeline. */
  timelineStated: boolean;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1, single: 1,
};

const DELIVERABLE_NOUN = String.raw`(?:dedicated\s+)?(?:videos?|integrations?|segments?|posts?|reels?|shorts?|stories|story|tiktoks?|streams?|mentions?|deliverables?)`;

function count(word: string): number | null {
  const n = /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word.toLowerCase()];
  return n && n > 0 && n <= 50 ? n : null;
}

/** Reads scope signals out of the sponsor's own messages. Unknown stays unknown. */
export function extractCampaignScope(sponsorTexts: string[]): CampaignScope {
  const text = sponsorTexts.join("\n").slice(0, 50_000);

  let deliverableCount: number | null = null;
  for (const m of text.matchAll(new RegExp(String.raw`\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|a|an|single)\s+${DELIVERABLE_NOUN}\b`, "gi"))) {
    // The largest single count, not a sum: "2 videos … the videos should…"
    // or "a post about the launch" must not inflate the scope.
    const n = count(m[1]);
    if (n !== null) deliverableCount = Math.max(deliverableCount ?? 0, n);
  }

  const paidUsageRequested =
    /\b(paid\s+(usage|ads?|media|social)|whitelist(ing|ed)?|allowlist(ing)?|spark\s+ads?|ad\s+rights|boost(ing)?\s+(the\s+)?(post|content)|run\s+(it\s+)?as\s+(an?\s+)?ads?)\b/i.test(text);

  let usageMonths: number | null = null;
  if (/\b(perpetual|in\s+perpetuity|forever|unlimited\s+usage)\b/i.test(text)) usageMonths = Infinity;
  else {
    const m = text.match(/\b(\d{1,2})[\s-]*(months?|mo)\b[^.\n]{0,40}\b(usage|rights|license|licence)\b|\b(usage|rights|license|licence)\b[^.\n]{0,40}?\b(\d{1,2})[\s-]*(months?|mo)\b/i);
    const n = m ? Number(m[1] ?? m[5]) : NaN;
    if (Number.isFinite(n) && n > 0) usageMonths = n;
  }

  const exclusivityRequested = /\bexclusiv(e|ity)\b/i.test(text);
  let exclusivityDays: number | null = null;
  if (exclusivityRequested) {
    const m = text.match(/\b(\d{1,3})[\s-]*(days?|weeks?|months?)\b[^.\n]{0,40}\bexclusiv|\bexclusiv\w*\b[^.\n]{0,40}?\b(\d{1,3})[\s-]*(days?|weeks?|months?)\b/i);
    if (m) {
      const n = Number(m[1] ?? m[3]);
      const unit = (m[2] ?? m[4]).toLowerCase();
      exclusivityDays = unit.startsWith("day") ? n : unit.startsWith("week") ? n * 7 : n * 30;
    }
  }

  const timelineStated =
    /\b(deadline|timeline|go[\s-]?live|launch(es|ing)?\s+(on|in)|by\s+(the\s+)?(end\s+of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|next\s+(week|month))|within\s+\d+\s+(days?|weeks?))\b/i.test(text);

  return { deliverableCount, paidUsageRequested, usageMonths, exclusivityRequested, exclusivityDays, timelineStated };
}

/** Whether enough scope is known to quote against (deliverables at minimum). */
export function scopeIsKnown(scope: CampaignScope): boolean {
  return scope.deliverableCount !== null;
}

// --- the suggested rate --------------------------------------------------------

export type Provenance =
  | "verified"
  | "synced"
  | "self_reported"
  | "sponsor_stated"
  | "estimated"
  | "assumption"
  | "missing";

export type RateFactor = { label: string; value: string; provenance: Provenance };

export type RateKit = {
  platform: string;
  avg_views: number | null;
  engagement_rate: number | null;
  content_category: string | null;
  subscriber_count: number | null;
  channel_view_count: number | null;
  media_count: number | null;
  last_synced_at: string | null;
  audience_verified: boolean | null;
  verified_geo_synced_at: string | null;
  /** 0023's clock for the public stats; preferred over last_synced_at when present. */
  youtube_stats_synced_at?: string | null;
};

export type SuggestedRate = {
  /** The figure to aim for, USD. null when there is nothing to base it on. */
  targetUsd: number | null;
  rangeUsd: { low: number; high: number } | null;
  basis: "analytics" | "base_rate" | "none";
  factors: RateFactor[];
  assumptions: string[];
  missing: string[];
};

const DAY_MS = 86_400_000;
const SYNC_FRESH_MS = 30 * DAY_MS;

/** Green Light defaults for scope — labelled as assumptions wherever shown. */
export const PAID_USAGE_UPLIFT = 0.3;
export const PERPETUAL_USAGE_UPLIFT = 0.6;
export const EXCLUSIVITY_UPLIFT_PER_30_DAYS = 0.15;
export const MAX_EXCLUSIVITY_UPLIFT = 0.6;

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function roundRate(n: number): number {
  return Math.max(Math.round(n / 10) * 10, 10);
}

export function suggestRate(input: {
  kit: RateKit | null;
  sponsorshipType: SponsorshipType;
  scope: CampaignScope;
  /** profiles.base_rate_usd — public on the creator's profile page. */
  baseRateUsd: number | null;
  now?: Date;
}): SuggestedRate {
  const now = input.now ?? new Date();
  const kit = input.kit;
  const factors: RateFactor[] = [];
  const assumptions: string[] = [];
  const missing: string[] = [];

  // last_synced_at is also written by other syncs, so the dedicated stats
  // clock wins whenever the row has one.
  const statsClock = kit?.youtube_stats_synced_at ?? kit?.last_synced_at ?? null;
  const syncedAt = statsClock ? Date.parse(statsClock) : NaN;
  const statsSyncedFresh =
    kit?.subscriber_count !== null &&
    kit?.subscriber_count !== undefined &&
    Number.isFinite(syncedAt) &&
    now.getTime() - syncedAt < SYNC_FRESH_MS;

  // Reach: the creator's own figure first; otherwise lifetime views per video
  // from a fresh public-stats sync, which is an estimate, not a measurement
  // of recent performance.
  let reach: number | null = null;
  if (kit?.avg_views && kit.avg_views > 0) {
    reach = kit.avg_views;
    factors.push({ label: "Average views", value: kit.avg_views.toLocaleString("en-US"), provenance: "self_reported" });
  } else if (statsSyncedFresh && kit?.channel_view_count && kit.media_count && kit.media_count > 0) {
    reach = Math.round(kit.channel_view_count / kit.media_count);
    factors.push({
      label: "Average views (lifetime views ÷ videos)",
      value: reach.toLocaleString("en-US"),
      provenance: "estimated",
    });
  } else {
    missing.push("average views");
  }

  if (statsSyncedFresh && kit?.subscriber_count !== null && kit?.subscriber_count !== undefined) {
    factors.push({ label: "Subscribers", value: kit.subscriber_count.toLocaleString("en-US"), provenance: "synced" });
  }

  const engagement = kit?.engagement_rate ?? null;
  if (engagement !== null) {
    factors.push({ label: "Engagement rate", value: `${engagement}%`, provenance: "self_reported" });
  } else {
    missing.push("engagement rate");
  }

  factors.push(
    isVerifiedGeoFresh(kit, now)
      ? { label: "Audience geography", value: "verified via platform analytics", provenance: "verified" }
      : { label: "Audience geography", value: "not verified", provenance: "missing" },
  );

  let base: number | null = null;
  let basis: SuggestedRate["basis"] = "none";

  if (reach !== null) {
    const category = kit?.content_category?.toLowerCase() ?? "";
    const cpm = CATEGORY_CPM[category] ?? DEFAULT_CPM;
    const typeMult = TYPE_MULTIPLIER[input.sponsorshipType] ?? 0.35;
    const engagementMult = Math.min(Math.max((engagement ?? 3) / 4, 0.6), 1.6);
    base = (reach / 1000) * cpm * typeMult * engagementMult;
    basis = "analytics";
    assumptions.push(
      `CPM of $${cpm} for ${CATEGORY_CPM[category] ? category : "an unlisted category"} is a Green Light placeholder benchmark, not market data.`,
    );
    if (engagement === null) assumptions.push("Engagement assumed average (3%) because none is on file.");
  } else if (input.baseRateUsd && input.baseRateUsd > 0) {
    base = input.baseRateUsd;
    basis = "base_rate";
    factors.push({ label: "Your stated base rate", value: usd(input.baseRateUsd), provenance: "self_reported" });
    assumptions.push("No reach on file, so your stated base rate is used as-is for this deliverable.");
  }

  if (base === null) {
    return { targetUsd: null, rangeUsd: null, basis, factors, assumptions, missing };
  }

  // Scope: only what the sponsor actually said changes the figure.
  const deliverables = input.scope.deliverableCount ?? 1;
  if (input.scope.deliverableCount !== null) {
    factors.push({ label: "Deliverables requested", value: String(deliverables), provenance: "sponsor_stated" });
  } else {
    missing.push("number of deliverables");
  }
  let multiplier = deliverables;

  if (input.scope.paidUsageRequested || input.scope.usageMonths !== null) {
    const uplift = input.scope.usageMonths === Infinity ? PERPETUAL_USAGE_UPLIFT : PAID_USAGE_UPLIFT;
    multiplier *= 1 + uplift;
    assumptions.push(`Usage rights add ${Math.round(uplift * 100)}% (Green Light default, not market data).`);
  }
  if (input.scope.exclusivityRequested) {
    const periods = Math.max(1, Math.ceil((input.scope.exclusivityDays ?? 30) / 30));
    const uplift = Math.min(periods * EXCLUSIVITY_UPLIFT_PER_30_DAYS, MAX_EXCLUSIVITY_UPLIFT);
    multiplier *= 1 + uplift;
    assumptions.push(
      `Exclusivity adds ${Math.round(uplift * 100)}%${input.scope.exclusivityDays === null ? ", assuming 30 days because no length was stated" : ""} (Green Light default).`,
    );
  }

  const target = roundRate(base * multiplier);
  return {
    targetUsd: target,
    rangeUsd: { low: roundRate(target * 0.85), high: roundRate(target * 1.25) },
    basis,
    factors,
    assumptions,
    missing,
  };
}

// --- the thread ----------------------------------------------------------------

export type ThreadMessage = { sender_id: string | null; message_text: string };

export type ThreadSummary = {
  sponsorTexts: string[];
  latestSponsorText: string;
  creatorMessageCount: number;
  creatorQuotedUsd: number | null;
  /** The sponsor's most recent stated figure, or the deal's recorded offer. */
  sponsorOfferUsd: number | null;
};

const SYSTEM_PREFIX = "Deal Co-Pilot";

/**
 * Splits a thread into what the sponsor said and what the creator said.
 * System summaries are skipped. In a room with no company account, the first
 * creator-authored message is the offer the creator pasted into the Manual
 * Analyzer, so it is the sponsor's words.
 */
export function summarizeThread(
  messages: ThreadMessage[],
  creatorId: string,
  options: { hasCompanyAccount: boolean; recordedOfferUsd: number | null },
): ThreadSummary {
  const sponsorTexts: string[] = [];
  let creatorMessageCount = 0;
  let creatorQuotedUsd: number | null = null;
  let latestSponsorOffer: number | null = null;
  let pastedOfferSeen = options.hasCompanyAccount;

  for (const m of messages) {
    if (m.sender_id === null && m.message_text.startsWith(SYSTEM_PREFIX)) continue;
    const fromCreator = m.sender_id === creatorId;
    if (fromCreator && !pastedOfferSeen) {
      pastedOfferSeen = true;
      sponsorTexts.push(m.message_text);
      latestSponsorOffer = extractOfferedAmount(m.message_text) ?? latestSponsorOffer;
      continue;
    }
    pastedOfferSeen = true;
    if (fromCreator) {
      creatorMessageCount++;
      creatorQuotedUsd = extractOfferedAmount(m.message_text) ?? creatorQuotedUsd;
    } else {
      sponsorTexts.push(m.message_text);
      latestSponsorOffer = extractOfferedAmount(m.message_text) ?? latestSponsorOffer;
    }
  }

  return {
    sponsorTexts,
    latestSponsorText: sponsorTexts[sponsorTexts.length - 1] ?? "",
    creatorMessageCount,
    creatorQuotedUsd,
    sponsorOfferUsd: latestSponsorOffer ?? options.recordedOfferUsd,
  };
}

// --- stage ---------------------------------------------------------------------

export type NegotiationStage =
  | "discovery" // first reply: scope, deliverables, usage, exclusivity, budget range
  | "proposal" // scope known, no figure from the sponsor: quote a range
  | "counter" // sponsor's figure below target: counter
  | "hold" // sponsor's figure below the creator's private minimum
  | "accept_ready" // sponsor's figure at or above target: confirm terms, still a draft
  | "agreed"; // deal already agreed or paid: logistics only

export function determineStage(ctx: {
  dealStatus: DealStatus | null;
  thread: ThreadSummary;
  scope: CampaignScope;
  targetUsd: number | null;
  privateMinimumUsd: number | null;
}): NegotiationStage {
  if (ctx.dealStatus === "agreed" || ctx.dealStatus === "paid") return "agreed";

  const offer = ctx.thread.sponsorOfferUsd;
  // Nothing to price against: keep asking rather than invent a figure.
  if (ctx.targetUsd === null) return "discovery";

  // The first reply explores scope and budget before naming a price — unless
  // the sponsor has already given both, in which case asking again wastes a round.
  if (ctx.thread.creatorMessageCount === 0 && !(offer !== null && scopeIsKnown(ctx.scope))) {
    return "discovery";
  }

  if (offer === null) return "proposal";
  if (ctx.privateMinimumUsd !== null && offer < ctx.privateMinimumUsd) return "hold";
  if (offer >= ctx.targetUsd) return "accept_ready";
  return "counter";
}

// --- the reply -------------------------------------------------------------------

const DELIVERABLE_LABEL: Record<SponsorshipType, string> = {
  video_dedicated: "a dedicated video",
  integration: "an integrated segment",
  story_share: "a story share",
  live_mention: "a live mention",
  post: "a post",
  other: "this collaboration",
};

export type NegotiationReplyInput = {
  stage: NegotiationStage;
  sponsorshipType: SponsorshipType;
  scope: CampaignScope;
  targetUsd: number | null;
  rangeUsd: { low: number; high: number } | null;
  sponsorOfferUsd: number | null;
  creatorQuotedUsd: number | null;
  privateMinimumUsd: number | null;
};

/** A stated figure that stays clear of the private minimum: 10% above it, rounded to $50. */
function aboveMinimum(minimum: number): number {
  return Math.ceil((minimum * 1.1) / 50) * 50;
}

/** The range to quote, lifted so its low end never invites an offer at or below the minimum. */
export function quotedRange(input: NegotiationReplyInput): { low: number; high: number } | null {
  const range = input.rangeUsd;
  if (!range || input.privateMinimumUsd === null || range.low > input.privateMinimumUsd) return range;
  const low = aboveMinimum(input.privateMinimumUsd);
  return { low, high: Math.max(range.high, roundRate(low * 1.25)) };
}

/** The rate restated when holding: the target, unless that is at or under the minimum. */
export function holdFigure(input: NegotiationReplyInput): number | null {
  if (input.targetUsd === null) return null;
  if (input.privateMinimumUsd !== null && input.targetUsd <= input.privateMinimumUsd) {
    return aboveMinimum(input.privateMinimumUsd);
  }
  return input.targetUsd;
}

/**
 * The counter figure: the target, or halfway once the creator has already
 * quoted. Never below the private minimum — and never *exactly* the minimum
 * either, since countering at the floor would tell the sponsor where it is.
 * When halfway would undercut it, the counter goes back to the higher of the
 * target and the creator's last quote, or failing that to a figure 10% above
 * the minimum, rounded.
 */
export function counterFigure(input: NegotiationReplyInput): number | null {
  if (input.targetUsd === null || input.sponsorOfferUsd === null) return input.targetUsd;
  let figure = input.targetUsd;
  if (input.creatorQuotedUsd !== null && input.sponsorOfferUsd < input.creatorQuotedUsd) {
    figure = roundRate((input.sponsorOfferUsd + Math.min(input.creatorQuotedUsd, input.targetUsd)) / 2);
  }
  const minimum = input.privateMinimumUsd;
  if (minimum !== null && Math.round(figure) <= Math.round(minimum)) {
    figure = Math.max(input.targetUsd, input.creatorQuotedUsd ?? 0);
    if (Math.round(figure) <= Math.round(minimum)) figure = aboveMinimum(minimum);
  }
  return Math.max(figure, roundRate(input.sponsorOfferUsd));
}

function scopeQuestions(scope: CampaignScope): string[] {
  const q: string[] = [];
  if (scope.deliverableCount === null) q.push("the deliverables (how many pieces, and in what format)");
  if (!scope.paidUsageRequested && scope.usageMonths === null) q.push("any usage rights you need (organic only, or paid ads/whitelisting, and for how long)");
  if (!scope.exclusivityRequested) q.push("whether you need category exclusivity");
  if (!scope.timelineStated) q.push("your timeline and go-live date");
  return q;
}

/**
 * The deterministic reply for a stage. Never prints the private minimum; the
 * only figures it can contain are the sponsor's own offer and the target or
 * counter figure the creator is meant to state.
 */
export function buildNegotiationReply(input: NegotiationReplyInput): string {
  const deliverable = DELIVERABLE_LABEL[input.sponsorshipType] ?? DELIVERABLE_LABEL.other;
  const questions = scopeQuestions(input.scope);
  const list = (items: string[]) =>
    items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

  switch (input.stage) {
    case "discovery": {
      const asks = [...questions, "the budget range you have allocated"];
      return [
        "Hi, thank you for reaching out and for thinking of me for this.",
        `I'd love to explore it. Before we settle on pricing, could you share a little more about the campaign: ${list(asks)}?`,
        "Depending on the scope, I can put together a package that works well for both sides.",
      ].join(" ");
    }
    case "proposal": {
      const quoted = quotedRange(input);
      const range = quoted ? `${usd(quoted.low)}–${usd(quoted.high)}` : null;
      return [
        "Thanks for the details.",
        range
          ? `For ${deliverable} with the scope you described, my rate would be in the ${range} range, depending on final usage rights and timing.`
          : `For ${deliverable} with the scope you described, I'd be glad to put a rate together.`,
        "What budget did you have in mind? Happy to shape the package around it.",
      ].join(" ");
    }
    case "counter": {
      const figure = counterFigure(input);
      const offer = input.sponsorOfferUsd;
      return [
        "Thank you for the offer.",
        figure !== null && offer !== null
          ? `For ${deliverable} with this scope I'd be looking at ${usd(figure)} rather than ${usd(offer)}, which reflects my reach and engagement on this kind of placement.`
          : `I'd like to find a figure that reflects the scope of ${deliverable}.`,
        "If the budget is fixed, I'm open to adjusting the scope (for example, fewer deliverables or shorter usage rights) to make it work.",
      ].join(" ");
    }
    case "hold": {
      return [
        "Thank you for the offer, I appreciate it.",
        `Unfortunately I can't take on ${deliverable} at that level.`,
        holdFigure(input) !== null
          ? `For this scope my rate is ${usd(holdFigure(input)!)}; if there's flexibility on budget or scope, I'd be glad to keep talking.`
          : "If there's flexibility on budget or scope, I'd be glad to keep talking.",
      ].join(" ");
    }
    case "accept_ready": {
      return [
        "Thank you, that sounds promising.",
        input.sponsorOfferUsd !== null
          ? `${usd(input.sponsorOfferUsd)} for ${deliverable} could work for me.`
          : `This could work for me.`,
        `Before I confirm, could you send over the brief${questions.length ? `, along with ${list(questions)}` : ""}? Once I've reviewed it I'll confirm the final terms here.`,
      ].join(" ");
    }
    case "agreed":
      return "Thanks again. Please send the brief and any assets or talking points, and I'll confirm the schedule here so everything stays on record.";
  }
}

// --- private minimum ---------------------------------------------------------------

/** Validates the creator's optional private minimum from the form. Never stored. */
export function readPrivateMinimum(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^\$/, "");
  if (!trimmed) return null;
  const n = parseAmountToken(trimmed);
  return n !== null && n >= 1 && n <= 1_000_000 ? n : null;
}

/**
 * True when a sponsor-facing draft contains the private minimum in any common
 * written form. A figure that is also public in the conversation (the
 * sponsor's own offer, the target the creator states) is not a leak.
 */
export function revealsPrivateMinimum(
  draft: string,
  minimum: number | null,
  publicFigures: (number | null)[] = [],
): boolean {
  if (minimum === null) return false;
  if (publicFigures.some((f) => f !== null && Math.round(f) === Math.round(minimum))) return false;

  const normalized = draft.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  for (const m of normalized.matchAll(/(?<![\d.,])(\d(?:[\d.,]*\d)?)\s*(k\b)?/gi)) {
    const n = parseAmountToken(m[1]);
    if (n === null) continue;
    const value = m[2] ? n * 1000 : n;
    if (Math.round(value) === Math.round(minimum)) return true;
  }
  return false;
}

/** Every USD figure a draft states ($1,500 / 1500 USD / 1.5k dollars). */
export function statedUsdFigures(text: string): number[] {
  const normalized = text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const NUM = String.raw`(?<![\d.,])(\d(?:[\d.,]*\d)?)`;
  const figures: number[] = [];
  for (const pattern of [
    new RegExp(String.raw`(?:us\$|\$|usd\s*)\s*${NUM}\s*(k\b)?`, "gi"),
    new RegExp(String.raw`${NUM}\s*(k\b)?\s*(?:\$|usd\b|dollars?\b|دولار)`, "gi"),
  ]) {
    for (const m of normalized.matchAll(pattern)) {
      const n = parseAmountToken(m[1]);
      if (n !== null) figures.push(m[2] ? n * 1000 : n);
    }
  }
  return figures;
}

/**
 * Whether a model-written draft may be shown for this stage: it must not
 * contain the private minimum, and every dollar figure it states must be one
 * the plan allows (none at all before scope and budget are known). A draft
 * that invents a number is replaced by the deterministic reply.
 */
export function draftIsAcceptable(
  draft: string,
  plan: { allowedFigures: number[]; privateMinimumUsd: number | null },
): boolean {
  if (revealsPrivateMinimum(draft, plan.privateMinimumUsd, plan.allowedFigures)) return false;
  return statedUsdFigures(draft).every((f) => plan.allowedFigures.some((a) => Math.abs(a - f) < 1));
}
