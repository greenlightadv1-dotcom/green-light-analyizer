/**
 * The product's public origin, used anywhere a link has to work outside the
 * browser that generated it — a creator's shareable profile URL, robots.txt,
 * the sitemap.
 *
 * Falls back to the brand domain rather than throwing: an unconfigured preview
 * deployment should still render a plausible link rather than crash a page.
 * Set NEXT_PUBLIC_APP_URL in any environment where those links are real.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://greenlight.com").replace(/\/$/, "");
}
