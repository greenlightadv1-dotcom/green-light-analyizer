import type { StatusTone } from "../ui/status.ts";
import type { SponsorshipType } from "../types/database.ts";

/**
 * Presentation helpers for the collaboration pages. Pure, so the status →
 * tone mapping and number/date formatting are tested and render identically
 * on the server and in the browser (no locale- or timezone-dependent APIs).
 */

export const COLLAB_STATUS_TONE: Record<string, StatusTone> = {
  draft: "neutral",
  published: "success",
  archived: "neutral",
  pending: "info",
  changes_requested: "warning",
  accepted: "success",
  declined: "neutral",
  withdrawn: "neutral",
  negotiating: "warning",
  active: "info",
  completed: "success",
  cancelled: "danger",
  submitted: "info",
  revision_requested: "warning",
  approved: "success",
};

export const statusTone = (status: string): StatusTone => COLLAB_STATUS_TONE[status] ?? "neutral";
export const statusKey = (status: string) => `collab.status.${status}`;

/** Existing analyzer labels for the six sponsorship types. */
export const TYPE_LABEL_KEY: Record<SponsorshipType, string> = {
  video_dedicated: "analyzer.typeVideoDedicated",
  integration: "analyzer.typeIntegration",
  post: "analyzer.typePost",
  story_share: "analyzer.typeStoryShare",
  live_mention: "analyzer.typeLiveMention",
  other: "analyzer.typeOther",
};

export const PLATFORM_LABEL: Record<string, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
};

/** Left-to-right isolate, so a figure keeps its order inside Arabic text. */
const ltr = (s: string) => (s ? `\u2066${s}\u2069` : "");

/** "$1,500" / "$1,500.50" (LTR-isolated); "" for null. Deterministic (no Intl locale data). */
export function usd(value: number | string | null | undefined): string {
  return ltr(plainUsd(value));
}

function plainUsd(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const [whole, frac] = Math.abs(n).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}$${grouped}${frac === "00" ? "" : `.${frac}`}`;
}

/** A budget range, or "" when neither end is set. */
export function budgetRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return ltr(min === max ? plainUsd(min) : `${plainUsd(min)}–${plainUsd(max)}`);
  if (min !== null) return ltr(`${plainUsd(min)}+`);
  if (max !== null) return ltr(`≤ ${plainUsd(max)}`);
  return "";
}

/**
 * A YYYY-MM-DD day (date column or the date part of a timestamp), wrapped in
 * Unicode directional isolates so it reads correctly inside an Arabic
 * sentence. "" for missing input.
 */
export function day(value: string | null | undefined): string {
  if (!value) return "";
  const d = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `⁦${d}⁩` : "";
}
