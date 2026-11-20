import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LocaleProvider } from "@/components/LocaleProvider";
import "./globals.css";

/**
 * Typography (2026-11 redesign): Manrope, a geometric sans, for Latin text,
 * and IBM Plex Sans Arabic for Arabic. Both are free Google fonts, served
 * self-hosted by next/font. --font-sans (globals.css) lists Manrope first, so
 * Latin glyphs come from it and Arabic falls through to Plex.
 */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Green Light",
    template: "%s · Green Light",
  },
  description: "Your Personal Business Manager.",
  icons: {
    icon: "/branding/icon_color.png",
    apple: "/branding/icon_color.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F3EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0B110E" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${arabic.variable}`} suppressHydrationWarning>
      {/* No bg-/text- utility classes here on purpose: globals.css's `body`
          selector owns background + color now (theme-reactive), and a
          class utility here would out-specificity it in light mode. */}
      <body className="min-h-screen antialiased">
        <LocaleProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
