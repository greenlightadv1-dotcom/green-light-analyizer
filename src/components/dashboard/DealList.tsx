"use client";

import Link from "next/link";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import type { DealChatListItem } from "@/lib/deals/queries";

/**
 * Recent deals on a dashboard. Two lines per row on every width (who or what
 * and the amount, then the badges), so nothing is squeezed on a phone.
 * `title` decides what names a row: the sender for a creator, the
 * deliverable for a company.
 */
export function DealList({
  chats,
  total,
  title,
  basePath = "",
}: {
  chats: DealChatListItem[];
  total: number;
  title: (chat: DealChatListItem) => { text: string; ltr?: boolean };
  basePath?: string;
}) {
  const { t } = useTranslation();
  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-base font-semibold text-fg">{t("dashboard.recentDeals")}</h2>
        <Link href={`${basePath}/inbox`} className="rounded-full px-2 py-1 text-xs font-semibold text-accent hover:underline focus-visible:focus-ring">
          {t("dashboard.viewAll", { count: total })}
        </Link>
      </div>
      <ul className="divide-y divide-line">
        {chats.map((chat) => {
          const label = title(chat);
          return (
            <li key={chat.id}>
              <Link
                href={`${basePath}/inbox/${chat.id}`}
                className="block px-5 py-3.5 transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-green"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-fg" dir={label.ltr ? "ltr" : undefined}>
                    {label.text}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-fg tabular-nums">
                    {chat.offered_amount === null ? "—" : `$${Number(chat.offered_amount).toLocaleString("en-US")}`}
                  </span>
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge status={chat.deal_status} />
                  <RiskBadge risk={chat.ai_evaluation} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}
