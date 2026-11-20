/**
 * Keyboard model for Tabs (WAI-ARIA "tabs" pattern, automatic activation).
 * ArrowRight/ArrowLeft move along the reading direction, so in RTL ArrowLeft
 * goes to the *next* tab, matching where it sits on screen. Home/End jump to
 * the ends. Disabled tabs are skipped. Pure, so it is unit-tested directly.
 */
export type Direction = "ltr" | "rtl";

export function nextTabIndex(
  key: string,
  current: number,
  disabled: readonly boolean[],
  dir: Direction = "ltr",
): number | null {
  const count = disabled.length;
  if (count === 0) return null;
  const enabled = (i: number) => !disabled[i];
  if (!disabled.some((d) => !d)) return null;

  const step = (from: number, delta: 1 | -1): number => {
    let i = from;
    for (let n = 0; n < count; n++) {
      i = (i + delta + count) % count;
      if (enabled(i)) return i;
    }
    return from;
  };

  switch (key) {
    case "ArrowRight":
      return step(current, dir === "rtl" ? -1 : 1);
    case "ArrowLeft":
      return step(current, dir === "rtl" ? 1 : -1);
    case "Home":
      return firstEnabled(disabled);
    case "End":
      return lastEnabled(disabled);
    default:
      return null;
  }
}

function firstEnabled(disabled: readonly boolean[]): number {
  return disabled.findIndex((d) => !d);
}

function lastEnabled(disabled: readonly boolean[]): number {
  for (let i = disabled.length - 1; i >= 0; i--) if (!disabled[i]) return i;
  return -1;
}
