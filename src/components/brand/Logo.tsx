import Image from "next/image";

/**
 * Icon-only brand mark — no wordmark. The client supplied two real
 * transparent icons (confirmed via each WebP's VP8X alpha flag) instead of
 * the earlier opaque, wordmark-carrying lockups:
 *
 *  - `icon_dark.webp`  — white mark, for dark surfaces (dark mode)
 *  - `icon_light.webp` — navy mark, for light surfaces (light mode)
 *
 * Naming mirrors the old logo_dark_full.png / logo_light_full.png
 * convention: the suffix names the surface it's *for*, not the mark's own
 * color (the "dark" file is the light-colored one, because that's what
 * reads on a dark surface). Square (2000x2000 source) and genuinely
 * transparent, so no plate wrapper is needed the way the old opaque PNGs
 * required.
 */
export function Logo({
  variant = "dark",
  size = 32,
  className = "",
  priority = false,
}: {
  /** `dark` = for dark surfaces. `light` = for light surfaces. */
  variant?: "dark" | "light";
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  const src =
    variant === "dark" ? "/branding/icon_dark.webp" : "/branding/icon_light.webp";

  return (
    <Image
      src={src}
      alt="Green Light"
      width={size}
      height={size}
      priority={priority}
      className={className}
    />
  );
}
