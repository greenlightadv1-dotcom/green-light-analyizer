"use client";

import { useSyncExternalStore } from "react";
import { isWithinSupportHours } from "@/lib/support";

const noopSubscribe = () => () => {};

/**
 * Whether support is open right now, read on the client only. The server
 * snapshot is null, so the server render and the first client render agree
 * and the line simply appears once hydrated, with no mismatch from a clock
 * that differs between the two.
 */
export function useSupportOpenNow(): boolean | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => isWithinSupportHours(new Date()),
    () => null,
  );
}
