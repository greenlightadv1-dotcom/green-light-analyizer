import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";
import {
  buildNegotiationReply,
  counterFigure,
  determineStage,
  extractCampaignScope,
  holdFigure,
  quotedRange,
  suggestRate,
  summarizeThread,
  type NegotiationReplyInput,
  type NegotiationStage,
  type RateFactor,
} from "./negotiation";

type DealChat = Database["public"]["Tables"]["deal_chats"]["Row"];
type Message = Database["public"]["Tables"]["messages"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Server-side assembly of the negotiation co-pilot for one deal room.
 *
 * Every input is read here — the deal row and thread through the caller's own
 * RLS-scoped session, the media kit likewise — so nothing the browser sends
 * can change the rate, the stage or the figures in the draft. The one
 * exception is the creator's optional private minimum, passed in by the
 * caller after validation, which only steers the draft and is never returned
 * or stored.
 */

export type NegotiationAnalysis = {
  stage: NegotiationStage;
  targetUsd: number | null;
  /** The range a proposal would quote — already lifted clear of any private minimum. */
  rangeUsd: { low: number; high: number } | null;
  sponsorOfferUsd: number | null;
  factors: RateFactor[];
  assumptions: string[];
  missing: string[];
  /** Whether a private minimum shaped this draft. The figure itself is never returned. */
  minimumApplied: boolean;
};

export type NegotiationPlan = {
  analysis: NegotiationAnalysis;
  reply: NegotiationReplyInput;
  /** The deterministic draft for this stage. */
  template: string;
  /** Figures the sponsor may see in a draft at this stage (anything else is invented). */
  allowedFigures: number[];
  /** The other side's latest words, for the model prompt. Already masked, as stored. */
  latestSponsorText: string;
};

export async function planNegotiation(input: {
  chat: DealChat;
  profile: Pick<Profile, "id" | "base_rate_usd">;
  messages: Pick<Message, "sender_id" | "message_text">[];
  privateMinimumUsd: number | null;
}): Promise<NegotiationPlan> {
  const supabase = await createClient();
  const { data: kits } = await supabase
    .from("media_kits")
    .select("*")
    .eq("creator_id", input.profile.id)
    .order("avg_views", { ascending: false })
    .limit(1);
  const kit = kits?.[0] ?? null;

  const thread = summarizeThread(input.messages, input.profile.id, {
    hasCompanyAccount: input.chat.company_id !== null,
    recordedOfferUsd: input.chat.offered_amount,
  });
  const scope = extractCampaignScope(thread.sponsorTexts);
  const sponsorshipType = input.chat.sponsorship_type ?? "other";
  const rate = suggestRate({ kit, sponsorshipType, scope, baseRateUsd: input.profile.base_rate_usd });

  const stage = determineStage({
    dealStatus: input.chat.deal_status,
    thread,
    scope,
    targetUsd: rate.targetUsd,
    privateMinimumUsd: input.privateMinimumUsd,
  });

  const reply: NegotiationReplyInput = {
    stage,
    sponsorshipType,
    scope,
    targetUsd: rate.targetUsd,
    rangeUsd: rate.rangeUsd,
    sponsorOfferUsd: thread.sponsorOfferUsd,
    creatorQuotedUsd: thread.creatorQuotedUsd,
    privateMinimumUsd: input.privateMinimumUsd,
  };

  const range = quotedRange(reply);
  const allowedFigures =
    stage === "discovery" || stage === "agreed"
      ? []
      : [thread.sponsorOfferUsd, counterFigure(reply), holdFigure(reply), range?.low ?? null, range?.high ?? null].filter(
          (n): n is number => n !== null,
        );

  return {
    analysis: {
      stage,
      targetUsd: stage === "hold" ? holdFigure(reply) : stage === "counter" ? counterFigure(reply) : rate.targetUsd,
      rangeUsd: range,
      sponsorOfferUsd: thread.sponsorOfferUsd,
      factors: rate.factors,
      assumptions: rate.assumptions,
      missing: rate.missing,
      minimumApplied: input.privateMinimumUsd !== null,
    },
    reply,
    template: buildNegotiationReply(reply),
    allowedFigures,
    latestSponsorText: thread.latestSponsorText,
  };
}
