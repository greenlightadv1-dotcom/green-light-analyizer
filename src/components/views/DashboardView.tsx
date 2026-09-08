import Link from "next/link";
import { ComingSoonCard } from "@/components/dashboard/ComingSoonCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { canVerifyAudience } from "@/lib/media-kit/platforms";
import type { DealChat } from "@/lib/deals/queries";
import type { MediaKit } from "@/lib/media-kit/queries";
import type { Profile } from "@/lib/auth";

/**
 * Creator dashboard, presentation only.
 *
 * Split from the page so the same markup renders both from live data and from
 * the mock dataset at /preview. A preview that reimplemented the UI would drift
 * from it within a week and stop being worth looking at.
 */
export function DashboardView({
  profile,
  chats,
  kits,
}: {
  profile: Profile;
  chats: DealChat[];
  kits: MediaKit[];
}) {
  const recent = chats.slice(0, 5);
  const openDeals = chats.filter(
    (c) => c.deal_status !== "paid" && c.deal_status !== "disputed",
  ).length;
  const verifiedKits = kits.filter((k) => k.audience_verified).length;
  const plan = profile.subscription_plan ?? "Starter";

  return (
    <>
      <SectionHeader
        title={`Welcome back, ${profile.full_name.split(" ")[0]}`}
        description="Every offer that reaches your inbound alias is priced and risk-rated before you read it."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-fg/45 uppercase">Plan</p>
          <p className="mt-1.5 text-lg font-semibold text-fg">
            {profile.subscription_plan ?? "Starter"}
          </p>
          {/* §4.3 — no in-app billing in the MVP; upgrades go through Discord. */}
          <p className="mt-2 text-xs text-fg/40">
            Upgrades and payments are handled via Discord support tickets.
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-fg/45 uppercase">
            Open deals
          </p>
          <p className="mt-1.5 text-lg font-semibold text-fg tabular-nums">
            {openDeals}
          </p>
          <p className="mt-2 text-xs text-fg/40">
            {profile.region ?? "MENA"} pricing · {plan} plan
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-fg/45 uppercase">
            Inbound alias
          </p>
          <p className="mt-1.5 font-mono text-sm break-all text-brand-green">
            {profile.inbound_alias ?? "Not issued yet"}
          </p>
          <p className="mt-2 text-xs text-fg/40">
            Forward your public business email here.
          </p>
        </GlassPanel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {recent.length === 0 ? (
            <EmptyState
              title="No deals yet"
              spec="§5, §6.2"
              body="Offers forwarded to your inbound alias turn into deal rooms here, already priced and risk-rated. Set up forwarding in Settings to start receiving them."
            />
          ) : (
            <GlassPanel className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-fg/8 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-fg">
                  Recent deals
                </h2>
                <Link
                  href="/inbox"
                  className="text-xs text-fg/45 transition hover:text-fg/80"
                >
                  View all ({chats.length})
                </Link>
              </div>

              <ul className="divide-y divide-fg/5">
                {recent.map((chat) => (
                  <li key={chat.id}>
                    <Link
                      href={`/inbox/${chat.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 transition hover:bg-fg/4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-green"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">
                        {chat.sender_email}
                      </span>
                      <span className="text-sm text-fg/70 tabular-nums">
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

          {/*
            §7.2/§7.4 made concrete: the reason to connect analytics is that
            unverified geography caps a high-value deal at yellow. Saying that
            beats a generic "connect your accounts" prompt.
          */}
          <GlassPanel className="p-5">
            <h2 className="text-sm font-semibold text-fg">
              Audience verification
            </h2>
            {verifiedKits > 0 ? (
              <p className="mt-2 text-sm leading-relaxed text-fg/55">
                {verifiedKits} of your {kits.length} connected{" "}
                {kits.length === 1 ? "platform" : "platforms"} has verified
                audience data. Offers against it are priced with full
                confidence.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-fg/55">
                Your audience data is self-reported, so a high-value offer
                can&apos;t be rated green on it alone.{" "}
                {canVerifyAudience(plan)
                  ? "Connecting YouTube or Instagram analytics lifts that cap."
                  : "Verified audience data is included on Pro and Elite."}
              </p>
            )}
            <Link
              href="/media-kit"
              className="mt-3 inline-block text-xs text-brand-green transition hover:brightness-125"
            >
              Open media kit →
            </Link>
          </GlassPanel>
        </div>

        <ComingSoonCard />
      </div>
    </>
  );
}

