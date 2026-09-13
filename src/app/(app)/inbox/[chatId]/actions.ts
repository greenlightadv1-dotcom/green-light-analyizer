"use server";

import { revalidatePath } from "next/cache";
import { maskSensitiveData } from "@/lib/mask";
import { relayMessageToCompany, relaySubject } from "@/lib/email/outbound";
import { generateReplyDraft } from "@/lib/ai/reply-draft";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { getDealChat, latestIncomingMessage } from "@/lib/deals/queries";
import type { DealStatus } from "@/lib/types/database";

export type SendMessageState = {
  error: string | null;
  /** Set when the §6 filter stripped something. Shown as a hard warning. */
  violation: { rules: string[] } | null;
  /**
   * Set when the message was stored but could not be emailed to the company.
   * Surfaced rather than swallowed: a creator who believes they replied, to a
   * company that never heard from them, is how a deal dies unexplained.
   */
  relayFailed: boolean;
};

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Send a message into a Deal Chat Room — CLAUDE.md §6.
 *
 * The order of operations here is the whole point of the feature:
 *
 *   1. Confirm the caller is a party to the room (RLS would refuse anyway;
 *      this is the readable check and gives a real error message).
 *   2. Run the §6.1 mask SERVER-SIDE, before anything is persisted, so raw
 *      contact details never touch the database or a company's client.
 *   3. Persist only the masked text.
 *   4. If the filter fired, record it in violation_logs for admin review with
 *      the rules that matched and the REDACTED excerpt (§6).
 *
 * Writes go through the service role because the RLS column grants withhold
 * `is_masked` from `authenticated` on purpose: whether a message was masked is
 * the server's finding about the sender, not something the sender may assert.
 */
export async function sendMessage(
  _prev: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const profile = await requireProfile();

  const chatId = String(formData.get("chat_id") ?? "");
  const raw = String(formData.get("message_text") ?? "").trim();

  const fail = (error: string): SendMessageState => ({
    error,
    violation: null,
    relayFailed: false,
  });

  if (!chatId) return fail("Missing conversation.");
  if (!raw) return fail("Write a message first.");
  if (raw.length > MAX_MESSAGE_LENGTH) {
    return fail(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
  }

  // RLS already scopes this read to rooms the caller is a party to.
  const chat = await getDealChat(chatId);
  if (!chat) return fail("That conversation is not available.");

  const { maskedText, isMasked, matched } = maskSensitiveData(raw);

  const admin = createAdminClient();

  const { data: inserted, error } = await admin
    .from("messages")
    .insert({
      chat_id: chatId,
      sender_id: profile.id,
      message_text: maskedText, // never `raw` — §6, §12
      is_masked: isMasked,
    })
    .select("id")
    .single();

  if (error) return fail("Your message could not be sent.");

  if (isMasked) {
    // §6: log which rule matched, redacted, for admin review — in addition to
    // blocking it in real time. A failure to log must not silently pass: the
    // message is already masked and stored, so surface it rather than swallow.
    const { error: logError } = await admin.from("violation_logs").insert({
      profile_id: profile.id,
      chat_id: chatId,
      message_id: inserted.id,
      matched_rules: matched,
      redacted_excerpt: maskedText.slice(0, 500),
    });

    if (logError) {
      console.error("violation_logs insert failed", logError.message);
    }
  }

  // §6: relay the reply to the company as platform email — but only when
  // there is actually an external inbox to relay to. The email relay exists
  // for a sponsor who is not a Green Light account: a company_id on the room
  // means the other party is signed in and already reading this thread here,
  // so emailing them a copy of their own conversation would be redundant at
  // best (and, for a message the company itself just sent, would mean
  // emailing them their own words back). Company-side access (§3) made that
  // case real; before it, every room's company_id was always null, and this
  // branch always ran — this is a change in *when* it fires, not the relay
  // logic itself.
  const shouldRelay = chat.creator_id === profile.id && !chat.company_id;

  let relayFailed = false;
  if (shouldRelay) {
    const relay = await relayMessageToCompany({
      to: chat.sender_email,
      subject: relaySubject(chatId),
      body: maskedText,
      creatorDisplayName: profile.full_name,
      // The reply path back into the platform. Never profile.primary_email.
      creatorAlias: profile.inbound_alias,
    });

    await admin
      .from("messages")
      .update(
        relay.ok
          ? { relayed_at: new Date().toISOString(), relay_error: null }
          : { relay_error: relay.error.slice(0, 500) },
      )
      .eq("id", inserted.id);

    if (!relay.ok) {
      console.error(`relay failed for message ${inserted.id}: ${relay.error}`);
      relayFailed = true;
    }
  }

  revalidatePath(`/inbox/${chatId}`);

  return {
    error: null,
    violation: isMasked ? { rules: matched } : null,
    relayFailed,
  };
}

const NEGOTIABLE: DealStatus[] = ["new", "negotiating", "agreed", "disputed"];

/**
 * Move a deal along. 'paid' is deliberately absent from NEGOTIABLE: §12 puts
 * settlement behind manual escrow reconciliation, and the RLS UPDATE policy
 * enforces the same rule at the database, so this list is the friendly half of
 * a guarantee that does not depend on it.
 */
export async function updateDealStatus(formData: FormData): Promise<void> {
  await requireProfile();

  const chatId = String(formData.get("chat_id") ?? "");
  const status = String(formData.get("deal_status") ?? "") as DealStatus;

  if (!chatId || !NEGOTIABLE.includes(status)) return;

  const chat = await getDealChat(chatId);
  if (!chat) return;

  const admin = createAdminClient();
  await admin.from("deal_chats").update({ deal_status: status }).eq("id", chatId);

  revalidatePath(`/inbox/${chatId}`);
  revalidatePath("/inbox");
}

export type ReplyDraftState = { error: string | null; draft: string | null };

/**
 * The negotiation workspace's "AI copyable response generator" — drafts a
 * reply from the thread's own most recent message, for the creator to copy
 * into the composer or edit first. Nothing here is persisted; a draft the
 * creator doesn't send leaves no trace.
 */
export async function generateReply(
  _prev: ReplyDraftState,
  formData: FormData,
): Promise<ReplyDraftState> {
  const profile = await requireProfile();
  const chatId = String(formData.get("chat_id") ?? "");
  if (!chatId) return { error: "Missing conversation.", draft: null };

  // RLS already scopes this read to rooms the caller is a party to.
  const chat = await getDealChat(chatId);
  if (!chat) return { error: "That conversation is not available.", draft: null };

  // Regenerating a draft a few times per deal is normal use; a held key is not.
  const limit = await consumeRateLimit("ai_reply_draft", profile.id);
  if (!limit.allowed) return { error: limit.message, draft: null };

  // The message being replied TO is the other side's most recent one — not
  // simply the last row in the thread, which is usually the caller's own
  // message once they have written anything. Drafting a reply to yourself
  // produced confident nonsense.
  const incoming = await latestIncomingMessage(chatId, profile.id);

  const result = await generateReplyDraft({
    creatorName: profile.full_name,
    latestMessage: incoming?.message_text ?? "",
    recommendedPriceUsd: chat.recommended_price_usd,
    offeredAmountUsd: chat.offered_amount,
    risk: chat.ai_evaluation,
    dealStatus: chat.deal_status ?? "new",
  });

  if (!result.ok) return { error: result.error, draft: null };
  return { error: null, draft: result.draft };
}
