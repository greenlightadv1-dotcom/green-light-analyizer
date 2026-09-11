"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { evaluateOffer } from "@/lib/ai/evaluate";
import type { EvaluationResult } from "@/lib/ai/types";
import { requireProfile } from "@/lib/auth";
import { buildEvaluationInput } from "@/lib/deals/queries";
import { extractOfferedAmount } from "@/lib/email/parse";
import { maskSensitiveData } from "@/lib/mask";
import { runSecurityCheck } from "@/lib/security/check";
import type { SecurityCheckResult } from "@/lib/security/types";
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

export type AnalyzerState = {
  error: string | null;
  result:
    | (EvaluationResult & {
        sender_email: string;
        sponsorship_type: SponsorshipType;
        target_countries: string[];
        offer_text: string;
        /** Independent of price/risk — see runSecurityCheck(). */
        security: SecurityCheckResult | null;
      })
    | null;
};

/** Parses the free-text country field: "EG, SA, AE" -> ["EG","SA","AE"]. */
function parseCountries(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Manual Analyzer — CLAUDE.md §5.1.
 *
 * The alternate entry point for an offer that arrived somewhere the inbound
 * alias does not cover. It calls evaluateOffer(), the same function the
 * inbound-email webhook will use (§5.4), so a pasted offer and an
 * auto-analysed one are priced identically.
 *
 * Nothing is persisted here — this is the "instant recommendation, no email
 * connection required" path. The creator turns it into a Deal Chat Room with
 * the second action below if they want to reply.
 */
export async function analyzeOffer(
  _prev: AnalyzerState,
  formData: FormData,
): Promise<AnalyzerState> {
  const profile = await requireProfile();

  const senderEmail = String(formData.get("sender_email") ?? "").trim();
  const offerText = String(formData.get("message_text") ?? "").trim();
  const sponsorshipType = String(
    formData.get("sponsorship_type") ?? "",
  ) as SponsorshipType;
  const targetCountries = parseCountries(
    String(formData.get("target_countries") ?? ""),
  );

  if (!senderEmail || !offerText) {
    return { error: "Paste the offer and who sent it.", result: null };
  }
  if (!SPONSORSHIP_TYPES.includes(sponsorshipType)) {
    return { error: "Pick what the sponsor is asking for.", result: null };
  }
  if (offerText.length > 20000) {
    return { error: "That offer is too long to analyse.", result: null };
  }

  const input = await buildEvaluationInput(profile.id, {
    sponsorship_type: sponsorshipType,
    target_countries: targetCountries.length ? targetCountries : null,
    offer_text: offerText,
  });

  // Priced independently of the security/domain check below — Promise.all,
  // not sequential awaits, so a slow Safe Browsing or WHOIS call never delays
  // the price/risk recommendation. Both sides already catch their own
  // network/config failures internally and resolve rather than reject; the
  // .catch(() => null) here is one more layer so even an unexpected bug in
  // the security path can never take the price/risk result down with it.
  const [result, security] = await Promise.all([
    evaluateOffer(input),
    runSecurityCheck(senderEmail, offerText).catch(() => null),
  ]);

  return {
    error: null,
    result: {
      ...result,
      sender_email: senderEmail,
      sponsorship_type: sponsorshipType,
      target_countries: targetCountries,
      offer_text: offerText,
      security,
    },
  };
}

/**
 * Turn an analysis into a Deal Chat Room (§5.5 does the same for email).
 *
 * Written as service_role because the RLS column grants withhold
 * ai_evaluation and offered_amount from `authenticated`: the risk rating is
 * the platform's verdict and the amount is what the sponsor offered, so
 * neither may be asserted by the client that is about to be rated.
 *
 * The offer text is masked before it becomes the opening message — an offer
 * pasted in from elsewhere routinely contains the sender's direct phone or
 * WhatsApp, and §6 does not exempt it just because it arrived by hand.
 */
export async function createDealFromAnalysis(formData: FormData): Promise<void> {
  const profile = await requireProfile();

  const senderEmail = String(formData.get("sender_email") ?? "").trim();
  const offerText = String(formData.get("offer_text") ?? "").trim();
  const sponsorshipType = String(
    formData.get("sponsorship_type") ?? "",
  ) as SponsorshipType;
  const targetCountries = parseCountries(
    String(formData.get("target_countries") ?? ""),
  );
  const risk = String(formData.get("risk") ?? "");
  const rawPrice = Number(formData.get("recommended_price_usd") ?? 0);
  const recommendedPrice =
    Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : null;

  if (!senderEmail || !offerText || !SPONSORSHIP_TYPES.includes(sponsorshipType)) {
    return;
  }

  // What the sponsor actually put on the table, read out of their own words —
  // the same helper the inbound-email path uses, so "Offer" means the same
  // thing on an analyzer deal as on a forwarded one. It is deliberately NOT
  // the Co-Pilot's recommendation: that is the platform's suggestion, it goes
  // in its own column (0018), and writing it here would show the creator our
  // own number back as if the sponsor had proposed it.
  const offeredAmount = extractOfferedAmount(offerText);

  const admin = createAdminClient();

  // Re-run rather than trust a hidden field carrying the analyzeOffer() result:
  // a WHOIS/Safe Browsing lookup is idempotent, and re-fetching avoids adding
  // a client-tamperable JSON blob to the form for what is otherwise a cheap
  // recomputation.
  const security: SecurityCheckResult | null = await runSecurityCheck(senderEmail, offerText).catch(
    () => null,
  );

  const { data: chat, error } = await admin
    .from("deal_chats")
    .insert({
      creator_id: profile.id,
      company_id: null, // a pasted offer has no platform account behind it
      sender_email: senderEmail,
      deal_status: "new",
      offered_amount: offeredAmount,
      recommended_price_usd: recommendedPrice,
      ai_evaluation: ["green", "yellow", "red"].includes(risk)
        ? (risk as "green" | "yellow" | "red")
        : null,
      sponsorship_type: sponsorshipType,
      target_countries: targetCountries.length ? targetCountries : null,
      security_check: security,
    })
    .select("id")
    .single();

  if (error || !chat) return;

  notifyNewDeal(
    profile,
    offeredAmount !== null
      ? `New offer from ${senderEmail} — $${offeredAmount.toLocaleString("en-US")}.`
      : `New offer from ${senderEmail}.`,
  );

  const { maskedText, isMasked, matched } = maskSensitiveData(offerText);

  await admin.from("messages").insert({
    chat_id: chat.id,
    sender_id: profile.id,
    message_text: maskedText,
    is_masked: isMasked,
  });

  // The creator pasted someone else's message, so this is not their violation
  // to be banned for — but §6 still wants the record that contact details
  // entered the platform and were stripped.
  if (isMasked) {
    await admin.from("violation_logs").insert({
      profile_id: profile.id,
      chat_id: chat.id,
      matched_rules: matched,
      redacted_excerpt: `[pasted into Manual Analyzer] ${maskedText.slice(0, 400)}`,
    });
  }

  revalidatePath("/inbox");
  redirect(`/inbox/${chat.id}`);
}
