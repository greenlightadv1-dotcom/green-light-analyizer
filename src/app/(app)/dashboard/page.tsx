import type { Metadata } from "next";
import { ComingSoonCard } from "@/components/dashboard/ComingSoonCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Creator dashboard — structure only for now. The stat tiles read from the
 * profile; deal volume / earnings tiles land once deal_chats is populated by
 * the email intake pipeline (§5).
 */
export default async function DashboardPage() {
  const profile = await requireProfile();

  return (
    <>
      <SectionHeader
        title={`Welcome back, ${profile.full_name.split(" ")[0]}`}
        description="Every offer that reaches your inbound alias is priced and risk-rated before you read it."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-white/45 uppercase">Plan</p>
          <p className="mt-1.5 text-lg font-semibold text-white">
            {profile.subscription_plan ?? "Starter"}
          </p>
          {/* §4.3 — no in-app billing in the MVP; upgrades go through Discord. */}
          <p className="mt-2 text-xs text-white/40">
            Upgrades and payments are handled via Discord support tickets.
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-white/45 uppercase">
            Region
          </p>
          <p className="mt-1.5 text-lg font-semibold text-white">
            {profile.region ?? "MENA"}
          </p>
          <p className="mt-2 text-xs text-white/40">
            Drives which price list you are shown.
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-white/45 uppercase">
            Inbound alias
          </p>
          <p className="mt-1.5 font-mono text-sm break-all text-brand-green">
            {profile.inbound_alias ?? "Not issued yet"}
          </p>
          <p className="mt-2 text-xs text-white/40">
            Forward your public business email here.
          </p>
        </GlassPanel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <EmptyState
            title="Recent deals"
            spec="§6.2"
            body="Deal Chat Rooms created from inbound offers will be listed here with their AI risk rating and status. Nothing yet — the email intake pipeline is not wired up."
          />
          <EmptyState
            title="Audience verification"
            spec="§7"
            body="Connect YouTube or Instagram analytics to turn self-reported audience geography into verified data. Verified audience data is what lets a high-value deal earn a green rating."
          />
        </div>

        <ComingSoonCard />
      </div>
    </>
  );
}
