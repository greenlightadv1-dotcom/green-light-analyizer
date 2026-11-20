import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/auth";
import type { ScopeId } from "@/lib/company-access";

/**
 * Who this account represents and what it may do there, read fresh from the
 * database on every call (never cached), so a revoke applies on the next
 * request. Null for anyone who is not a linked representative.
 */
export async function representationOf(profile: Pick<Profile, "id" | "role">): Promise<{ companyId: string; companyName: string; scopes: ScopeId[] } | null> {
  if (profile.role !== "company") return null;
  const service = createAdminClient();
  const { data: link, error } = await service.from("company_members").select("company_id, member_role").eq("member_id", profile.id).maybeSingle();
  if (error || !link || link.member_role !== "representative") return null;
  const [{ data: company }, { data: scopes }] = await Promise.all([
    service.from("profiles").select("full_name, banned_at, role").eq("id", link.company_id).maybeSingle(),
    service.from("company_member_scopes").select("scope").eq("member_id", profile.id).eq("company_id", link.company_id),
  ]);
  if (!company || company.banned_at || company.role !== "company") return { companyId: link.company_id, companyName: "—", scopes: [] };
  return { companyId: link.company_id, companyName: company.full_name, scopes: (scopes ?? []).map((s) => s.scope as ScopeId) };
}

export async function hasCompanyScope(profile: Pick<Profile, "id" | "role">, scope: ScopeId): Promise<{ companyId: string } | null> {
  const rep = await representationOf(profile);
  return rep && rep.scopes.includes(scope) ? { companyId: rep.companyId } : null;
}
