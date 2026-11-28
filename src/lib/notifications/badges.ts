import "server-only";

import type { Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { navBadgesFromUnread, unreadChatIds, type NavBadges } from "./rules";

/** Enough to light every dot; nobody needs an exact count past this. */
const UNREAD_CAP = 200;

/**
 * The nav dots for one signed-in person. Creators and companies: their own
 * unread notifications, read with their own session so RLS returns only
 * their rows. Admins: pending work (applications, cases awaiting a decision
 * for reviewers only, unreviewed violations), counted with the service role
 * after the role was checked here. A failed read lights nothing.
 */
export async function loadNavBadges(profile: Profile): Promise<NavBadges> {
  if (profile.role === "admin") return adminBadges(profile.id);
  const { data, error } = await (await createClient())
    .from("notifications")
    .select("category")
    .is("read_at", null)
    .limit(UNREAD_CAP);
  if (error) {
    log.warn("nav_badges.read_failed", { error });
    return {};
  }
  return navBadgesFromUnread(data ?? [], profile.role);
}

async function adminBadges(adminId: string): Promise<NavBadges> {
  const admin = createAdminClient();
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await q;
    if (error) log.warn("nav_badges.admin_count_failed", { error });
    return error ? 0 : n ?? 0;
  };
  const { data: reviewer } = await admin
    .from("verification_reviewers")
    .select("admin_id")
    .eq("admin_id", adminId)
    .maybeSingle();
  const [requests, cases, violations] = await Promise.all([
    count(admin.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    reviewer
      ? count(admin.from("verification_cases").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]))
      : Promise.resolve(0),
    count(admin.from("violation_logs").select("id", { count: "exact", head: true }).is("reviewed_at", null)),
  ]);
  const out: NavBadges = {};
  if (requests) out["/admin/requests"] = requests;
  if (cases) out["/admin/verification"] = cases;
  if (violations) out["/admin/violations"] = violations;
  return out;
}

/** Rooms with an unread message, for the inbox list's dots. */
export async function loadUnreadChatIds(): Promise<Set<string>> {
  const { data, error } = await (await createClient())
    .from("notifications")
    .select("kind, chat_id")
    .eq("kind", "message_received")
    .is("read_at", null)
    .limit(UNREAD_CAP);
  if (error) {
    log.warn("nav_badges.unread_rooms_failed", { error });
    return new Set();
  }
  return unreadChatIds(data ?? []);
}

/**
 * Opening a room reads it: its unread message notification is marked read.
 * Service role (recipients may not update notifications), scoped to the
 * session's own id and this room only.
 */
export async function markChatRead(profileId: string, chatId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", profileId)
    .eq("chat_id", chatId)
    .is("read_at", null);
  if (error) log.warn("notifications.mark_chat_read_failed", { chat_id: chatId, error });
}
