"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { HeldDeliveriesPanel } from "@/components/deals/HeldDeliveriesPanel";
import { SourceBadge } from "@/components/deals/SourceBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import type { DealChatListItem } from "@/lib/deals/queries";
import type { HeldDeliveries } from "@/lib/email/held";

type SourceFilter = "all" | "in_app" | "forwarded";

function formatMoney(amount: number | null) {
  if (amount === null) return "—";
  return `$${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Deal-room list, presentation only. Shared with /preview. */
export function InboxView({
  chats,
  held = null,
  basePath = "",
}: {
  chats: DealChatListItem[];
  /**
   * Deliveries the screener held back. Null for anyone but a creator — only
   * creators hold an inbound alias.
   */
  held?: HeldDeliveries | null;
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

      {/*
        Above the empty-state branch on purpose: a creator with no deal rooms
        but held mail is exactly the one wondering where their offer went.
      */}
      <HeldDeliveriesPanel held={held} />

      {chats.length === 0 ? (
        <EmptyState
          title={t("inbox.noRoomsTitle")}
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
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:focus-ring ${
                    active
                      ? "border-forest bg-forest text-white dark:border-brand-green dark:bg-brand-green dark:text-ink"
                      : "border-line-strong bg-surface text-fg-secondary hover:bg-surface-hover hover:text-fg"
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
              <label className="ms-auto flex items-center gap-1.5 text-xs text-fg-muted">
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
              <GlassPanel key={chat.id} className="transition-colors hover:border-line-strong hover:bg-surface-soft">
                {/* Two rows on every width: who and how much first, then the
                    deliverable and the badges. One wrapping row used to squeeze
                    the sender into a few characters on phones. */}
                <Link
                  href={`${basePath}/inbox/${chat.id}`}
                  className="block rounded-card p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green sm:px-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-fg" dir="ltr" title={chat.sender_email}>
                        {chat.sender_email}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-fg-muted">
                        {chat.sponsorship_type?.replace(/_/g, " ") ?? t("inbox.unspecifiedDeliverable")}
                        {chat.target_countries?.length
                          ? ` · ${t("inbox.targeting", { countries: chat.target_countries.join(", ") })}`
                          : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-base font-bold text-fg tabular-nums">
                      {formatMoney(chat.offered_amount)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={chat.deal_status} />
                    <RiskBadge risk={chat.ai_evaluation} />
                    <SourceBadge companyId={chat.company_id} />
                    {!chat.is_likely_sponsorship ? (
                      <span
                        className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning"
                        title={t("inbox.possibleSpamTitle")}
                      >
                        {t("inbox.possibleSpam")}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </GlassPanel>
            ))}

            {visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-muted">{t("inbox.noneMatchFilter")}</p>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
