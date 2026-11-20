import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AppNotification, NotificationCategory } from "@/lib/types/database";

/** Reads with the caller's own client: RLS returns only their own rows. */

export async function listNotifications(limit = 50): Promise<AppNotification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function mutedCategories(profileId: string): Promise<NotificationCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("muted_categories")
    .eq("profile_id", profileId)
    .maybeSingle();
  return data?.muted_categories ?? [];
}
