import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DealRoomView } from "@/components/views/DealRoomView";
import { requireProfile } from "@/lib/auth";
import { getOwnHistoryWithDomain } from "@/lib/deals/company-intelligence";
import { getDealChat, listMessages } from "@/lib/deals/queries";
import { buildDirectReply } from "@/lib/deals/reply-template";

export const metadata: Metadata = { title: "Deal room" };
/**
 * Server actions run inside this route segment's function, and the ones
 * reachable from this page call the model (src/lib/ai/chat.ts), which budgets
 * up to 50s across its attempts. Without this the segment runs on Vercel's
 * default timeout — well under that — so the platform killed the request
 * before the AI budget was anywhere near spent, and the creator got a dead
 * page rather than the rule-based fallback. 60s is the Hobby ceiling.
 */
export const maxDuration = 60;


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

  // Company & Domain Intelligence (§3): only meaningful for an external
  // sender — an in-app deal's company_id is already a real platform account.
  const [messages, domainHistory] = await Promise.all([
    listMessages(chatId),
    chat.company_id ? Promise.resolve(null) : getOwnHistoryWithDomain(chat.sender_email, chatId),
  ]);

  // The one-click Direct Reply is composed here, from the deal's own columns,
  // rather than in the browser: the figures in it are the platform's finding
  // about this deal, and a client-built body would be whatever the page was
  // handed. Only offered to the creator on an emailed offer — a company party
  // is already reading the thread in-app, so there is nothing to relay.
  const directReplyBody =
    !chat.company_id && chat.creator_id === profile.id
      ? buildDirectReply({
          creatorName: profile.full_name,
          offeredAmountUsd: chat.offered_amount,
          recommendedPriceUsd: chat.recommended_price_usd,
          sponsorshipType: chat.sponsorship_type,
          dealStatus: chat.deal_status,
        })
      : null;

  return (
    <DealRoomView
      chat={chat}
      chatId={chatId}
      messages={messages}
      currentUserId={profile.id}
      domainHistory={domainHistory}
      directReplyBody={directReplyBody}
    />
  );
}
