"use server";

import { requireRole } from "@/lib/auth";

export type GenerateCodeState = {
  error: string | null;
  created: { code: string } | null;
};

/**
 * Promo-code generation is retired with the unified Creator Plan.
 *
 * Every code targeted Pro or Elite (promo_codes.target_plan, migration 0013),
 * and those plans no longer grant anything: every creator has the same
 * access. Minting a code would hand out an "upgrade" that changes nothing, so
 * the action refuses on the server. Existing rows stay in promo_codes as
 * history and remain readable on /admin/promo-codes; nothing is deleted.
 */
export async function generateCode(
  _prev: GenerateCodeState,
  _formData: FormData,
): Promise<GenerateCodeState> {
  await requireRole("admin");
  return {
    error: "Promo codes are retired: every creator is on the same Creator Plan.",
    created: null,
  };
}
