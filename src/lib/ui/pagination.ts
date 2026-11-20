/**
 * Which page buttons to show: always the first and last page, the current
 * page with `siblings` on each side, and a "gap" marker where pages are
 * skipped. Never more than 5 + 2 * siblings entries, so the control keeps its
 * width on a phone. Pages are 1-based. Pure.
 */
export type PageItem = number | "gap";

export function paginationItems(page: number, totalPages: number, siblings = 1): PageItem[] {
  const total = Math.max(0, Math.floor(totalPages));
  if (total === 0) return [];
  const current = Math.min(Math.max(1, Math.floor(page)), total);
  const maxSlots = 5 + 2 * siblings;
  if (total <= maxSlots) return Array.from({ length: total }, (_, i) => i + 1);

  let start = Math.max(2, current - siblings);
  let end = Math.min(total - 1, current + siblings);
  // Keep the window the same width at the edges.
  const width = 2 * siblings + 1;
  if (current - siblings <= 2) {
    start = 2;
    end = 2 + width;
  } else if (current + siblings >= total - 1) {
    end = total - 1;
    start = total - 1 - width;
  }

  const items: PageItem[] = [1];
  if (start > 2) items.push("gap");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push("gap");
  items.push(total);
  return items;
}

/** Clamp a requested page into range; anything invalid becomes page 1. */
export function clampPage(page: unknown, totalPages: number): number {
  const n = typeof page === "number" ? page : Number.parseInt(String(page ?? ""), 10);
  if (!Number.isFinite(n) || totalPages < 1) return 1;
  return Math.min(Math.max(1, Math.trunc(n)), Math.max(1, Math.trunc(totalPages)));
}
