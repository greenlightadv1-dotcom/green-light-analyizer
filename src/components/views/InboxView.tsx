"use client";

import Link from "next/link";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import type { DealChat } from "@/lib/deals/queries";

function formatMoney(amount: number | null) {
  if (amount === null) return "—";
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
  const { t } = useTranslation();

  return (
    <>
      <SectionHeader
        title={t("inbox.title")}
        description={t("inbox.description")}
      />

      {chats.length === 0 ? (
        <EmptyState
          title={t("inbox.noRoomsTitle")}
          spec="§5, §6.2"
          body={t("inbox.noRoomsBody")}
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
                  <p className="truncate text-sm font-medium text-fg">
                    {chat.sender_email}
                  </p>
                  <p className="mt-0.5 text-xs text-fg/40">
                    {chat.sponsorship_type?.replace(/_/g, " ") ?? t("inbox.unspecifiedDeliverable")}
                    {chat.target_countries?.length
                      ? ` · ${t("inbox.targeting", { countries: chat.target_countries.join(", ") })}`
                      : ""}
                  </p>
                </div>

                <p className="text-sm font-semibold text-fg tabular-nums">
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
