"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

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

/**
 * Light/dark switch for the landing page (defaults to system preference via
 * ThemeProvider). Rendered only once mounted client-side — next-themes can't
 * know the resolved theme during SSR, and guessing would flash the wrong icon.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsMounted();

  if (!mounted) {
    return <div className="h-9 w-9 shrink-0" aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-navy/15 bg-navy/5 text-ink transition hover:bg-navy/10 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
    >
      {isDark ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4.5 w-4.5"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4.5 w-4.5"
          aria-hidden
        >
          <path d="M20.6 15.3a8.4 8.4 0 1 1-9.9-11.9 1 1 0 0 1 1.2 1.3 6.6 6.6 0 0 0 8.4 8.4 1 1 0 0 1 1.3 1.2 8.4 8.4 0 0 1-1 1Z" />
        </svg>
      )}
    </button>
  );
}
