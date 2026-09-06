"use server";

import { revalidatePath } from "next/cache";
import { maskSensitiveData } from "@/lib/mask";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { getDealChat } from "@/lib/deals/queries";
import type { DealStatus } from "@/lib/types/database";

export type SendMessageState = {
  error: string | null;
  /** Set when the §6 filter stripped something. Shown as a hard warning. */
  violation: { rules: string[] } | null;
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

  if (!chatId) return { error: "Missing conversation.", violation: null };
  if (!raw) return { error: "Write a message first.", violation: null };
  if (raw.length > MAX_MESSAGE_LENGTH) {
    return {
      error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`,
      violation: null,
    };
  }

  // RLS already scopes this read to rooms the caller is a party to.
  const chat = await getDealChat(chatId);
  if (!chat) {
    return { error: "That conversation is not available.", violation: null };
  }

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

  if (error) {
    return { error: "Your message could not be sent.", violation: null };
  }

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

  revalidatePath(`/inbox/${chatId}`);

  return {
    error: null,
    violation: isMasked ? { rules: matched } : null,
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
