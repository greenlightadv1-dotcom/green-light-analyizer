"use client";

import Link from "next/link";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { CompanyIntelligencePanel } from "@/components/deals/CompanyIntelligencePanel";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { SourceBadge } from "@/components/deals/SourceBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { DealRoom } from "@/app/(app)/inbox/[chatId]/DealRoom";
import { StatusControl } from "@/app/(app)/inbox/[chatId]/StatusControl";
import { useTranslation } from "@/components/LocaleProvider";
import type { OwnDomainHistory } from "@/lib/deals/company-intelligence";
import type { DealChat, Message } from "@/lib/deals/queries";

/** Deal Chat Room (§6), presentation only. Shared with /preview. */
export function DealRoomView({
  chat,
  chatId,
  messages,
  currentUserId,
  domainHistory = null,
  demo = false,
  basePath = "",
}: {
  chat: DealChat;
  chatId: string;
  messages: Message[];
  currentUserId: string;
  /** Null for in-app deals (company_id set) — not computed for those. */
  domainHistory?: OwnDomainHistory | null;
  /** Preview mode: the composer echoes locally instead of calling the server. */
  demo?: boolean;
  /** Link prefix. The UI preview passes "/preview" to stay inside itself. */
  basePath?: string;
}) {
  const { t } = useTranslation();

  return (
    <>
      <div className="mb-1">
        <Link
          href={`${basePath}/inbox`}
          className="text-xs text-fg/40 transition hover:text-fg/70"
        >
          {t("inbox.backToInbox")}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader
          title={chat.sender_email}
          description={t("inbox.contactStrippedNote")}
        />
      </div>
      <div className="-mt-4 mb-4">
        <SourceBadge companyId={chat.company_id} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DealRoom
            chatId={chatId}
            initialMessages={messages}
            currentUserId={currentUserId}
            demo={demo}
          />
        </div>

        <div className="space-y-4">
          <GlassPanel className="p-5">
            <h2 className="text-sm font-semibold text-fg">{t("inbox.deal")}</h2>
            <dl className="mt-4 space-y-3.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-fg/45">{t("inbox.offer")}</dt>
                <dd className="font-semibold text-fg tabular-nums">
                  {chat.offered_amount === null
                    ? "—"
                    : `$${Number(chat.offered_amount).toLocaleString("en-US")}`}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-fg/45">{t("inbox.deliverable")}</dt>
                <dd className="text-fg capitalize">
                  {chat.sponsorship_type?.replace(/_/g, " ") ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-fg/45">{t("inbox.targetingLabel")}</dt>
                <dd className="text-fg">
                  {chat.target_countries?.join(", ") || "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-fg/45">{t("inbox.coPilot")}</dt>
                <dd>
                  <RiskBadge risk={chat.ai_evaluation} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-fg/45">{t("inbox.status")}</dt>
                <dd>
                  <StatusBadge status={chat.deal_status} />
                </dd>
              </div>
            </dl>
          </GlassPanel>

          <StatusControl
            chatId={chatId}
            current={chat.deal_status ?? "new"}
            demo={demo}
          />

          <CompanyIntelligencePanel chat={chat} domainHistory={domainHistory} />

          <GlassPanel className="p-5">
            <h2 className="text-sm font-semibold text-fg">
              {t("inbox.whyCantShare")}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-fg/45">
              {t("inbox.whyCantShareBody")}
            </p>
          </GlassPanel>
        </div>
      </div>
    </>
  );
}
