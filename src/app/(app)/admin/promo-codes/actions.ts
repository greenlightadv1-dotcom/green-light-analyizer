"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";

export type GenerateCodeState = {
  error: string | null;
  /** Shown once. The code itself also appears in the list below afterward. */
  created: { code: string } | null;
};

const DURATIONS = [3, 14, 30];
const TARGET_PLANS = ["Pro", "Elite"] as const;
type TargetPlan = (typeof TARGET_PLANS)[number];

// No look-alike glyphs (0/O, 1/I/L excluded) — same reasoning as the inbound
// alias alphabet in src/lib/alias.ts, kept separate since the two have
// nothing else in common.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/**
 * Generate a single-use promo/trial code — admin-only, /admin/promo-codes.
 *
 * promo_codes carries no RLS policy for `authenticated` at all (migration
 * 0013), so this always goes through the service-role client regardless of
 * caller role.
 */
export async function generateCode(
  _prev: GenerateCodeState,
  formData: FormData,
): Promise<GenerateCodeState> {
  const admin = await requireRole("admin");

  const durationDays = Number(formData.get("duration_days"));
  const targetPlanRaw = String(formData.get("target_plan") ?? "");
  const expiresAtRaw = String(formData.get("expires_at") ?? "");

  if (!DURATIONS.includes(durationDays)) {
    return { error: "Pick a valid duration.", created: null };
  }
  if (!TARGET_PLANS.includes(targetPlanRaw as TargetPlan)) {
    return { error: "Pick a valid target plan.", created: null };
  }
  const targetPlan = targetPlanRaw as TargetPlan;
  const expiresAt = new Date(expiresAtRaw);
  if (!expiresAtRaw || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return { error: "Pick a code expiry date in the future.", created: null };
  }

  const service = createAdminClient();

  // A collision is astronomically unlikely (8 characters from a 32-symbol
  // alphabet) but the primary key already makes one a normal, handleable
  // insert failure rather than something to prevent up front with an extra
  // existence check.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { error } = await service.from("promo_codes").insert({
      code,
      duration_days: durationDays,
      target_plan: targetPlan,
      expires_at: expiresAt.toISOString(),
      created_by: admin.id,
    });

    if (!error) {
      revalidatePath("/admin/promo-codes");
      return { error: null, created: { code } };
    }
    if (error.code !== "23505") {
      return { error: error.message, created: null };
    }
  }

  return { error: "Could not generate a unique code — try again.", created: null };
}
