"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE, dirFor, isLocaleCode, type LocaleCode } from "@/lib/i18n/locales";
import { dictionaries, type Dictionary } from "@/lib/i18n/dictionaries";

const STORAGE_KEY = "greenlight-locale";

/*
 * A minimal external store (module-level, not React state) rather than
 * useState+useEffect: reading localStorage inside an effect and pushing it
 * into state is exactly the "sync with an external system" case
 * useSyncExternalStore exists for, and avoids the extra post-mount render
 * an effect-based setState would cause. subscribe/getSnapshot/
 * getServerSnapshot below are that store's contract.
 */
let currentLocale: LocaleCode = DEFAULT_LOCALE;
let hydratedFromStorage = false;
const listeners = new Set<() => void>();

function ensureHydrated() {
  if (hydratedFromStorage) return;
  hydratedFromStorage = true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isLocaleCode(stored)) currentLocale = stored;
  } catch {
    // localStorage unavailable (private mode, blocked) — stay on default.
  }
}

function getSnapshot(): LocaleCode {
  ensureHydrated();
  return currentLocale;
}

function getServerSnapshot(): LocaleCode {
  return DEFAULT_LOCALE;
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function commitLocale(next: LocaleCode) {
  currentLocale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Best-effort persistence only.
  }
  document.documentElement.lang = next;
  document.documentElement.dir = dirFor(next);
  listeners.forEach((listener) => listener());
}

/**
 * Inline, render-blocking script (same no-flash technique next-themes uses
 * for its own class script) — sets dir/lang on <html> from localStorage
 * before the rest of the tree paints, so a returning Arabic visitor doesn't
 * see the page flash LTR-then-flip-RTL. Placed as a plain <script> child
 * rather than in next/script, since it must run synchronously and early,
 * not after hydration.
 */
function NoFlashScript() {
  const script = `(function(){try{var l=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});var d=document.documentElement;if(l==='ar'){d.lang='ar';d.dir='rtl';}else if(l){d.lang=l;d.dir='ltr';}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

type LocaleContextValue = { locale: LocaleCode; dict: Dictionary };
const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * i18n (custom, not a routing-based library like next-intl — this app's
 * proxy.ts already owns a fair amount of routing/guard logic, and layering
 * locale-prefixed routes on top risked real conflicts there for a feature
 * that doesn't need URLs like /ar/dashboard). Mirrors ThemeProvider's shape:
 * client-only state, persisted to localStorage, with the same "flash once
 * on mount if the stored preference isn't the default" trade-off — visible
 * text can't dual-render-and-CSS-swap the way the 2-variant logo does.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <LocaleContext.Provider value={{ locale, dict: dictionaries[locale] }}>
      <NoFlashScript />
      {children}
    </LocaleContext.Provider>
  );
}

/** `t("nav.dashboard")` — dotted-path lookup into the active locale's dictionary. */
export function useTranslation() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useTranslation must be used within LocaleProvider");

  const t = useCallback(
    (path: string): string => {
      const value = path
        .split(".")
        .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], ctx.dict);
      return typeof value === "string" ? value : path;
    },
    [ctx.dict],
  );

  return { t, locale: ctx.locale, setLocale: commitLocale };
}
