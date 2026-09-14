"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "@/components/LocaleProvider";

const noopSubscribe = () => () => {};

/**
 * True only once React has hydrated on the client. useSyncExternalStore (not
 * useEffect+setState, which forces an extra render) is the primitive React
 * itself recommends for "this value is only knowable client-side" — the
 * server snapshot is always false, so SSR and the first client render agree.
 */
function useIsMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function SunIcon({ className = "h-4 w-4" }: { className?: string }) {
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
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </svg>
  );
}

function MoonIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.6 15.3a8.4 8.4 0 1 1-9.9-11.9 1 1 0 0 1 1.2 1.3 6.6 6.6 0 0 0 8.4 8.4 1 1 0 0 1 1.3 1.2 8.4 8.4 0 0 1-1 1Z" />
    </svg>
  );
}

function MonitorIcon({ className = "h-4 w-4" }: { className?: string }) {
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
      <rect x="3" y="4.5" width="18" height="12" rx="1.8" />
      <path d="M8.5 20h7M12 16.5V20" />
    </svg>
  );
}

const OPTIONS = [
  { value: "light", key: "theme.light", Icon: SunIcon },
  { value: "dark", key: "theme.dark", Icon: MoonIcon },
  { value: "system", key: "theme.system", Icon: MonitorIcon },
] as const;

/**
 * Theme dropdown (Light / Dark / System) — replaces the landing page's old
 * two-state toggle now that the whole app themes, not just that one page.
 * `theme` (not `resolvedTheme`) drives which option is checked, since only
 * `theme` can actually be "system"; the trigger button's own icon uses
 * `resolvedTheme` so it always shows what's actually on screen.
 */
export function ThemeMenu() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
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

  const TriggerIcon = resolvedTheme === "dark" ? MoonIcon : SunIcon;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("theme.changeTheme")}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-fg/15 bg-fg/5 text-fg transition hover:bg-fg/10"
      >
        <TriggerIcon />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t("theme.changeTheme")}
          className="glass-panel-solid absolute top-full end-0 z-50 mt-2 w-36 space-y-0.5 p-1.5"
        >
          {OPTIONS.map(({ value, key, Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm transition ${
                  active
                    ? "bg-brand-green/12 font-medium text-brand-green"
                    : "text-fg/70 hover:bg-fg/5 hover:text-fg"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t(key)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
