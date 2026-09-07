import Link from "next/link";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { DealChat } from "@/lib/deals/queries";

function formatMoney(amount: number | null) {
  if (amount === null) return "\u2014";
  return `$${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Deal-room list, presentation only. Shared with /preview. */
export function InboxView({
  chats,
  basePath = "",
}: {
  chats: DealChat[];
  /** Link prefix. The UI preview passes "/preview" to stay inside itself. */
  basePath?: string;
}) {

  return (
    <>
      <SectionHeader
        title="Deal inbox"
        description="Every sponsorship offer becomes a chat room here — masked, priced and risk-rated."
      />

      {chats.length === 0 ? (
        <EmptyState
          title="No deal rooms yet"
          spec="§5, §6.2"
          body="Rooms appear automatically when an offer arrives at your inbound alias, or when you open one from the Manual Analyzer."
        />
      ) : (
        <div className="space-y-2.5">
          {chats.map((chat) => (
            <GlassPanel key={chat.id} className="transition hover:bg-navy/45">
              <Link
                href={`${basePath}/inbox/${chat.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {chat.sender_email}
                  </p>
                  <p className="mt-0.5 text-xs text-white/40">
                    {chat.sponsorship_type?.replace(/_/g, " ") ?? "unspecified deliverable"}
                    {chat.target_countries?.length
                      ? ` · targeting ${chat.target_countries.join(", ")}`
                      : ""}
                  </p>
                </div>

                <p className="text-sm font-semibold text-white tabular-nums">
                  {formatMoney(chat.offered_amount)}
                </p>
                <StatusBadge status={chat.deal_status} />
                <RiskBadge risk={chat.ai_evaluation} />
              </Link>
            </GlassPanel>
          ))}
        </div>
      )}
    </>
  );
}

