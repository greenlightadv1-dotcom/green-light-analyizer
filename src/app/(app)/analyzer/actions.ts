"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { evaluateOffer } from "@/lib/ai/evaluate";
import type { EvaluationResult } from "@/lib/ai/types";
import { requireProfile, requireRole } from "@/lib/auth";
import {
  SPONSORSHIP_TYPES,
  analysisQuoteSecret,
  parseCountries,
  readCreateDealSubmission,
  signAnalysisQuote,
  verifyAnalysisQuote,
} from "@/lib/deals/analysis-quote";
import { log } from "@/lib/log";
import { buildEvaluationInput } from "@/lib/deals/queries";
import { extractOfferedAmount } from "@/lib/email/parse";
import { maskSensitiveData } from "@/lib/mask";
import { consumeRateLimit } from "@/lib/rate-limit";
import { runSecurityCheck } from "@/lib/security/check";
import type { SecurityCheckResult } from "@/lib/security/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewDeal } from "@/lib/whatsapp";
import type { SponsorshipType } from "@/lib/types/database";

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
        /**
         * Signs this analysis for createDealFromAnalysis (D3). null when the
         * signing key is unconfigured or the caller is not a creator, in which
         * case no deal room can be opened from it.
         */
        quote_token: string | null;
      })
    | null;
};

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
  if (!(SPONSORSHIP_TYPES as readonly string[]).includes(sponsorshipType)) {
    return { error: "Pick what the sponsor is asking for.", result: null };
  }
  if (offerText.length > 20000) {
    return { error: "That offer is too long to analyse.", result: null };
  }

  // Charged after validation, before the spend: a mistyped form should not
  // cost the user quota. This one press buys an AI evaluation, a WHOIS lookup
  // and a Safe Browsing call.
  const limit = await consumeRateLimit("ai_analyze_offer", profile.id);
  if (!limit.allowed) return { error: limit.message, result: null };

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

  const secret = analysisQuoteSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const quoteToken =
    secret && profile.role === "creator"
      ? signAnalysisQuote(secret, {
          creatorId: profile.id,
          senderEmail,
          offerText,
          sponsorshipType,
          targetCountries,
          risk: result.risk,
          recommendedPriceUsd: result.recommended_price_usd,
        })
      : null;

  return {
    error: null,
    result: {
      ...result,
      sender_email: senderEmail,
      sponsorship_type: sponsorshipType,
      target_countries: targetCountries,
      offer_text: offerText,
      security,
      quote_token: quoteToken,
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
export type CreateDealState = { error: string | null };

export async function createDealFromAnalysis(
  _prev: CreateDealState,
  formData: FormData,
): Promise<CreateDealState> {
  // A pasted offer opens a room in the caller's own creator inbox, so only a
  // creator can do it (D3); a company or admin is sent to the dashboard.
  const profile = await requireRole("creator");

  const submission = readCreateDealSubmission(profile.id, (name) => formData.get(name));
  if (!submission.ok) return { error: submission.error };
  const { quote } = submission;

  // The risk rating and recommended price are the platform's verdict, so they
  // are stored only if this server signed them for this creator and this exact
  // offer (analysis-quote.ts). Checked before the rate limit, so a stale tab
  // does not spend quota.
  const secret = analysisQuoteSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const check = secret
    ? verifyAnalysisQuote(secret, String(formData.get("quote_token") ?? ""), quote)
    : "invalid";
  if (check === "expired") {
    return { error: "This analysis has expired. Analyse the offer again before opening a deal room." };
  }
  if (check !== "ok") {
    log.warn("analyzer_create.quote_rejected", { creator_id: profile.id });
    return { error: "This analysis changed after it was produced. Analyse the offer again." };
  }

  // Every room runs a WHOIS + Safe Browsing check and can fire a WhatsApp
  // alert, so creation has its own ceiling.
  const limit = await consumeRateLimit("analyzer_create_deal", profile.id);
  if (!limit.allowed) return { error: limit.message };

  const senderEmail = quote.senderEmail;
  const offerText = quote.offerText;
  const sponsorshipType = quote.sponsorshipType as SponsorshipType;
  const targetCountries = quote.targetCountries;
  const risk = quote.risk as "green" | "yellow" | "red";
  const recommendedPrice = quote.recommendedPriceUsd;

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
      ai_evaluation: risk,
      sponsorship_type: sponsorshipType,
      target_countries: targetCountries.length ? targetCountries : null,
      security_check: security,
    })
    .select("id")
    .single();

  if (error || !chat) {
    log.error("analyzer_create.deal_insert_failed", { creator_id: profile.id, error });
    return { error: "The deal room could not be opened. Try again in a moment." };
  }

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
