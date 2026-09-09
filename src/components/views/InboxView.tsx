"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { SourceBadge } from "@/components/deals/SourceBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import type { DealChat } from "@/lib/deals/queries";

type SourceFilter = "all" | "in_app" | "forwarded";

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
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [hideSpam, setHideSpam] = useState(false);

  const inAppCount = chats.filter((c) => c.company_id !== null).length;
  const forwardedCount = chats.length - inAppCount;
  const spamCount = chats.filter((c) => !c.is_likely_sponsorship).length;

  const visible = useMemo(() => {
    return chats.filter((chat) => {
      if (sourceFilter === "in_app" && chat.company_id === null) return false;
      if (sourceFilter === "forwarded" && chat.company_id !== null) return false;
      if (hideSpam && !chat.is_likely_sponsorship) return false;
      return true;
    });
  }, [chats, sourceFilter, hideSpam]);

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
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["all", "in_app", "forwarded"] as const).map((option) => {
              const count =
                option === "all" ? chats.length : option === "in_app" ? inAppCount : forwardedCount;
              const active = sourceFilter === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSourceFilter(option)}
                  aria-pressed={active}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-brand-green/30 bg-brand-green/10 text-brand-green"
                      : "border-fg/10 bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg"
                  }`}
                >
                  {t(
                    option === "all"
                      ? "inbox.filterAll"
                      : option === "in_app"
                        ? "inbox.filterInApp"
                        : "inbox.filterForwarded",
                  )}{" "}
                  ({count})
                </button>
              );
            })}

            {spamCount > 0 ? (
              <label className="ms-auto flex items-center gap-1.5 text-xs text-fg/50">
                <input
                  type="checkbox"
                  checked={hideSpam}
                  onChange={(e) => setHideSpam(e.target.checked)}
                  className="accent-brand-green"
                />
                {t("inbox.hideSpam", { count: spamCount })}
              </label>
            ) : null}
          </div>

          <div className="space-y-2.5">
            {visible.map((chat) => (
              <GlassPanel key={chat.id} className="transition hover:bg-navy/45">
                <Link
                  href={`${basePath}/inbox/${chat.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-fg">
                        {chat.sender_email}
                      </p>
                      <SourceBadge companyId={chat.company_id} />
                      {!chat.is_likely_sponsorship ? (
                        <span
                          className="rounded-md bg-amber-300/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-200"
                          title={t("inbox.possibleSpamTitle")}
                        >
                          {t("inbox.possibleSpam")}
                        </span>
                      ) : null}
                    </div>
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

            {visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg/40">{t("inbox.noneMatchFilter")}</p>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
