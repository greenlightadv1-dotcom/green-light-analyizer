import type { ElementType, HTMLAttributes, ReactNode } from "react";

type GlassPanelProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  /** `solid` is the denser variant used for nav rails and sticky headers. */
  variant?: "default" | "solid";
  children?: ReactNode;
};

/**
 * The card surface: white (surface token), hairline border, 24px radius,
 * soft shadow. The name is historical (it was the "Liquid Glass" panel); the
 * recipe lives in globals.css so every card re-themes from one place.
 */
export function GlassPanel({
  as: Tag = "div",
  variant = "default",
  className = "",
  children,
  ...rest
}: GlassPanelProps) {
  const base = variant === "solid" ? "glass-panel-solid" : "glass-panel";
  return (
    <Tag className={`${base} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
