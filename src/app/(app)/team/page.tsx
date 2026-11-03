import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { representationOf } from "@/lib/company-access-server";
import { TeamView } from "@/components/team/TeamView";
import type { ScopeId } from "@/lib/company-access";

export const metadata: Metadata = { title: "Company team" };
export const dynamic = "force-dynamic";

/**
 * Company accounts manage their representatives' scopes here; a
 * representative sees what they may do for the company they represent, and
 * only that. Every read is the caller's own (RLS), plus the company's public
 * details for a representative holding company.view.
 */
export default async function TeamPage() {
  const profile = await requireRole("company");
  const rep = await representationOf(profile);
  if (rep) {
    const service = createAdminClient();
    const canView = rep.scopes.includes("company.view") || rep.scopes.includes("company.edit");
    const { data: company } = canView
      ? await service.from("profiles").select("full_name, bio, company_industry, company_website").eq("id", rep.companyId).maybeSingle()
      : { data: null };
    // RLS (0034) returns the company's briefs only while briefs.view is granted.
    const { data: briefs } = rep.scopes.includes("briefs.view")
      ? await (await createClient()).from("briefs").select("id, title, status, updated_at").eq("company_id", rep.companyId).order("updated_at", { ascending: false }).limit(50)
      : { data: [] };
    return <TeamView mode="representative" companyName={rep.companyName} scopes={rep.scopes} company={company ?? null} briefs={briefs ?? []} />;
  }
  const supabase = await createClient();
  const { data: links, error } = await supabase.from("company_members").select("member_id, member_role, created_at").eq("company_id", profile.id).eq("member_role", "representative");
  const ids = (links ?? []).map((l) => l.member_id);
  const service = createAdminClient();
  const [{ data: people }, { data: scopes }, { data: events }] = ids.length
    ? await Promise.all([
        service.from("profiles").select("id, full_name").in("id", ids),
        supabase.from("company_member_scopes").select("member_id, scope").eq("company_id", profile.id),
        supabase.from("company_permission_events").select("id, member_id, scope, action, created_at").eq("company_id", profile.id).order("id", { ascending: false }).limit(50),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  return (
    <TeamView
      mode="owner"
      available={!error}
      members={(links ?? []).map((l) => ({
        id: l.member_id,
        name: people?.find((p) => p.id === l.member_id)?.full_name ?? "—",
        since: l.created_at,
        scopes: (scopes ?? []).filter((s) => s.member_id === l.member_id).map((s) => s.scope as ScopeId),
      }))}
      events={(events ?? []).map((e) => ({ ...e, name: people?.find((p) => p.id === e.member_id)?.full_name ?? "—" }))}
    />
  );
}
