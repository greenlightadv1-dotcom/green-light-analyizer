import type { VerificationKind } from "../types/database.ts";

/**
 * The decision email after an admin approves, rejects or asks for more
 * information. Pure: the caller sends it with the existing Resend helper and
 * tests never send anything.
 *
 * No price is stated, because none is set (CLAUDE.md §8: unified Creator
 * Plan, no subscription price, 10% commission on completed deals, settled
 * manually). The payment wording is pending owner review
 * (PENDING_OWNER_DECISIONS item 13).
 */
export type DecisionEmail = { title: string; message: string; ctaLabel: string; ctaUrl: string; tone: "success" | "warning" | "info" };

const WHO: Record<VerificationKind, string> = {
  creator_kyc: "creator account",
  company_kyb: "company account",
  representative: "company representative account",
};

export function decisionEmail(
  kind: VerificationKind,
  decision: "approved" | "rejected" | "needs_info",
  siteUrl: string,
  note?: string | null,
): DecisionEmail {
  const base = siteUrl.replace(/\/+$/, "");
  if (decision === "approved") {
    const next =
      kind === "creator_kyc"
        ? "Next: connect your channels in the Media Kit and open Opportunities. There is no subscription fee. Green Light takes a 10% commission on each completed deal, settled manually with our team after the deal; nothing is charged automatically."
        : "Next: complete your company details and open Discover. Company access is free. Settlement of each completed deal is handled manually with our team; nothing is charged automatically.";
    return {
      title: "Your Green Light account is approved",
      message: `We reviewed your ${WHO[kind]} documents and approved the account. ${next}`,
      ctaLabel: "Sign in",
      ctaUrl: `${base}/login`,
      tone: "success",
    };
  }
  if (decision === "needs_info") {
    return {
      title: "We need a little more information",
      message: `Our team reviewed your ${WHO[kind]} verification and needs more information before deciding${note ? `: ${note}` : "."}`,
      ctaLabel: "Open verification",
      ctaUrl: `${base}/verification`,
      tone: "info",
    };
  }
  return {
    title: "Your Green Light verification was not approved",
    message: `We reviewed your ${WHO[kind]} verification and could not approve it${note ? `. Reason: ${note}` : "."} You can contact support if you think this is a mistake.`,
    ctaLabel: "Contact support",
    ctaUrl: `${base}/verification`,
    tone: "warning",
  };
}
