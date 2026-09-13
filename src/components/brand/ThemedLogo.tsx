import { Logo } from "@/components/brand/Logo";

/**
 * Swaps the dark/light icon with the `dark:` CSS variant rather than reading
 * the resolved theme in JS — it's pure CSS, so it never flashes the wrong
 * mark while next-themes is still figuring out the theme client-side. Used
 * everywhere the brand mark appears: landing nav/footer, dashboard
 * Sidebar/TopBar, the auth shell, and the suspended page.
 */
export function ThemedLogo({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 dark:hidden">
        <Logo variant="light" size={size} priority />
      </span>
      <span className="absolute inset-0 hidden dark:block">
        <Logo variant="dark" size={size} priority />
      </span>
    </span>
  );
}
