import type { AppNotification, NotificationCategory, Role } from "../types/database.ts";

/**
 * Pure rules for in-app notifications (migration 0027): which page a
 * notification opens, and which preference values are valid. The target is
 * computed from the stored row's ids and the viewer's role, never from a URL
 * a client supplied, so opening a notification cannot become an open
 * redirect.
 */

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ["invitations", "terms", "deliverables", "status", "messages"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function notificationHref(
  n: Pick<AppNotification, "collaboration_id" | "brief_id"> & { chat_id?: string | null },
  role: Role,
): string {
  if (n.chat_id && UUID.test(n.chat_id)) return `/inbox/${n.chat_id}`;
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

/** The nav links that carry a notification dot (nav.ts hrefs). */
export type BadgeHref =
  | "/inbox"
  | "/opportunities"
  | "/briefs"
  | "/collaborations"
  | "/admin/requests"
  | "/admin/verification"
  | "/admin/violations";
export type NavBadges = Partial<Record<BadgeHref, number>>;

/**
 * Unread notifications → the nav link each one belongs to. Messages are the
 * deal inbox; invitations are a creator's opportunities and a company's
 * briefs; terms, deliverables and status are the collaboration. A category
 * this does not know gives no dot rather than a dot in the wrong place.
 */
export function navBadgesFromUnread(rows: { category: string }[], role: Role): NavBadges {
  const out: NavBadges = {};
  const add = (href: BadgeHref) => {
    out[href] = (out[href] ?? 0) + 1;
  };
  for (const { category } of rows) {
    if (category === "messages") add("/inbox");
    else if (category === "invitations") add(role === "company" ? "/briefs" : "/opportunities");
    else if (category === "terms" || category === "deliverables" || category === "status") add("/collaborations");
  }
  return out;
}

/** The rooms with an unread message, from unread notifications. */
export function unreadChatIds(rows: { kind: string; chat_id?: string | null }[]): Set<string> {
  const ids = new Set<string>();
  for (const r of rows) if (r.kind === "message_received" && r.chat_id && UUID.test(r.chat_id)) ids.add(r.chat_id);
  return ids;
}
