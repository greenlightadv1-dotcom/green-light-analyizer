"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { evaluateOffer } from "@/lib/ai/evaluate";
import type { EvaluationResult } from "@/lib/ai/types";
import { requireRole } from "@/lib/auth";
import { buildEvaluationInput } from "@/lib/deals/queries";
import { maskSensitiveData } from "@/lib/mask";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewDeal } from "@/lib/whatsapp";
import type { SponsorshipType } from "@/lib/types/database";

const SPONSORSHIP_TYPES: SponsorshipType[] = [
  "video_dedicated",
  "integration",
  "story_share",
  "live_mention",
  "post",
  "other",
];

/** Mirrors AnalyzerForm's "EG, SA, AE" -> ["EG","SA","AE"] parsing exactly. */
function parseCountries(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);
}

export type OfferPreviewState = {
  error: string | null;
  result:
    | (EvaluationResult & {
        creator_id: string;
        creator_name: string;
        offered_amount: number | null;
        sponsorship_type: SponsorshipType;
        target_countries: string[];
        offer_text: string;
      })
    | null;
};

/**
 * A company previews what the Co-Pilot makes of an offer before sending it —
 * the Discover equivalent of the Manual Analyzer's `analyzeOffer()` (§5.1).
 *
 * Nothing is persisted here. `buildEvaluationInput` reads `media_kits`
 * through the *company's own* client: migration 0010 opened that table's
 * SELECT to the company role precisely so this call sees the creator's real
 * reach data rather than silently pricing off nulls.
 */
export async function previewOfferToCreator(
  _prev: OfferPreviewState,
  formData: FormData,
): Promise<OfferPreviewState> {
  await requireRole("company", "admin");

  const creatorId = String(formData.get("creator_id") ?? "").trim();
  const creatorName = String(formData.get("creator_name") ?? "").trim();
  const offerText = String(formData.get("message_text") ?? "").trim();
  const sponsorshipType = String(
    formData.get("sponsorship_type") ?? "",
  ) as SponsorshipType;
  const amountRaw = Number(formData.get("offered_amount") ?? 0);
  const offeredAmount =
    Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null;
  const targetCountries = parseCountries(
    String(formData.get("target_countries") ?? ""),
  );

  if (!creatorId) return { error: "Pick a creator first.", result: null };
  if (!offerText) return { error: "Write the offer.", result: null };
  if (!SPONSORSHIP_TYPES.includes(sponsorshipType)) {
    return { error: "Pick what you're asking for.", result: null };
  }
  if (offerText.length > 20000) {
    return { error: "That offer is too long to analyse.", result: null };
  }

  const input = await buildEvaluationInput(creatorId, {
    sponsorship_type: sponsorshipType,
    target_countries: targetCountries.length ? targetCountries : null,
    offer_text: offerText,
  });

  const result = await evaluateOffer(input);

  return {
    error: null,
    result: {
      ...result,
      creator_id: creatorId,
      creator_name: creatorName,
      offered_amount: offeredAmount,
      sponsorship_type: sponsorshipType,
      target_countries: targetCountries,
      offer_text: offerText,
    },
  };
}

/**
 * Turn a previewed offer into a Deal Chat Room — the company-initiated twin
 * of `createDealFromAnalysis` (§3, §5.5).
 *
 * Written as service_role for the same reason that one is: `ai_evaluation`
 * and `offered_amount` are withheld from `authenticated` by column grant, so
 * the client about to be rated cannot assert either — true for a company
 * rating a creator exactly as it is for a creator rating themselves.
 *
 * `creatorId` arrives as plain form data, not something migration 0010's RLS
 * already checked, so it is re-validated against `profiles` here with the
 * service client before it drives an insert — the directory only listed
 * active creators, but nothing stops a tampered request naming any id.
 */
export async function sendOfferToCreator(formData: FormData): Promise<void> {
  const profile = await requireRole("company", "admin");

  const creatorId = String(formData.get("creator_id") ?? "").trim();
  const offerText = String(formData.get("offer_text") ?? "").trim();
  const sponsorshipType = String(
    formData.get("sponsorship_type") ?? "",
  ) as SponsorshipType;
  const targetCountries = parseCountries(
    String(formData.get("target_countries") ?? ""),
  );
  const risk = String(formData.get("risk") ?? "");
  const price = Number(formData.get("recommended_price_usd") ?? 0);
  const offeredAmountRaw = Number(formData.get("offered_amount") ?? 0);

  if (!creatorId || !offerText || !SPONSORSHIP_TYPES.includes(sponsorshipType)) {
    return;
  }

  const admin = createAdminClient();

  const { data: creator } = await admin
    .from("profiles")
    .select("id, role, banned_at, whatsapp_number, whatsapp_notifications_enabled")
    .eq("id", creatorId)
    .maybeSingle();

  if (!creator || creator.role !== "creator" || creator.banned_at) {
    return;
  }

  const { maskedText, isMasked, matched } = maskSensitiveData(offerText);

  const { data: chat, error } = await admin
    .from("deal_chats")
    .insert({
      creator_id: creatorId,
      company_id: profile.id,
      // The company IS the sponsor here — unlike a pasted/emailed offer,
      // there is a real platform account behind this address.
      sender_email: profile.primary_email,
      deal_status: "new",
      offered_amount:
        Number.isFinite(offeredAmountRaw) && offeredAmountRaw > 0
          ? offeredAmountRaw
          : Number.isFinite(price) && price > 0
            ? price
            : null,
      // Kept distinct from offered_amount above: here they can legitimately be
      // equal (a company sending the recommendation as its offer), but they
      // mean different things and the deal room shows both.
      recommended_price_usd: Number.isFinite(price) && price > 0 ? price : null,
      ai_evaluation: ["green", "yellow", "red"].includes(risk)
        ? (risk as "green" | "yellow" | "red")
        : null,
      sponsorship_type: sponsorshipType,
      target_countries: targetCountries.length ? targetCountries : null,
    })
    .select("id")
    .single();

  if (error || !chat) return;

  notifyNewDeal(creator, `New in-app offer from ${profile.full_name}.`);

  await admin.from("messages").insert({
    chat_id: chat.id,
    sender_id: profile.id,
    message_text: maskedText,
    is_masked: isMasked,
  });

  // The company wrote this themselves, so — unlike the Manual Analyzer's
  // "pasted someone else's message" case — this IS their own violation to
  // log if the filter fired.
  if (isMasked) {
    await admin.from("violation_logs").insert({
      profile_id: profile.id,
      chat_id: chat.id,
      matched_rules: matched,
      redacted_excerpt: `[sent via Discover] ${maskedText.slice(0, 400)}`,
    });
  }

  revalidatePath("/inbox");
  redirect(`/inbox/${chat.id}`);
}
