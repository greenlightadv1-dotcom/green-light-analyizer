import type { DealStatus } from "../types/database.ts";

/**
 * One tone vocabulary for every status chip, so "agreed", "verified" and
 * "set" look the same wherever they appear. Pure.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const DEAL_STATUS_TONE: Record<DealStatus, StatusTone> = {
  new: "info",
  negotiating: "warning",
  agreed: "success",
  paid: "success",
  disputed: "danger",
};

/** Dictionary key for a deal status label (existing badges.* keys). */
export const DEAL_STATUS_LABEL_KEY: Record<DealStatus, string> = {
  new: "badges.statusNew",
  negotiating: "badges.statusNegotiating",
  agreed: "badges.statusAgreed",
  paid: "badges.statusPaid",
  disputed: "badges.statusDisputed",
};

/** Utility classes per tone, built only from the semantic tokens. */
export const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-line bg-surface-muted text-fg-muted",
  info: "border-info/25 bg-info/10 text-info",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

/**
 * Whether moving a deal to `next` needs a confirmation step. Every real
 * change does: a status is visible to the other party, and "paid" closes the
 * deal to them for good. Selecting the current status is a no-op.
 */
export function dealStatusChangeNeedsConfirm(current: DealStatus, next: DealStatus): boolean {
  return current !== next;
}
