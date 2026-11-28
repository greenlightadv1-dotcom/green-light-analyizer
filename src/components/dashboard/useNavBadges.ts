"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import type { NavBadges } from "@/lib/notifications/rules";

/**
 * One shared copy of the nav dots for the Sidebar, the mobile drawer and the
 * tab bar: fetched from /api/nav-badges on each navigation and when the tab
 * comes back into view, at most once per second however many components ask.
 * A failed read keeps no dots rather than stale ones. The UI preview
 * (basePath "/preview") never fetches.
 */
let badges: NavBadges = {};
let lastFetch = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const EMPTY: NavBadges = {};

function emit() {
  for (const l of listeners) l();
}

export function refreshNavBadges(force = false): Promise<void> {
  if (!force && (inFlight || Date.now() - lastFetch < 1000)) return inFlight ?? Promise.resolve();
  lastFetch = Date.now();
  inFlight = fetch("/api/nav-badges", { cache: "no-store", credentials: "same-origin" })
    .then(async (r) => {
      const body = r.ok && r.headers.get("content-type")?.includes("application/json") ? await r.json() : null;
      badges = body && typeof body.badges === "object" && body.badges ? (body.badges as NavBadges) : {};
    })
    .catch(() => {
      badges = {};
    })
    .finally(() => {
      inFlight = null;
      emit();
    });
  return inFlight;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useNavBadges(basePath = ""): NavBadges {
  const pathname = usePathname();
  const demo = basePath.startsWith("/preview");
  useEffect(() => {
    if (demo) return;
    void refreshNavBadges();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshNavBadges();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pathname, demo]);
  const current = useSyncExternalStore(subscribe, () => badges, () => EMPTY);
  return demo ? EMPTY : current;
}
