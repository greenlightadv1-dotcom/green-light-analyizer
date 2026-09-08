import Link from "next/link";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { DealRoom } from "@/app/(app)/inbox/[chatId]/DealRoom";
import { StatusControl } from "@/app/(app)/inbox/[chatId]/StatusControl";
import type { DealChat, Message } from "@/lib/deals/queries";

/** Deal Chat Room (§6), presentation only. Shared with /preview. */
export function DealRoomView({
  chat,
  chatId,
  messages,
  currentUserId,
  demo = false,
  basePath = "",
}: {
  chat: DealChat;
  chatId: string;
  messages: Message[];
  currentUserId: string;
  /** Preview mode: the composer echoes locally instead of calling the server. */
  demo?: boolean;
  /** Link prefix. The UI preview passes "/preview" to stay inside itself. */
  basePath?: string;
}) {

  return (
    <>
      <div className="mb-1">
        <Link
          href={`${basePath}/inbox`}
          className="text-xs text-fg/40 transition hover:text-fg/70"
        >
          ← Deal inbox
        </Link>
      </div>

      <SectionHeader
        title={chat.sender_email}
        description="Contact details are stripped before a message is stored. Everything stays on-platform."
      />

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
            <h2 className="text-sm font-semibold text-fg">Deal</h2>
            <dl className="mt-4 space-y-3.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-fg/45">Offer</dt>
                <dd className="font-semibold text-fg tabular-nums">
                  {chat.offered_amount === null
                    ? "—"
                    : `$${Number(chat.offered_amount).toLocaleString("en-US")}`}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-fg/45">Deliverable</dt>
                <dd className="text-fg capitalize">
                  {chat.sponsorship_type?.replace(/_/g, " ") ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-fg/45">Targeting</dt>
                <dd className="text-fg">
                  {chat.target_countries?.join(", ") || "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-fg/45">Co-Pilot</dt>
                <dd>
                  <RiskBadge risk={chat.ai_evaluation} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-fg/45">Status</dt>
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

          <GlassPanel className="p-5">
            <h2 className="text-sm font-semibold text-fg">
              Why you can&apos;t share contacts
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-fg/45">
              Emails, phone numbers and links to WhatsApp, Telegram or Discord
              are removed automatically before a message is saved. Taking a deal
              off-platform is grounds for permanent removal — and the platform
              can only protect your payment while the deal stays here.
            </p>
          </GlassPanel>
        </div>
      </div>
    </>
  );
}
