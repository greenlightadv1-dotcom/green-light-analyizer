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
 *
 * IMPORTANT, and a discrepancy with the spec: all three supplied PNGs are
 * fully opaque. `logo_dark_full.png` carries a solid #293E61 navy plate and
 * `icon_color.png` a solid white one — §2.3 describes the latter as having a
 * transparent background, but the file does not. Dropped straight onto the
 * #0A0D14 app shell they therefore read as visible rectangles.
 *
 * Until transparent (or SVG) artwork is supplied, each mark is rendered on a
 * plate matching its own baked-in background, so the edge is invisible and the
 * result reads as an intentional brand chip. The plate colour is exactly the
 * asset's own — nothing is recolored.
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
  const dark = variant === "dark";
  const src = dark
    ? "/branding/logo_dark_full.png"
    : "/branding/logo_light_full.png";

  return (
    <span
      className={`inline-flex overflow-hidden rounded-xl ${
        dark ? "bg-navy" : "bg-white"
      } ${className}`}
    >
      <Image
        src={src}
        alt="Green Light"
        height={height}
        width={Math.round(height * FULL_RATIO)}
        priority={priority}
        style={{ height, width: "auto" }}
      />
    </span>
  );
}

/**
 * Icon-only mark. The supplied file has a white background, so it is rendered
 * on a white plate — the usual app-icon treatment, and it keeps the navy/green
 * mark legible on both light and dark surfaces.
 */
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
    <span
      className={`inline-flex overflow-hidden rounded-lg bg-white ${className}`}
    >
      <Image
        src="/branding/icon_color.png"
        alt="Green Light"
        width={size}
        height={size}
        priority={priority}
      />
    </span>
  );
}
