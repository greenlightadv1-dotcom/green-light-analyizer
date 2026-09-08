"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { LOCALES } from "@/lib/i18n/locales";

const noopSubscribe = () => () => {};

/** Same client-only-render guard as ThemeMenu — avoids a hydration mismatch on the active item. */
function useIsMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function GlobeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 3.6 5.6 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.6-3.6-9s1.2-6.5 3.6-9Z" />
    </svg>
  );
}

/**
 * Language dropdown — same glassmorphism/interaction pattern as ThemeMenu
 * (click to open, click-outside/Escape to close), Globe trigger instead of
 * a state-dependent icon. Uses logical `end-0`/`start-0` positioning rather
 * than `right-0`/`left-0` so the panel opens on the correct side once the
 * page is RTL (Arabic), not just visually mirrored by accident.
 */
export function LanguageMenu() {
  const { locale, setLocale, t } = useTranslation();
  const mounted = useIsMounted();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!mounted) {
    return <div className="h-9 w-9 shrink-0" aria-hidden />;
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("language.changeLanguage")}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-fg/15 bg-fg/5 text-fg transition hover:bg-fg/10"
      >
        <GlobeIcon />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t("language.label")}
          className="glass-panel-solid absolute top-full end-0 z-50 mt-2 w-40 space-y-0.5 p-1.5"
        >
          {LOCALES.map(({ code, nativeName }) => {
            const active = locale === code;
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                lang={code}
                dir={code === "ar" ? "rtl" : "ltr"}
                onClick={() => {
                  setLocale(code);
                  setOpen(false);
                }}
                className={`flex w-full items-center rounded-lg px-2.5 py-2 text-start text-sm transition ${
                  active
                    ? "bg-brand-green/12 font-medium text-brand-green"
                    : "text-fg/70 hover:bg-fg/5 hover:text-fg"
                }`}
              >
                {nativeName}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
