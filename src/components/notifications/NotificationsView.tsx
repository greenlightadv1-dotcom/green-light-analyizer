"use client";

import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { markAllNotificationsRead, openNotification, saveNotificationPreferences } from "@/app/(app)/notifications/actions";
import { day } from "@/lib/collab/display";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/rules";
import type { ActionResult } from "@/lib/ui/action-result";
import type { AppNotification, NotificationCategory } from "@/lib/types/database";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/collab/ui";

export function NotificationsView({
  notifications,
  names,
  briefTitles,
  muted,
  demo = false,
}: {
  notifications: AppNotification[];
  names: Record<string, string>;
  briefTitles: Record<string, string>;
  muted: NotificationCategory[];
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const [markState, markAll, marking] = useActionState<ActionResult | null, FormData>(markAllNotificationsRead, null);
  const [prefState, savePrefs, saving] = useActionState<ActionResult | null, FormData>(saveNotificationPreferences, null);
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <>
      <SectionHeader
        title={t("notifications.title")}
        description={t("notifications.description")}
        action={
          unread > 0 && !demo ? (
            <form action={markAll}>
              <button type="submit" disabled={marking} className={BTN_GHOST}>{t("notifications.markAllRead")}</button>
            </form>
          ) : null
        }
      />
      {markState ? (
        <p role={markState.ok ? "status" : "alert"} className={`mb-3 text-sm ${markState.ok ? "text-success" : "text-danger"}`}>
          {markState.ok ? t("notifications.markedAllRead") : t(markState.errorKey)}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {notifications.length === 0 ? (
            <EmptyState title={t("notifications.empty")} body={t("notifications.emptyBody")} />
          ) : (
            <GlassPanel className="overflow-hidden">
              <ul className="divide-y divide-line">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <form action={demo ? undefined : openNotification}>
                      <input type="hidden" name="notification_id" value={n.id} />
                      <button
                        type={demo ? "button" : "submit"}
                        className="flex w-full items-start gap-3 px-5 py-3.5 text-start hover:bg-surface-hover focus-visible:focus-ring"
                      >
                        <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-brand-green"}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${n.read_at ? "text-fg-secondary" : "font-semibold text-fg"}`}>
                            {t(`collab.events.${n.kind}`)}
                            {!n.read_at ? <span className="sr-only"> ({t("notifications.unread")})</span> : null}
                          </span>
                          <span dir="auto" className="block truncate text-xs text-fg-muted">
                            {n.brief_id && briefTitles[n.brief_id] ? briefTitles[n.brief_id] : ""}
                          </span>
                          <span className="block text-xs text-fg-muted">
                            {n.actor_id && names[n.actor_id] ? `${t("notifications.from", { name: names[n.actor_id] })} · ` : ""}
                            {day(n.created_at)}
                          </span>
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          )}
        </div>

        <GlassPanel className="h-fit space-y-3 p-5">
          <h2 className="text-sm font-semibold text-fg">{t("notifications.prefsTitle")}</h2>
          <p className="text-xs leading-relaxed text-fg-muted">{t("notifications.prefsBody")}</p>
          <form action={savePrefs} className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="sr-only">{t("notifications.prefsTitle")}</legend>
              {NOTIFICATION_CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-fg">
                  <input type="checkbox" name="enabled" value={c} defaultChecked={!muted.includes(c)} />
                  {t(`notifications.category.${c}`)}
                </label>
              ))}
            </fieldset>
            <button type="submit" disabled={saving || demo} className={BTN_PRIMARY}>
              {saving ? t("notifications.saving") : t("notifications.save")}
            </button>
            {prefState ? (
              <p role={prefState.ok ? "status" : "alert"} className={`text-sm ${prefState.ok ? "text-success" : "text-danger"}`}>
                {prefState.ok ? t("notifications.saved") : t(prefState.errorKey)}
              </p>
            ) : null}
          </form>
        </GlassPanel>
      </div>
    </>
  );
}
