"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Wraps next-themes so the public landing page can switch light/dark
 * (defaulting to the visitor's system preference, per CLAUDE.md's UI-overhaul
 * decision) via class="dark"/"light" on <html> — see the @custom-variant in
 * globals.css. The authenticated app shell doesn't read this class at all
 * (its components are hardcoded to the dark palette), so this has no visible
 * effect there.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
