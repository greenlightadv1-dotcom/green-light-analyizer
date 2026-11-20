import type { ContentKind, ContentStatus, PortfolioPlatform } from "../types/database.ts";

/** Pure rules for content planning (migration 0029). */

export const CONTENT_KINDS: ContentKind[] = ["idea", "script", "hook", "title", "description"];
export const CONTENT_STATUSES: ContentStatus[] = ["idea", "drafting", "ready", "scheduled", "published", "archived"];
export const BOARD_STATUSES: ContentStatus[] = ["idea", "drafting", "ready", "scheduled", "published"];
const PLATFORMS: PortfolioPlatform[] = ["youtube", "twitch", "kick", "instagram", "tiktok", "x", "other"];
export const CONTENT_LIMITS = { title: [1, 160], body: 20000, tags: 10, tag: 30 } as const;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ContentInput = {
  kind: ContentKind;
  title: string;
  body: string | null;
  status: ContentStatus;
  platform: PortfolioPlatform | null;
  planned_for: string | null;
  tags: string[];
  collaboration_id: string | null;
};

export function parseContentItem(f: Record<string, unknown>): { ok: true; value: ContentInput } | { ok: false; errorKey: string } {
  const kind = text(f.kind) as ContentKind;
  if (!CONTENT_KINDS.includes(kind)) return { ok: false, errorKey: "content.errors.kind" };
  const title = text(f.title);
  if (title.length < CONTENT_LIMITS.title[0] || title.length > CONTENT_LIMITS.title[1]) return { ok: false, errorKey: "content.errors.title" };
  const body = typeof f.body === "string" ? f.body.replace(/\r\n/g, "\n").trim() : "";
  if (body.length > CONTENT_LIMITS.body) return { ok: false, errorKey: "content.errors.body" };
  const status = (text(f.status) || "idea") as ContentStatus;
  if (!CONTENT_STATUSES.includes(status)) return { ok: false, errorKey: "content.errors.status" };
  const day = text(f.planned_for);
  if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00Z`)))) return { ok: false, errorKey: "content.errors.date" };
  if (status === "scheduled" && !day) return { ok: false, errorKey: "content.errors.scheduled_date" };
  const platformRaw = text(f.platform);
  const tags = [...new Set(text(f.tags).split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean))];
  if (tags.length > CONTENT_LIMITS.tags || tags.some((t) => t.length > CONTENT_LIMITS.tag)) return { ok: false, errorKey: "content.errors.tags" };
  const collab = text(f.collaboration_id);
  return {
    ok: true,
    value: {
      kind,
      title,
      body: body || null,
      status,
      platform: (PLATFORMS as string[]).includes(platformRaw) ? (platformRaw as PortfolioPlatform) : null,
      planned_for: day || null,
      tags,
      collaboration_id: UUID.test(collab) ? collab : null,
    },
  };
}

/** "YYYY-MM" from a query value, else the month of `today` (a YYYY-MM-DD string). */
export function parseMonth(raw: unknown, today: string): { year: number; month: number } {
  const m = typeof raw === "string" ? /^(\d{4})-(\d{2})$/.exec(raw) : null;
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 2000 && +m[1] <= 2100) return { year: +m[1], month: +m[2] };
  return { year: +today.slice(0, 4), month: +today.slice(5, 7) };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const monthKey = (year: number, month: number) => `${year}-${pad(month)}`;

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const i = year * 12 + (month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

/**
 * The calendar grid for a month: whole weeks starting Monday, each cell a
 * YYYY-MM-DD string or null for days outside the month. Pure and UTC-based,
 * so server and browser agree.
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function contentErrorKey(message: string | null | undefined): string {
  const m = message ?? "";
  if (m.includes("content:too_many")) return "content.errors.too_many";
  if (m.includes("content:collaboration")) return "content.errors.collaboration";
  return "ui.errors.generic";
}
