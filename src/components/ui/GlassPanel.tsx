import type { ElementType, HTMLAttributes, ReactNode } from "react";

type GlassPanelProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  /** `solid` is the denser variant used for nav rails and sticky headers. */
  variant?: "default" | "solid";
  children?: ReactNode;
};

/**
 * The Liquid Glass surface (CLAUDE.md §2.2). Every card / panel in the product
 * should be one of these rather than hand-rolling the blur recipe.
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
