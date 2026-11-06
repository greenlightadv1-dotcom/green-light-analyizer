"use server";

import { revalidatePath } from "next/cache";
import { requireAnyStatusProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { EDITABLE, kindsForRole, parseDetails, verificationErrorKey } from "@/lib/verification/rules";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";
import type { VerificationKind } from "@/lib/types/database";

/**
 * The applicant's side of verification (0032). Every statement is scoped to
 * the session's own profile id; the case id from the form only selects among
 * the caller's own cases. Transitions go through verification_transition(),
 * which re-checks ownership and state in the database.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startVerification(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireAnyStatusProfile();
  const kind = String(fd.get("kind") ?? "") as VerificationKind;
  if (!kindsForRole(profile.role).includes(kind)) return fail("verification.errors.not_allowed");
  if (!(await consumeRateLimit("verification_write", profile.id)).allowed) return fail("verification.errors.rate_limited");
  const admin = createAdminClient();
  const { data: existing } = await admin.from("verification_cases").select("id").eq("profile_id", profile.id).eq("kind", kind).maybeSingle();
  if (existing) return OK;
  const { data, error } = await admin.from("verification_cases").insert({ profile_id: profile.id, kind }).select("id").single();
  if (error || !data) {
    log.error("verification.start_failed", { error });
    return fail("ui.errors.generic");
  }
  await admin.from("verification_events").insert({ case_id: data.id, actor_id: profile.id, event: "created" });
  revalidatePath("/verification");
  return OK;
}

export async function saveVerificationDetails(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireAnyStatusProfile();
  const caseId = String(fd.get("case_id") ?? "");
  if (!UUID.test(caseId)) return fail("ui.errors.invalid");
  if (!(await consumeRateLimit("verification_write", profile.id)).allowed) return fail("verification.errors.rate_limited");
  const admin = createAdminClient();
  const { data: row } = await admin.from("verification_cases").select("id, kind, status").eq("id", caseId).eq("profile_id", profile.id).maybeSingle();
  if (!row) return fail("verification.errors.not_found");
  if (!EDITABLE.includes(row.status)) return fail("verification.errors.invalid_state");
  const parsed = parseDetails(row.kind, Object.fromEntries(fd.entries()), { requireAll: false });
  if (!parsed.ok) return fail(`verification.fieldErrors.${parsed.field}`);
  const { error } = await admin
    .from("verification_cases")
    .update({ details: parsed.value, updated_at: new Date().toISOString() })
    .eq("id", caseId)
    .eq("profile_id", profile.id)
    .in("status", EDITABLE);
  if (error) {
    log.error("verification.save_failed", { error });
    return fail("ui.errors.generic");
  }
  revalidatePath("/verification");
  return OK;
}

/** Submit for review: validates every required field, then the database checks documents and state. */
export async function submitVerification(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireAnyStatusProfile();
  const caseId = String(fd.get("case_id") ?? "");
  if (!UUID.test(caseId)) return fail("ui.errors.invalid");
  if (fd.get("consent") !== "on") return fail("verification.errors.consent");
  if (!(await consumeRateLimit("verification_write", profile.id)).allowed) return fail("verification.errors.rate_limited");
  const admin = createAdminClient();
  const { data: row } = await admin.from("verification_cases").select("id, kind, details").eq("id", caseId).eq("profile_id", profile.id).maybeSingle();
  if (!row) return fail("verification.errors.not_found");
  const parsed = parseDetails(row.kind, row.details ?? {}, { requireAll: true });
  if (!parsed.ok) return fail(`verification.fieldErrors.${parsed.field}`);
  const { error } = await admin.rpc("verification_transition", { p_actor: profile.id, p_case: caseId, p_action: "submit" });
  if (error) {
    const key = verificationErrorKey(error.message);
    if (key === "ui.errors.generic") log.error("verification.submit_failed", { error });
    return fail(key);
  }
  revalidatePath("/verification");
  revalidatePath("/admin/verification");
  return OK;
}
