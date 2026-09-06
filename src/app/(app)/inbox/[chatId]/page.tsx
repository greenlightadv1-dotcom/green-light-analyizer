import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireProfile } from "@/lib/auth";
import { getDealChat, listMessages } from "@/lib/deals/queries";
import { DealRoom } from "./DealRoom";
import { StatusControl } from "./StatusControl";

export const metadata: Metadata = { title: "Deal room" };

/**
 * Deal Chat Room — CLAUDE.md §6.
 *
 * Messages arrive here already masked: the server strips contact details
 * before the row is written (see actions.ts), so nothing rendered on this page
 * can contain a phone number or an external handle even if a sender tried.
 */
export default async function DealRoomPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;

  const [profile, chat] = await Promise.all([
    requireProfile(),
    getDealChat(chatId),
  ]);

  // Null means either "no such room" or "not yours" — RLS does not distinguish,
  // and neither should the response.
  if (!chat) notFound();

  const messages = await listMessages(chatId);

  return (
    <>
      <div className="mb-1">
        <Link
          href="/inbox"
          className="text-xs text-white/40 transition hover:text-white/70"
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
            currentUserId={profile.id}
          />
        </div>

        <div className="space-y-4">
          <GlassPanel className="p-5">
            <h2 className="text-sm font-semibold text-white">Deal</h2>
            <dl className="mt-4 space-y-3.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-white/45">Offer</dt>
                <dd className="font-semibold text-white tabular-nums">
                  {chat.offered_amount === null
                    ? "—"
                    : `$${Number(chat.offered_amount).toLocaleString("en-US")}`}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-white/45">Deliverable</dt>
                <dd className="text-white capitalize">
                  {chat.sponsorship_type?.replace(/_/g, " ") ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-white/45">Targeting</dt>
                <dd className="text-white">
                  {chat.target_countries?.join(", ") || "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-white/45">Co-Pilot</dt>
                <dd>
                  <RiskBadge risk={chat.ai_evaluation} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-white/45">Status</dt>
                <dd>
                  <StatusBadge status={chat.deal_status} />
                </dd>
              </div>
            </dl>
          </GlassPanel>

          <StatusControl chatId={chatId} current={chat.deal_status ?? "new"} />

          <GlassPanel className="p-5">
            <h2 className="text-sm font-semibold text-white">
              Why you can&apos;t share contacts
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-white/45">
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
