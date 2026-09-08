import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { DealChat } from "@/lib/deals/queries";
import type { Profile } from "@/lib/auth";

/**
 * Company dashboard (§3), presentation only — the counterpart to
 * DashboardView. Split out rather than branched inline because the two roles
 * genuinely have nothing in common here: a company has no inbound alias, no
 * media kit, and no audience-verification prompt to show.
 */
export function CompanyDashboardView({
  profile,
  chats,
}: {
  profile: Profile;
  chats: DealChat[];
}) {
  const recent = chats.slice(0, 5);
  const openDeals = chats.filter(
    (c) => c.deal_status !== "paid" && c.deal_status !== "disputed",
  ).length;

  return (
    <>
      <SectionHeader
        title={`Welcome back, ${profile.full_name.split(" ")[0]}`}
        description="Every offer you send is priced and risk-rated by the Co-Pilot before it reaches a creator's inbox."
        action={
          <Link href="/discover">
            <Button fullWidth={false}>Discover creators</Button>
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-white/45 uppercase">
            Open deals
          </p>
          <p className="mt-1.5 text-lg font-semibold text-white tabular-nums">
            {openDeals}
          </p>
          <p className="mt-2 text-xs text-white/40">
            {chats.length} total, across every creator you&apos;ve offered
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-white/45 uppercase">
            Commission
          </p>
          <p className="mt-1.5 text-lg font-semibold text-white">
            Charged on the deal, not on your seat
          </p>
          <p className="mt-2 text-xs text-white/40">
            Browsing and messaging creators is free (§8).
          </p>
        </GlassPanel>
      </div>

      <div className="mt-4">
        {recent.length === 0 ? (
          <EmptyState
            title="No deals yet"
            spec="§3"
            body="Head to Discover to browse creators and send your first offer — the Co-Pilot prices it before it goes out."
          />
        ) : (
          <GlassPanel className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-white">
                Recent deals
              </h2>
              <Link
                href="/inbox"
                className="text-xs text-white/45 transition hover:text-white/80"
              >
                View all ({chats.length})
              </Link>
            </div>

            <ul className="divide-y divide-white/5">
              {recent.map((chat) => (
                <li key={chat.id}>
                  <Link
                    href={`/inbox/${chat.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 transition hover:bg-white/4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-green"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-white">
                      {chat.sponsorship_type?.replace(/_/g, " ") ??
                        "unspecified deliverable"}
                    </span>
                    <span className="text-sm text-white/70 tabular-nums">
                      {chat.offered_amount === null
                        ? "—"
                        : `$${Number(chat.offered_amount).toLocaleString("en-US")}`}
                    </span>
                    <StatusBadge status={chat.deal_status} />
                    <RiskBadge risk={chat.ai_evaluation} />
                  </Link>
                </li>
              ))}
            </ul>
          </GlassPanel>
        )}
      </div>
    </>
  );
}
