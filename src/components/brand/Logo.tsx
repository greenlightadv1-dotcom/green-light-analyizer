import Image from "next/image";

/**
 * Logo usage rules — CLAUDE.md §2.3
 *
 *  - `logo_dark_full.png` on navy/dark surfaces (the app's default theme)
 *  - `logo_light_full.png` on light/white surfaces
 *  - `icon_color.png` for favicons, avatars, collapsed sidebar marks
 *
 * The wordmark is a custom display face baked into the PNG — never recreate it
 * in a web font, and never recolor it outside navy / green / white.
 */

const FULL_RATIO = 2371 / 725; // intrinsic lockup aspect of the supplied PNGs

export function Logo({
  variant = "dark",
  height = 40,
  className = "",
  priority = false,
}: {
  /** `dark` = for dark surfaces (white wordmark). `light` = for light surfaces. */
  variant?: "dark" | "light";
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  const src =
    variant === "dark"
      ? "/branding/logo_dark_full.png"
      : "/branding/logo_light_full.png";

  return (
    <Image
      src={src}
      alt="Green Light"
      height={height}
      width={Math.round(height * FULL_RATIO)}
      className={className}
      priority={priority}
      style={{ height, width: "auto" }}
    />
  );
}

/** Icon-only mark. Works on both light and dark surfaces. */
export function LogoMark({
  size = 32,
  className = "",
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/branding/icon_color.png"
      alt="Green Light"
      width={size}
      height={size}
      className={className}
      priority={priority}
    />
  );
}
