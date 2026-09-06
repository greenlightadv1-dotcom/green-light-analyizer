import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CreateUserForm } from "./CreateUserForm";

export const metadata: Metadata = { title: "Accounts" };

/**
 * Admin account management — §4.1. Admins are the only ones who can bring an
 * account into existence, so this page is the front door to the whole product.
 */
export default async function AdminUsersPage() {
  await requireRole("admin");

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, primary_email, role, region, subscription_plan, must_change_password")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <SectionHeader
        title="Accounts"
        description="Green Light is admin-gated. Every creator and company account is opened here — there is no public sign-up."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <CreateUserForm />
        </div>

        <GlassPanel className="overflow-hidden lg:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/8 text-xs tracking-wide text-white/40 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(profiles ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3">
                      <span className="text-white">{p.full_name}</span>
                      <span className="block text-xs text-white/40">
                        {p.primary_email}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white/60 capitalize">
                      {p.role}
                    </td>
                    <td className="px-5 py-3 text-white/60">
                      {p.subscription_plan}
                    </td>
                    <td className="px-5 py-3">
                      {p.must_change_password ? (
                        <span className="text-amber-300/80">
                          Password reset pending
                        </span>
                      ) : (
                        <span className="text-brand-green">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!profiles?.length ? (
                  <tr>
                    <td className="px-5 py-8 text-white/40" colSpan={4}>
                      No accounts yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      </div>
    </>
  );
}
