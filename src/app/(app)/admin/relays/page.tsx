import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { utcStamp } from "@/lib/ui/format";
import { retryRelay, runDueRelays } from "./actions";

export const metadata: Metadata = { title: "Email relays" };
export const dynamic = "force-dynamic";

const btn = "h-8 rounded-chip border border-line bg-surface-muted px-3 text-xs text-fg";

/**
 * Admin-only view of creator replies relayed to sponsors by email (0036).
 * Shows ids, states, attempts and the provider's error code, never the
 * message text or any address.
 */
export default async function AdminRelaysPage() {
  await requireRole("admin");
  const service = createAdminClient();
  const { data: rows, error } = await service
    .from("messages")
    .select("id, chat_id, relay_status, relay_attempts, relay_next_attempt_at, relay_error, relay_provider_id, relayed_at, created_at")
    .not("relay_status", "is", null)
    .neq("relay_status", "sent")
    .order("created_at", { ascending: false })
    .limit(100);
  const { count: sent } = await service.from("messages").select("id", { count: "exact", head: true }).eq("relay_status", "sent");
  // Only the status code part of an error: provider messages may quote addresses.
  const code = (e: string | null) => (e ? (/Resend returned (\d{3})/.exec(e)?.[1] ? `HTTP ${/Resend returned (\d{3})/.exec(e)![1]}` : /not configured/.test(e) ? "RESEND_API_KEY not configured" : "network or timeout") : "—");
  return (
    <>
      <SectionHeader
        title="Email relays"
        description="Creator replies in email rooms are relayed to the sponsor as platform email. Sent means the provider accepted the email; it does not prove the sponsor read it. In-app notifications are separate and are not email delivery."
      />
      {error ? (
        <GlassPanel className="mb-4 p-5 text-sm text-fg-muted">The relay lifecycle is not on this database yet. Ask the developer to apply the latest database update.</GlassPanel>
      ) : (
        <GlassPanel className="mb-4 flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
          <span className="text-fg">Accepted by the provider: {sent ?? 0} · Not yet sent or failed: {rows?.length ?? 0}</span>
          <ConfirmActionForm action={runDueRelays} hidden={{}} trigger={{ labelKey: "adminRelays.runDue" }} triggerClassName={btn} titleKey="adminRelays.runDueTitle" bodyKey="adminRelays.runDueBody" confirmKey="adminVerification.confirm" successKey="adminVerification.done" />
        </GlassPanel>
      )}
      <GlassPanel className="overflow-hidden">
        <ul className="divide-y divide-line text-sm">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span className="min-w-0">
                <span className="font-medium text-fg">{r.relay_status?.replace(/_/g, " ")}</span>
                <span className="text-xs text-fg-muted"> · attempts {r.relay_attempts ?? 0} · {code(r.relay_error)} · {utcStamp(r.created_at)}{r.relay_next_attempt_at ? ` · next ${utcStamp(r.relay_next_attempt_at)}` : ""}</span>
                <span className="block text-[11px] text-fg-muted" dir="ltr">message {r.id} · room {r.chat_id}</span>
              </span>
              {r.relay_status === "failed_permanent" || r.relay_status === "failed_retryable" ? (
                <ConfirmActionForm action={retryRelay} hidden={{ message_id: r.id }} trigger={{ labelKey: "adminRelays.retry" }} triggerClassName={btn} titleKey="adminRelays.retryTitle" bodyKey="adminRelays.retryBody" confirmKey="adminVerification.confirm" successKey="adminRelays.sent" />
              ) : null}
            </li>
          ))}
          {!rows?.length ? <li className="px-5 py-4 text-fg-muted">No pending or failed relays.</li> : null}
        </ul>
      </GlassPanel>
    </>
  );
}
