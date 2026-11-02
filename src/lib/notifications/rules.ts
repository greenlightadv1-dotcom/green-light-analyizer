import type { AppNotification, NotificationCategory, Role } from "../types/database.ts";

/**
 * Pure rules for in-app notifications (migration 0027): which page a
 * notification opens, and which preference values are valid. The target is
 * computed from the stored row's ids and the viewer's role, never from a URL
 * a client supplied, so opening a notification cannot become an open
 * redirect.
 */

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ["invitations", "terms", "deliverables", "status"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function notificationHref(
  n: Pick<AppNotification, "collaboration_id" | "brief_id">,
  role: Role,
): string {
  if (n.collaboration_id && UUID.test(n.collaboration_id)) return `/collaborations/${n.collaboration_id}`;
  if (role === "company" && n.brief_id && UUID.test(n.brief_id)) return `/briefs/${n.brief_id}`;
  if (role === "creator") return "/opportunities";
  return "/notifications";
}

/** The muted set from a form: only known categories, each once. */
export function parseMuted(values: unknown[]): NotificationCategory[] {
  const set = new Set(values.map(String));
  return NOTIFICATION_CATEGORIES.filter((c) => set.has(c));
}

/** The muted set from the form's "enabled" checkboxes: every category not ticked. */
export function mutedFromEnabled(enabled: unknown[]): NotificationCategory[] {
  const on = new Set(parseMuted(enabled));
  return NOTIFICATION_CATEGORIES.filter((c) => !on.has(c));
}

/** "9+" past nine, so the bell badge stays one character wide. */
export function badgeText(unread: number): string {
  if (!Number.isFinite(unread) || unread <= 0) return "";
  return unread > 9 ? "9+" : String(Math.floor(unread));
}
