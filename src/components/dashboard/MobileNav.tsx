"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { useTranslation } from "@/components/LocaleProvider";
import type { Role } from "@/lib/types/database";
import { emitG } from "@/components/g/events";
import { NavLinks } from "./NavLinks";
import { MOBILE_TABS, isActivePath } from "./nav";
import Link from "next/link";

const ICONS: Record<string, string> = {
  "/dashboard": "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  "/inbox": "M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 13h5l1 3h6l1-3h5",
  "/collaborations": "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15.5c3 0 8 1.5 8 4.5",
  "/discover": "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  "/briefs": "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  "/admin/users": "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  "/admin/verification": "M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5",
  more: "M4 7h16M4 12h16M4 17h16",
};

function TabIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
      <path d={ICONS[name] ?? ICONS.more} />
    </svg>
  );
}

function TabLink({ href, label, active, icon }: { href: string; label: string; active: boolean; icon: string }) {
  return (
    <li className="flex justify-center">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] focus-visible:focus-ring ${
          active ? "font-semibold text-fg" : "font-medium text-fg-muted hover:text-fg"
        }`}
      >
        <span className={`flex h-8 w-12 items-center justify-center rounded-full ${active ? "bg-lime-soft text-accent" : ""}`}>
          <TabIcon name={icon} />
        </span>
        {label}
      </Link>
    </li>
  );
}

/** True once on the client — the drawer is portalled to document.body. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Mobile navigation (below `lg`, where the Sidebar is hidden): a bottom tab bar
 * with the role's main destinations, G, and "More", which opens a drawer with
 * the Sidebar's own links (NavLinks).
 *
 * The drawer is portalled to <body>: the TopBar is a glass panel, and its
 * backdrop-filter would otherwise make `position: fixed` resolve against the
 * bar instead of the viewport.
 *
 * Closes on a link, the close button, the backdrop, Escape, or a route change.
 * The route-change case needs no effect: the drawer records the path it was
 * opened on and counts as open only while that is still the current path.
 * While open it locks page scroll, keeps Tab inside the panel, and returns
 * focus to the menu button when it closes.
 */
export function MobileNav({ role, basePath = "" }: { role: Role; basePath?: string }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const isClient = useIsClient();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn !== null && openedOn === pathname;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const panelId = useId();

  const close = () => setOpenedOn(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpenedOn(null);
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      {/* Phone tab bar: the role's three main destinations, G, and More (the
          full list). Hidden from lg up, where the Sidebar shows everything. */}
      <nav
        aria-label={t("topbar.navigation")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        data-testid="mobile-tabbar"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_TABS[role].slice(0, 2).map((tab) => (
            <TabLink key={tab.href} href={`${basePath}${tab.href}`} label={t(tab.labelKey)} active={isActivePath(pathname, `${basePath}${tab.href}`)} icon={tab.href} />
          ))}
          <li className="flex justify-center">
            <button
              type="button"
              onClick={() => emitG({ type: "open" })}
              className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-fg focus-visible:focus-ring"
            >
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-green text-sm font-extrabold text-ink">G</span>
              {t("nav.tabG")}
            </button>
          </li>
          {MOBILE_TABS[role].slice(2).map((tab) => (
            <TabLink key={tab.href} href={`${basePath}${tab.href}`} label={t(tab.labelKey)} active={isActivePath(pathname, `${basePath}${tab.href}`)} icon={tab.href} />
          ))}
          <li className="flex justify-center">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpenedOn(pathname)}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? panelId : undefined}
              className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-fg-muted focus-visible:focus-ring"
            >
              <TabIcon name="more" />
              {t("nav.tabMore")}
            </button>
          </li>
        </ul>
      </nav>

      {open && isClient
        ? createPortal(
            <div className="fixed inset-0 z-[60] lg:hidden" data-testid="mobile-nav">
              <div
                className="absolute inset-0 bg-black/45"
                onClick={close}
                aria-hidden
                data-testid="mobile-nav-backdrop"
              />
              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                // Opaque, unlike the translucent glass panels: page text bleeding
                // through behind the links made them hard to read.
                className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-e border-fg/10 bg-surface p-4 shadow-2xl"
              >
                <div className="mb-5 flex items-center justify-between gap-3 px-1 pt-1">
                  <h2 id={titleId} className="sr-only">
                    {t("topbar.navigation")}
                  </h2>
                  <ThemedLogo size={30} />
                  <button
                    type="button"
                    onClick={close}
                    aria-label={t("topbar.closeMenu")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-fg transition-colors hover:bg-surface-hover focus-visible:focus-ring"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
                <NavLinks role={role} basePath={basePath} onNavigate={close} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
