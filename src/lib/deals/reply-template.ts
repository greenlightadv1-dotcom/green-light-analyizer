import type { DealStatus, SponsorshipType } from "@/lib/types/database";

/**
 * Deterministic reply templates for the Deal Room.
 *
 * Two jobs, one body of text:
 *
 *   1. The fallback behind "Generate AI reply". The model call
 *      (lib/ai/reply-draft.ts) has no heuristic equivalent and fails outright
 *      when NVIDIA_API_KEY is unset, the rate limit is spent, or the endpoint
 *      is down — which on a zero-cost MVP is most of the time. A creator who
 *      presses the button should get a usable reply, not an apology.
 *   2. The body of the one-click Direct Reply, which needs to be composed
 *      server-side from the deal's own columns rather than supplied by the
 *      client — the figures in it are the platform's, and a client-supplied
 *      "recommended price" would be whatever the sender of the request typed.
 *
 * Pure and dependency-free (no `server-only`): the same function backs the
 * server action and the /preview demo, and there is nothing secret in it.
 *
 * It deliberately contains no contact details, no links and no scheduling
 * offer. §6's mask would strip those before storage anyway, but a template
 * that writes text the platform then redacts would read as the product
 * fighting itself.
 */

export type ReplyTemplateInput = {
  creatorName: string;
  /** What the sponsor offered, or null when they named no figure. */
  offeredAmountUsd: number | null;
  /** The Co-Pilot's recommendation. Null on deals created before 0018. */
  recommendedPriceUsd: number | null;
  sponsorshipType: SponsorshipType | null;
  dealStatus: DealStatus | null;
};

const DELIVERABLE_LABEL: Record<SponsorshipType, string> = {
  video_dedicated: "a dedicated video",
  integration: "an integrated segment",
  story_share: "a story share",
  live_mention: "a live mention",
  post: "a post",
  other: "this collaboration",
};

function usd(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** Below this share of the recommendation, the template counters rather than accepts. */
const LOWBALL_RATIO = 0.85;

export function buildReplyTemplate(input: ReplyTemplateInput): string {
  const deliverable = DELIVERABLE_LABEL[input.sponsorshipType ?? "other"];
  const offered = input.offeredAmountUsd;
  const recommended = input.recommendedPriceUsd;

  const opening =
    input.dealStatus === "new"
      ? "Thanks for reaching out — I'd be glad to look at this."
      : "Thanks for following up.";

  let middle: string;

  if (offered === null && recommended !== null) {
    middle = `For ${deliverable} my rate is ${usd(recommended)}. That reflects my current reach and how engaged the audience is on this kind of placement.`;
  } else if (offered === null) {
    middle = `Could you share the budget you have in mind for ${deliverable}, along with the timeline and anything you need covered? I'll come back with a firm rate.`;
  } else if (recommended === null) {
    middle = `${usd(offered)} for ${deliverable} is workable as a starting point. Could you confirm the timeline and exactly what you need covered?`;
  } else if (offered >= recommended) {
    middle = `${usd(offered)} works for ${deliverable}. Send me the brief, the timeline and any talking points you need covered and I'll get it scheduled.`;
  } else if (offered >= recommended * LOWBALL_RATIO) {
    middle = `${usd(offered)} is close. I'd land at ${usd(recommended)} for ${deliverable}, which is in line with what this placement delivers — happy to proceed at that.`;
  } else {
    middle = `For ${deliverable} my rate is ${usd(recommended)} rather than ${usd(offered)}. That's based on my average reach and engagement on sponsored placements, and I'd rather quote honestly than agree to something I can't deliver properly on.`;
  }

  const closing =
    "Happy to keep everything moving here so the contract and payment stay covered.";

  return [opening, middle, closing].join(" ");
}

/**
 * The structured offer summary that heads a Direct Reply.
 *
 * Restates the deal's own facts above the message so the sponsor — who may be
 * running dozens of outreach threads — sees which offer is being answered
 * without opening anything. Built from the deal_chats row, so what the sponsor
 * reads and what the platform recorded cannot drift apart.
 */
export function buildOfferContextBlock(input: ReplyTemplateInput): string {
  const lines = [`Deliverable: ${DELIVERABLE_LABEL[input.sponsorshipType ?? "other"]}`];

  if (input.offeredAmountUsd !== null) {
    lines.push(`Your offer: ${usd(input.offeredAmountUsd)}`);
  }
  if (input.recommendedPriceUsd !== null) {
    lines.push(`My rate: ${usd(input.recommendedPriceUsd)}`);
  }

  return lines.join("\n");
}

/** Context block plus template, in the order a sponsor should read them. */
export function buildDirectReply(input: ReplyTemplateInput): string {
  return `${buildOfferContextBlock(input)}\n\n${buildReplyTemplate(input)}`;
}
