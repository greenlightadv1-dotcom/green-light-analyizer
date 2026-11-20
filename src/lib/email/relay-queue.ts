import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { relayMessageToCompany, relaySubject } from "./outbound";
import { runRelay, type RelayOutcome } from "./relay-lifecycle";

/**
 * One relay attempt for one message, against the real database and Resend
 * (lib/email/relay-lifecycle.ts sequences it). The message body is read from
 * the stored, already-masked row; it is never logged.
 */
export async function processRelay(messageId: string): Promise<RelayOutcome> {
  const service = createAdminClient();
  return runRelay(
    {
      async claim(id) {
        const { data, error } = await service.rpc("relay_claim", { p_message: id });
        if (error) log.error("relay.claim_failed", { message_id: id, code: error.code });
        return data === true;
      },
      async send(id, idempotencyKey) {
        const { data: msg } = await service.from("messages").select("chat_id, message_text").eq("id", id).maybeSingle();
        if (!msg?.chat_id) return { ok: false, error: "message not found", status: 404 };
        const { data: chat } = await service.from("deal_chats").select("id, creator_id, company_id, sender_email").eq("id", msg.chat_id).maybeSingle();
        // Only email rooms relay; an in-app room's company reads the thread here.
        if (!chat || chat.company_id || !chat.creator_id) return { ok: false, error: "not an email room", status: 400 };
        const { data: creator } = await service.from("profiles").select("full_name, inbound_alias").eq("id", chat.creator_id).maybeSingle();
        return relayMessageToCompany({
          to: chat.sender_email,
          subject: relaySubject(chat.id),
          body: msg.message_text,
          creatorDisplayName: creator?.full_name ?? "Green Light creator",
          creatorAlias: creator?.inbound_alias ?? null,
          idempotencyKey,
        });
      },
      async record(id, r) {
        const { data, error } = await service.rpc("relay_record", {
          p_message: id, p_ok: r.ok, p_provider_id: r.providerId, p_error: r.error, p_permanent: r.permanent,
        });
        if (error) {
          // The provider may have accepted it; the idempotency key keeps a retry from sending twice.
          log.error("relay.outcome_not_recorded", { message_id: id, relayed: r.ok, code: error.code });
          return null;
        }
        if (!r.ok) log.error("relay.failed", { message_id: id, permanent: r.permanent, reason: r.error });
        return data as string;
      },
    },
    messageId,
  );
}

/** Retry relays that are due (cron or admin). Bounded in count and time. */
export async function processDueRelays({ limit = 25, budgetMs = 40_000 } = {}): Promise<Record<RelayOutcome, number>> {
  const started = Date.now();
  const service = createAdminClient();
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data } = await service
    .from("messages")
    .select("id")
    .or(`and(relay_status.in.(queued,failed_retryable),or(relay_next_attempt_at.is.null,relay_next_attempt_at.lte.${now})),and(relay_status.eq.processing,relay_claimed_at.lt.${stale})`)
    .lt("relay_attempts", 5)
    .order("created_at")
    .limit(limit);
  const counts: Record<RelayOutcome, number> = { sent: 0, failed_retryable: 0, failed_permanent: 0, skipped: 0, unrecorded: 0 };
  for (const row of data ?? []) {
    if (Date.now() - started > budgetMs) break;
    counts[await processRelay(row.id)]++;
  }
  return counts;
}
