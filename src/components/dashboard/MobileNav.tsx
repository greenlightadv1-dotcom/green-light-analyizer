"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { useTranslation } from "@/components/LocaleProvider";
import type { Role } from "@/lib/types/database";
import { NavLinks } from "./NavLinks";

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
 * Mobile navigation (below `lg`, where the Sidebar is hidden): a menu button in
 * the TopBar that opens a drawer with the Sidebar's own links (NavLinks).
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
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpenedOn(pathname)}
        aria-label={t("topbar.openMenu")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-fg/15 bg-fg/5 text-fg transition hover:bg-fg/10 lg:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4.5 w-4.5" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open && isClient
        ? createPortal(
            <div className="fixed inset-0 z-[60] lg:hidden" data-testid="mobile-nav">
              <div
                className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
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
                className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-e border-fg/10 bg-white p-4 shadow-2xl dark:bg-navy-dark"
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
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-fg/15 bg-fg/5 text-fg transition hover:bg-fg/10"
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
