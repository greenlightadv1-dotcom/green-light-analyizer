import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CreateUserForm } from "./CreateUserForm";
import { setBan, updateProfile } from "./actions";

export const metadata: Metadata = { title: "Accounts" };

const selectClass =
  "h-9 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-white transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none";
const inputClass =
  "h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-white placeholder:text-white/30 transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none";
const saveButtonClass =
  "h-9 shrink-0 rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 text-xs font-medium text-brand-green transition hover:bg-brand-green/20";
const banButtonClass =
  "h-9 shrink-0 rounded-lg border border-red-400/30 bg-red-500/10 px-3 text-xs font-medium text-red-200 transition hover:bg-red-500/20";
const unbanButtonClass =
  "h-9 shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white/60 transition hover:bg-white/10 hover:text-white";

/**
 * Admin account management — §4.1. Admins are the only ones who can bring an
 * account into existence, so this page is the front door to the whole product.
 *
 * Every row but the calling admin's own gets a "Manage" disclosure (plain
 * <details>, no client JS) to edit plan/region/role or ban/unban — closing
 * the gap where an account was frozen at whatever was set on creation, with
 * no way to apply a plan upgrade confirmed via Discord (§4.3).
 */
export default async function AdminUsersPage() {
  const admin = await requireRole("admin");

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select(
      "id, full_name, primary_email, role, region, subscription_plan, subscription_expires_at, must_change_password, banned_at, banned_reason",
    )
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
          <ul className="divide-y divide-white/5">
            {(profiles ?? []).map((p) => (
              <li key={p.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">
                      {p.full_name}
                    </span>
                    <span className="block truncate text-xs text-white/40">
                      {p.primary_email}
                    </span>
                  </div>
                  <span className="text-xs text-white/60 capitalize">
                    {p.role}
                  </span>
                  <span className="text-xs text-white/60">
                    {p.subscription_plan}
                    {p.subscription_expires_at ? (
                      <>
                        {" "}
                        · ends{" "}
                        {new Date(p.subscription_expires_at).toLocaleDateString()}
                      </>
                    ) : null}
                  </span>
                  {p.banned_at ? (
                    <span className="text-red-300">Banned</span>
                  ) : p.must_change_password ? (
                    <span className="text-xs text-amber-300/80">
                      Password reset pending
                    </span>
                  ) : (
                    <span className="text-xs text-brand-green">Active</span>
                  )}
                </div>

                {p.id === admin.id ? (
                  <p className="mt-2 text-xs text-white/30">This is you.</p>
                ) : (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-white/45 transition select-none hover:text-white/80">
                      Manage
                    </summary>

                    <div className="mt-3 space-y-4 rounded-xl border border-white/8 bg-navy-dark/40 p-4">
                      <form
                        action={updateProfile}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <input type="hidden" name="profile_id" value={p.id} />

                        <div className="space-y-1">
                          <label className="block text-[10px] tracking-wide text-white/40 uppercase">
                            Plan
                          </label>
                          <select
                            name="subscription_plan"
                            defaultValue={p.subscription_plan ?? "Starter"}
                            className={selectClass}
                          >
                            <option value="Starter">Starter</option>
                            <option value="Pro">Pro</option>
                            <option value="Elite">Elite</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] tracking-wide text-white/40 uppercase">
                            Region
                          </label>
                          <select
                            name="region"
                            defaultValue={p.region ?? "MENA"}
                            className={selectClass}
                          >
                            <option value="MENA">MENA</option>
                            <option value="International">
                              International
                            </option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] tracking-wide text-white/40 uppercase">
                            Role
                          </label>
                          <select
                            name="role"
                            defaultValue={p.role}
                            className={selectClass}
                          >
                            <option value="creator">Creator</option>
                            <option value="company">Company</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] tracking-wide text-white/40 uppercase">
                            Renew / extend
                          </label>
                          <select
                            name="duration_preset"
                            defaultValue="none"
                            className={selectClass}
                          >
                            <option value="none">No change to expiry</option>
                            <option value="30">Monthly — 30 days</option>
                            <option value="90">Quarterly — 90 days</option>
                            <option value="365">Yearly — 365 days</option>
                            <option value="custom">Custom…</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] tracking-wide text-white/40 uppercase">
                            Custom days
                          </label>
                          <input
                            type="number"
                            name="custom_days"
                            min={1}
                            placeholder="e.g. 45"
                            className={`${inputClass} h-9 w-24`}
                          />
                        </div>

                        <button type="submit" className={saveButtonClass}>
                          Save changes
                        </button>
                      </form>

                      <p className="text-[11px] leading-relaxed text-white/35">
                        Changing role does not move this account&apos;s
                        existing deals or media kits — use this to correct a
                        miscreated account, not to reassign an active one.
                        Renewing adds to any time already remaining rather
                        than resetting it, and only applies when a duration
                        other than &ldquo;No change&rdquo; is picked — editing
                        plan/region/role alone never touches the expiry date.
                      </p>

                      <div className="border-t border-white/8 pt-3.5">
                        {p.banned_at ? (
                          <form
                            action={setBan}
                            className="flex flex-wrap items-center gap-3"
                          >
                            <input
                              type="hidden"
                              name="profile_id"
                              value={p.id}
                            />
                            <input type="hidden" name="action" value="unban" />
                            <p className="min-w-0 flex-1 text-xs text-white/50">
                              Banned{" "}
                              {new Date(p.banned_at).toLocaleDateString()} —{" "}
                              {p.banned_reason}
                            </p>
                            <button type="submit" className={unbanButtonClass}>
                              Unban
                            </button>
                          </form>
                        ) : (
                          <form
                            action={setBan}
                            className="flex flex-wrap items-end gap-3"
                          >
                            <input
                              type="hidden"
                              name="profile_id"
                              value={p.id}
                            />
                            <input type="hidden" name="action" value="ban" />
                            <div className="min-w-[220px] flex-1 space-y-1">
                              <label className="block text-[10px] tracking-wide text-white/40 uppercase">
                                Ban reason
                              </label>
                              <input
                                name="reason"
                                required
                                placeholder="e.g. confirmed fraud, Discord report"
                                className={inputClass}
                              />
                            </div>
                            <button type="submit" className={banButtonClass}>
                              Ban
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </details>
                )}
              </li>
            ))}
            {!profiles?.length ? (
              <li className="px-5 py-8 text-sm text-white/40">
                No accounts yet.
              </li>
            ) : null}
          </ul>
        </GlassPanel>
      </div>
    </>
  );
}
