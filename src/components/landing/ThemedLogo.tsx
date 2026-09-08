import { Logo } from "@/components/brand/Logo";

/**
 * Swaps the light/dark lockup (CLAUDE.md §2.3) with the `dark:` CSS variant
 * rather than reading the resolved theme in JS — it's pure CSS, so it never
 * flashes the wrong logo while next-themes is still figuring out the theme
 * client-side.
 */
export function ThemedLogo({ height = 30 }: { height?: number }) {
  return (
    <span className="inline-flex">
      <span className="dark:hidden">
        <Logo variant="light" height={height} priority />
      </span>
      <span className="hidden dark:inline-flex">
        <Logo variant="dark" height={height} priority />
      </span>
    </span>
  );
}
