"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin actions on the §6 violation queue.
 *
 * Both re-check the caller's role server-side rather than trusting that the
 * page was only reachable by an admin.
 */

/**
 * Apply the §6/§12 permanent ban.
 *
 * Deliberately a human decision rather than an automatic consequence of the
 * regex firing: the §6.1 phone pattern matches any 10-digit-ish run, so
 * "my last 3 videos did 250 000 3000 views" trips it. The message is blocked
 * and logged either way — that part is automatic and immediate. What needs a
 * person is turning that into a permanent account closure.
 */
export async function banProfile(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const profileId = String(formData.get("profile_id") ?? "");
  const logId = String(formData.get("log_id") ?? "");
  if (!profileId) return;

  const service = createAdminClient();

  await service
    .from("profiles")
    .update({
      banned_at: new Date().toISOString(),
      banned_reason: "Off-platform contact exchange (§6).",
    })
    .eq("id", profileId);

  if (logId) {
    await service
      .from("violation_logs")
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: admin.id })
      .eq("id", logId);
  }

  revalidatePath("/admin/violations");
}

/** Clear an entry without banning — the false-positive path. */
export async function dismissViolation(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const logId = String(formData.get("log_id") ?? "");
  if (!logId) return;

  const service = createAdminClient();
  await service
    .from("violation_logs")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: admin.id })
    .eq("id", logId);

  revalidatePath("/admin/violations");
}
