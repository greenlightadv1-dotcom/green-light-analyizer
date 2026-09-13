import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { EvaluationInput } from "@/lib/ai/types";
import type {
  CountryShare,
  Database,
  SponsorshipType,
} from "@/lib/types/database";

export type DealChat = Database["public"]["Tables"]["deal_chats"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];

/**
 * Reads for the Deal Chat Room. Every query below goes through the *user's*
 * client, not the service role, so RLS is what decides which rooms and
 * messages come back — the filters here are for ordering and shape, never for
 * access control.
 */

/**
 * A deal as the list views need it. Everything but `security_check`, which is
 * the one genuinely large column on the table (a full WHOIS record plus Safe
 * Browsing verdict per row) and is read only by the deal room's Company &
 * Domain Intelligence panel — never by the inbox or the dashboard.
 */
export type DealChatListItem = Omit<DealChat, "security_check">;

const LIST_COLUMNS =
  "id, creator_id, company_id, sender_email, deal_status, offered_amount, recommended_price_usd, ai_evaluation, sponsorship_type, target_countries, created_at, is_likely_sponsorship";

export async function listDealChats(): Promise<DealChatListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deal_chats")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getDealChat(chatId: string): Promise<DealChat | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deal_chats")
    .select("*")
    .eq("id", chatId)
    .maybeSingle();
  return data ?? null;
}

export async function listMessages(chatId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

/**
 * The most recent message the caller did not write — what a reply is actually
 * replying to.
 *
 * `sender_id is null` has to be included explicitly: a bare `neq` compares to
 * NULL and drops exactly the rows that matter most here, since both the
 * sponsor's relayed email and the Co-Pilot's own summary are stored with a
 * null sender (no platform account wrote them).
 *
 * Falls back to the thread's last message when every row is the caller's own.
 * That is the Manual Analyzer case: the creator pastes the sponsor's offer, so
 * the offer is stored under the creator's id even though the sponsor wrote it.
 */
export async function latestIncomingMessage(
  chatId: string,
  callerId: string,
): Promise<Message | null> {
  const supabase = await createClient();

  const { data: incoming } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .or(`sender_id.is.null,sender_id.neq.${callerId}`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (incoming?.[0]) return incoming[0];

  const { data: fallback } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(1);

  return fallback?.[0] ?? null;
}

/**
 * Assembles the §7.4 evaluation payload for a creator.
 *
 * Picks the creator's strongest media kit (most reach) as the basis. If they
 * have connected several platforms, pricing off the largest is the closest
 * single-row approximation until the model takes a portfolio.
 *
 * The verified/declared split is preserved exactly: verified_top_countries is
 * passed through only when audience_verified is actually set on the row, so a
 * creator with no OAuth connection can never reach the evaluator as verified.
 */
export async function buildEvaluationInput(
  creatorId: string,
  deal: {
    sponsorship_type: SponsorshipType;
    target_countries: string[] | null;
    offer_text: string;
  },
): Promise<EvaluationInput> {
  const supabase = await createClient();
  const { data: kits } = await supabase
    .from("media_kits")
    .select("*")
    .eq("creator_id", creatorId)
    .order("avg_views", { ascending: false })
    .limit(1);

  const kit = kits?.[0];
  const audienceVerified = kit?.audience_verified === true;

  return {
    avg_views: kit?.avg_views ?? null,
    avg_ccv: kit?.avg_ccv ?? null,
    engagement_rate: kit?.engagement_rate ?? null,
    content_category: kit?.content_category ?? null,
    content_language: kit?.content_language ?? null,
    declared_top_countries: (kit?.declared_top_countries as CountryShare[] | null) ?? null,
    verified_top_countries: audienceVerified
      ? ((kit?.verified_top_countries as CountryShare[] | null) ?? null)
      : null,
    audience_verified: audienceVerified,
    sponsorship_type: deal.sponsorship_type,
    target_countries: deal.target_countries,
    offer_text: deal.offer_text,
  };
}
