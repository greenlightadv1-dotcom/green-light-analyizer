import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { GlowOrbs } from "@/components/ui/GlowOrbs";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LocaleProvider } from "@/components/LocaleProvider";
import "./globals.css";

/**
 * Typography (§2.4): a clean geometric/grotesk sans. Inter is the working
 * choice — see the open question in §13 (Inter vs. Manrope) still to be
 * confirmed with the client. Swapping it is a one-line change here.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0D14" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      {/* No bg-/text- utility classes here on purpose: globals.css's `body`
          selector owns background + color now (theme-reactive), and a
          class utility here would out-specificity it in light mode. */}
      <body className="min-h-screen antialiased">
        <LocaleProvider>
          <ThemeProvider>
            <GlowOrbs />
            {children}
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
