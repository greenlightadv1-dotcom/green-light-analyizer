"use server";

import { requireProfile } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

export type RedeemCodeState = {
  error: string | null;
  success: boolean;
};

/** Shown to anyone who still submits a code (an old link, a saved form). */
export const PROMO_RETIRED_MESSAGE =
  "Promo codes are retired: every creator is already on the Creator Plan.";

/**
 * Promo-code redemption is retired with the unified Creator Plan.
 *
 * Every code targeted Pro or Elite, and those plans no longer grant anything,
 * so redeeming one would claim the code and rewrite the profile's stored plan
 * for no change in access. The action now refuses before touching the
 * database: no code is claimed and no profile is written. The rate limit is
 * kept in front of it, unchanged, so the endpoint stays as costly to spray as
 * before (rate-limit-coverage.test.ts).
 */
export async function redeemCode(
  _prev: RedeemCodeState,
  _formData: FormData,
): Promise<RedeemCodeState> {
  const profile = await requireProfile();

  const limit = await consumeRateLimit("promo_redeem", profile.id);
  if (!limit.allowed) return { error: limit.message, success: false };

  return { error: PROMO_RETIRED_MESSAGE, success: false };
}
