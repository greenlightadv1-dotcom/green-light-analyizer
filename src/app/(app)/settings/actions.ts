"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { daysFromNow } from "@/lib/subscription";

export type RedeemCodeState = {
  error: string | null;
  success: boolean;
};

/**
 * Redeem a single-use promo/trial code — Settings -> Plan & billing.
 *
 * The code is claimed with one atomic conditional UPDATE before it is ever
 * applied to the caller's own profile. That ordering (not a lock, not a
 * transaction) is what makes two callers racing the same code safe:
 * whichever request's UPDATE actually matches `is_used = false` commits
 * first, and the loser gets zero rows back — its own profile is never
 * touched, so there is no path to two people ending up with the same code.
 */
export async function redeemCode(
  _prev: RedeemCodeState,
  formData: FormData,
): Promise<RedeemCodeState> {
  const profile = await requireProfile();

  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (!code) return { error: "Enter a code.", success: false };

  const service = createAdminClient();

  const { data: claimed } = await service
    .from("promo_codes")
    .update({
      is_used: true,
      used_by: profile.id,
      used_at: new Date().toISOString(),
    })
    .eq("code", code)
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .select("duration_days, target_plan")
    .maybeSingle();

  if (!claimed) {
    // One generic message for "wrong code", "already used" and "expired" —
    // distinguishing them would tell a guesser which one is true.
    return { error: "That code isn't valid.", success: false };
  }

  const { error: profileError } = await service
    .from("profiles")
    .update({
      subscription_plan: claimed.target_plan,
      subscription_expires_at: daysFromNow(claimed.duration_days),
    })
    .eq("id", profile.id);

  if (profileError) {
    return {
      error: "Code accepted but the plan update failed — contact support.",
      success: false,
    };
  }

  revalidatePath("/settings");
  return { error: null, success: true };
}
