"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { isScopeId, permissionErrorKey } from "@/lib/company-access";
import { hasCompanyScope, representationOf } from "@/lib/company-access-server";
import { parseCompanyDetails } from "@/lib/company-details";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

/**
 * Representative scopes (0034). The actor is always the session's own
 * account. company_set_scope() re-checks that it is the company the
 * representative belongs to, refuses gated and unbuilt scopes, and records
 * every change.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setRepresentativeScope(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  if (await representationOf(profile)) return fail("team.errors.not_allowed"); // a representative never manages others
  const member = String(fd.get("member_id") ?? "");
  const scope = String(fd.get("scope") ?? "");
  const grant = fd.get("grant") === "1";
  if (!UUID.test(member) || !isScopeId(scope)) return fail("ui.errors.invalid");
  if (!(await consumeRateLimit("team_write", profile.id)).allowed) return fail("team.errors.rate_limited");
  const { error } = await createAdminClient().rpc("company_set_scope", { p_actor: profile.id, p_member: member, p_scope: scope, p_grant: grant });
  if (error) {
    const key = permissionErrorKey(error.message);
    if (key === "ui.errors.generic") log.error("team.scope_failed", { error });
    return fail(key);
  }
  revalidatePath("/team");
  return OK;
}

/** A representative with company.edit updates the company's public details, under the same rules as the company. */
export async function saveRepresentedCompany(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("company");
  const allowed = await hasCompanyScope(profile, "company.edit");
  if (!allowed) return fail("team.errors.not_allowed");
  if (!(await consumeRateLimit("team_write", profile.id)).allowed) return fail("team.errors.rate_limited");
  const parsed = parseCompanyDetails(fd);
  if (!parsed.ok) return fail(`onboarding.error.${parsed.error}`);
  const { error } = await createAdminClient().from("profiles").update(parsed.value).eq("id", allowed.companyId).eq("role", "company");
  if (error) {
    log.error("team.company_edit_failed", { code: error.code });
    return fail("ui.errors.generic");
  }
  log.info("team.company_edited_by_representative", { company_id: allowed.companyId, member_id: profile.id });
  revalidatePath("/team");
  return OK;
}
