"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueRelays, processRelay } from "@/lib/email/relay-queue";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Requeue one failed relay (after its cause is fixed) and try it now. Admin only. */
export async function retryRelay(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireRole("admin");
  const id = String(fd.get("message_id") ?? "");
  if (!UUID.test(id)) return fail("ui.errors.invalid");
  const { data: requeued } = await createAdminClient().rpc("relay_requeue", { p_message: id });
  if (!requeued) return fail("adminRelays.notRetryable");
  const outcome = await processRelay(id);
  revalidatePath("/admin/relays");
  return outcome === "sent" ? OK : fail("adminRelays.stillFailing");
}

/** Run the due retries now (what the unscheduled cron would do). Admin only. */
export async function runDueRelays(_prev: ActionResult | null): Promise<ActionResult> {
  await requireRole("admin");
  await processDueRelays({ limit: 25 });
  revalidatePath("/admin/relays");
  return OK;
}
