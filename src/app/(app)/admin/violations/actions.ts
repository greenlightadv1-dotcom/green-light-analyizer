"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

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
 *
 * Returns a result so the page can say what happened: an error when the ban
 * was not saved, and the entry is marked reviewed only after the ban
 * succeeded. The UI asks for confirmation first (ConfirmActionForm); this
 * re-checks the admin role on its own either way.
 */
export async function banProfile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireRole("admin");

  const profileId = String(formData.get("profile_id") ?? "");
  const logId = String(formData.get("log_id") ?? "");
  if (!profileId) return fail("ui.errors.invalid");

  const service = createAdminClient();

  // Read back the row so a ban that matched no account is reported, not
  // shown as a success.
  const { data: banned, error: banError } = await service
    .from("profiles")
    .update({
      banned_at: new Date().toISOString(),
      banned_reason:
        "Deliberately attempted to exchange direct contact details, or to move a deal off Green Light to avoid commission.",
    })
    .eq("id", profileId)
    .select("id");
  if (banError) {
    log.error("violation.ban_failed", { profile_id: profileId, error: banError });
    return fail("admin.violations.errors.banFailed");
  }
  if (!banned?.length) return fail("ui.errors.notFound");
  // The violation row's reviewed_by / reviewed_at (below) is the record of
  // who acted; this line makes the ban itself findable in the server logs.
  log.info("violation.banned", { profile_id: profileId, admin_id: admin.id, log_id: logId || null });

  revalidatePath("/admin/violations");
  revalidatePath("/admin/users");

  if (logId) {
    const { error: reviewError } = await service
      .from("violation_logs")
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: admin.id })
      .eq("id", logId);
    if (reviewError) {
      log.error("violation.review_failed", { log_id: logId, error: reviewError });
      return fail("admin.violations.errors.reviewFailed");
    }
  }

  return OK;
}

/** Clear an entry without banning — the false-positive path. */
export async function dismissViolation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireRole("admin");

  const logId = String(formData.get("log_id") ?? "");
  if (!logId) return fail("ui.errors.invalid");

  const service = createAdminClient();
  const { data, error } = await service
    .from("violation_logs")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: admin.id })
    .eq("id", logId)
    .select("id");
  if (error) {
    log.error("violation.dismiss_failed", { log_id: logId, error });
    return fail("admin.violations.errors.dismissFailed");
  }
  if (!data?.length) return fail("ui.errors.notFound");

  revalidatePath("/admin/violations");
  return OK;
}
