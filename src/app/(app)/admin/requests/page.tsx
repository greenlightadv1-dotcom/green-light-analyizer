import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LinkRepresentativeForm } from "./LinkRepresentativeForm";
import { rejectRequest, unlinkRepresentative } from "./actions";

export const metadata: Metadata = { title: "Applications" };

/**
 * Get Started applications (features 1–2). Admin-only; read with the service
 * role because access_requests has no client policies. "Create account"
 * opens /admin/users prefilled from the application — the admin still
 * creates the account, so the product stays admin-gated. Admins never sign
 * in as the applicant.
 */
export default async function AdminRequestsPage() {
  await requireRole("admin");
  const service = createAdminClient();
  const [{ data: requests, error }, { data: links }] = await Promise.all([
    service
      .from("access_requests")
      .select("id, journey, full_name, email, company_name, website, primary_platform, channel_handle, message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    service.from("company_members").select("member_id, company_id, member_role, created_at").limit(100),
  ]);

  const ids = [...new Set((links ?? []).flatMap((l) => [l.member_id, l.company_id]))];
  const { data: names } = ids.length
    ? await service.from("profiles").select("id, full_name, primary_email").in("id", ids)
    : { data: [] as { id: string; full_name: string; primary_email: string }[] };
  const name = (id: string) => {
    const p = names?.find((n) => n.id === id);
    return p ? `${p.full_name} (${p.primary_email})` : id;
  };

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const reviewed = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <>
      <SectionHeader title="Applications" description="Requests from the public Get Started page. Create the account from an application, or reject it. Applicants are not notified automatically." />

      {error ? (
        <GlassPanel className="mb-4 p-5 text-sm text-fg/70">
          Applications are unavailable on this database (migration 0024 not applied).
        </GlassPanel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassPanel className="overflow-hidden lg:col-span-2">
          <h2 className="border-b border-fg/5 px-5 py-3 text-sm font-semibold text-fg">Pending ({pending.length})</h2>
          {pending.length === 0 ? (
            <p className="px-5 py-6 text-sm text-fg/50">No pending applications.</p>
          ) : (
            <ul className="divide-y divide-fg/5">
              {pending.map((r) => (
                <li key={r.id} className="space-y-2 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium text-fg">{r.full_name}</span>
                    <span className="text-xs text-fg/55" dir="ltr">{r.email}</span>
                    <span className="rounded-full border border-fg/15 px-2 py-0.5 text-[11px] text-fg/60">{r.journey.replace(/_/g, " ")}</span>
                    <span className="text-xs text-fg/40">{new Date(r.created_at).toISOString().slice(0, 10)}</span>
                  </div>
                  <dl className="grid gap-x-4 gap-y-0.5 text-xs text-fg/60 sm:grid-cols-2">
                    {r.company_name ? <div><dt className="inline text-fg/40">Company: </dt><dd className="inline">{r.company_name}</dd></div> : null}
                    {r.website ? <div><dt className="inline text-fg/40">Website: </dt><dd className="inline" dir="ltr">{r.website}</dd></div> : null}
                    {r.primary_platform ? <div><dt className="inline text-fg/40">Platform: </dt><dd className="inline">{r.primary_platform}</dd></div> : null}
                    {r.channel_handle ? <div><dt className="inline text-fg/40">Channel: </dt><dd className="inline" dir="ltr">{r.channel_handle}</dd></div> : null}
                  </dl>
                  {r.message ? <p className="text-xs whitespace-pre-wrap text-fg/60">{r.message}</p> : null}
                  <div className="flex gap-2 pt-1">
                    <Link href={`/admin/users?request=${r.id}`} className="h-9 rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 text-xs leading-9 font-medium text-brand-green hover:bg-brand-green/20">
                      Create account
                    </Link>
                    <form action={rejectRequest}>
                      <input type="hidden" name="request_id" value={r.id} />
                      <button className="h-9 rounded-lg border border-red-400/30 bg-red-500/10 px-3 text-xs font-medium text-red-700 hover:bg-red-500/20 dark:text-red-200">Reject</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {reviewed.length ? (
            <details className="border-t border-fg/5 px-5 py-3 text-xs text-fg/55">
              <summary className="cursor-pointer">Reviewed ({reviewed.length})</summary>
              <ul className="mt-2 space-y-1">
                {reviewed.map((r) => (
                  <li key={r.id}>
                    {r.status} · {r.full_name} · <span dir="ltr">{r.email}</span> · {r.journey.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </GlassPanel>

        <GlassPanel className="p-5">
          <h2 className="text-sm font-semibold text-fg">Company representatives</h2>
          <p className="mt-1 mb-4 text-xs leading-relaxed text-fg/50">
            Create the representative as a company account first, then link it to the company it acts for. A link shows the representative who they represent; it does not share the company&apos;s deals.
          </p>
          <LinkRepresentativeForm />
          {(links ?? []).length ? (
            <ul className="mt-5 space-y-2 border-t border-fg/5 pt-4 text-xs text-fg/65">
              {(links ?? []).map((l) => (
                <li key={l.member_id} className="flex items-start justify-between gap-2">
                  <span>
                    {name(l.member_id)} → {name(l.company_id)}
                  </span>
                  <form action={unlinkRepresentative}>
                    <input type="hidden" name="member_id" value={l.member_id} />
                    <button className="text-fg/50 underline hover:text-fg">Unlink</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </GlassPanel>
      </div>
    </>
  );
}
