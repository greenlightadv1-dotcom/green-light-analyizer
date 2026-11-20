"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { mutedFromEnabled, notificationHref } from "@/lib/notifications/rules";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

/**
 * Notification writes (migration 0027). Signed-in users can only read their
 * own rows, so marking read and saving preferences run on the service role,
 * and every statement is scoped to the session's own profile id; nothing
 * about the owner or a target URL comes from the form.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Open one notification: mark it read, then go to the page it is about. */
export async function openNotification(fd: FormData): Promise<void> {
  const profile = await requireRole("creator", "company");
  const id = String(fd.get("notification_id") ?? "");
  if (!UUID.test(id)) redirect("/notifications");
  const { data, error } = await createAdminClient()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", profile.id)
    .select("collaboration_id, brief_id, chat_id")
    .maybeSingle();
  if (error) log.error("notifications.open_failed", { error });
  revalidatePath("/notifications");
  redirect(data ? notificationHref(data, profile.role) : "/notifications");
}

export async function markAllNotificationsRead(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("creator", "company");
  const { error } = await createAdminClient()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", profile.id)
    .is("read_at", null);
  if (error) {
    log.error("notifications.mark_all_failed", { error });
    return fail("ui.errors.generic");
  }
  revalidatePath("/notifications");
  return OK;
}

/** The form lists the categories to receive; everything else is muted. */
export async function saveNotificationPreferences(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireRole("creator", "company");
  const muted = mutedFromEnabled(fd.getAll("enabled"));
  const { error } = await createAdminClient()
    .from("notification_preferences")
    .upsert({ profile_id: profile.id, muted_categories: muted, updated_at: new Date().toISOString() });
  if (error) {
    log.error("notifications.preferences_failed", { error });
    return fail("ui.errors.generic");
  }
  revalidatePath("/notifications");
  return OK;
}
