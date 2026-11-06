"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { createClient } from "@/lib/supabase/client";
import { badgeText } from "@/lib/notifications/rules";

/**
 * The top-bar bell. The unread count is read with the browser's own session,
 * so RLS returns only this person's notifications; it refreshes on every
 * navigation and when the tab becomes visible again. A failed read shows no
 * badge rather than a wrong number. The UI preview passes `demoCount`, and
 * nothing is queried there.
 */
export function NotificationBell({ basePath = "", demoCount }: { basePath?: string; demoCount?: number }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [unread, setUnread] = useState<number>(demoCount ?? 0);

  useEffect(() => {
    if (demoCount !== undefined) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { count, error } = await createClient()
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null);
        if (!cancelled) setUnread(error ? 0 : count ?? 0);
      } catch {
        if (!cancelled) setUnread(0);
      }
    };
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, demoCount]);

  const badge = badgeText(unread);
  return (
    <Link
      href={`${basePath}/notifications`}
      aria-label={badge ? t("notifications.bellUnread", { count: unread }) : t("notifications.bell")}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-muted text-fg transition hover:bg-surface-hover focus-visible:focus-ring"
    >
      <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {badge ? (
        <span aria-hidden className="absolute -end-1 -top-1 min-w-4 rounded-full bg-brand-green px-1 text-center text-[10px] leading-4 font-semibold text-ink">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
