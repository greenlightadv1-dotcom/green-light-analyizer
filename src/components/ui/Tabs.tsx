"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { nextTabIndex } from "@/lib/ui/tabs";

export type TabItem = { id: string; label: string; content: ReactNode; disabled?: boolean };

/**
 * WAI-ARIA tabs with automatic activation. Only the active tab is in the Tab
 * order; arrow keys move between tabs following the reading direction, so the
 * keys match the screen in Arabic too (lib/ui/tabs.ts). Works controlled
 * (`value` + `onChange`) or uncontrolled (`defaultValue`).
 */
export function Tabs({
  label,
  items,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
}) {
  const baseId = useId();
  const [inner, setInner] = useState(defaultValue ?? items.find((i) => !i.disabled)?.id ?? "");
  const active = value ?? inner;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
  };

  const activeIndex = Math.max(0, items.findIndex((i) => i.id === active));

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((item, i) => {
          const selected = i === activeIndex;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => select(item.id)}
              onKeyDown={(e) => {
                const dir = document.documentElement.dir === "rtl" ? "rtl" : "ltr";
                const next = nextTabIndex(e.key, i, items.map((x) => Boolean(x.disabled)), dir);
                if (next === null || next < 0) return;
                e.preventDefault();
                select(items[next].id);
                refs.current[next]?.focus();
              }}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition focus-visible:focus-ring disabled:opacity-40 ${
                selected
                  ? "border-brand-green font-semibold text-fg"
                  : "border-transparent text-fg-muted hover:text-fg"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item, i) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={i !== activeIndex}
          tabIndex={0}
          className="pt-4 focus-visible:focus-ring"
        >
          {i === activeIndex ? item.content : null}
        </div>
      ))}
    </div>
  );
}
