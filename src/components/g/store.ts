"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { GAction } from "@/lib/g/actions";

/**
 * G's conversation state, kept in this tab's sessionStorage under a key that
 * includes the user id and role, so one browser shared by two accounts never
 * shows one person's conversation to the other, and closing the tab ends it.
 * Nothing is sent to the server except the last few turns of each question.
 *
 * A useSyncExternalStore store rather than state-in-an-effect (the pattern the
 * repo's lint rule flags, see CLAUDE.md §15).
 */
export type GMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  engine?: "ai" | "rules";
  cards?: Record<string, unknown>;
  actions?: GAction[];
  error?: string;
};

export type GState = {
  open: boolean;
  messages: GMessage[];
  brief: Record<string, unknown>;
  compare: { id: string; name: string }[];
  speakReplies: boolean;
};

const EMPTY: GState = { open: false, messages: [], brief: {}, compare: [], speakReplies: true };
const MAX_MESSAGES = 30;

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: GState }>();

function read(key: string): GState {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(key);
  } catch {
    raw = null;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value = EMPTY;
  if (raw) {
    try {
      value = { ...EMPTY, ...(JSON.parse(raw) as Partial<GState>) };
    } catch {
      value = EMPTY;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, next: GState) {
  const trimmed = { ...next, messages: next.messages.slice(-MAX_MESSAGES) };
  const raw = JSON.stringify(trimmed);
  try {
    window.sessionStorage.setItem(key, raw);
  } catch {
    // Storage full or blocked: keep it in memory for this page.
  }
  cache.set(key, { raw, value: trimmed });
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useGState(key: string): [GState, (update: (s: GState) => GState) => void] {
  const state = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY,
  );
  const update = useCallback((fn: (s: GState) => GState) => write(key, fn(read(key))), [key]);
  return [state, update];
}
