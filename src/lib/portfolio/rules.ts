import type { PortfolioPlatform, PublicProfileSettings } from "../types/database.ts";

/**
 * Pure validation for shortlists, portfolio items and public-profile
 * visibility (migration 0028). The database enforces the same limits; these
 * give the person a precise message before a round trip.
 */

export const PORTFOLIO_PLATFORMS: PortfolioPlatform[] = ["youtube", "twitch", "kick", "instagram", "tiktok", "x", "other"];
export const PORTFOLIO_LIMITS = { title: [2, 120], description: 1000, url: 500, brand: [1, 80], items: 30, shortlistName: [1, 60], note: 500, lists: 20 } as const;

export const VISIBILITY_FIELDS = ["show_bio", "show_location", "show_social_links", "show_rate", "show_platforms", "show_portfolio"] as const;
export type VisibilityField = (typeof VISIBILITY_FIELDS)[number];

/** Defaults when a creator has no settings row: the pre-0028 public page, portfolio off. */
export const DEFAULT_VISIBILITY: Record<VisibilityField, boolean> = {
  show_bio: true,
  show_location: true,
  show_social_links: true,
  show_rate: true,
  show_platforms: true,
  show_portfolio: false,
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export type PortfolioInput = {
  title: string;
  description: string | null;
  url: string | null;
  platform: PortfolioPlatform | null;
  brand_name: string | null;
  brand_name_public: boolean;
  published_on: string | null;
  is_public: boolean;
};

export function parsePortfolioItem(f: Record<string, unknown>): { ok: true; value: PortfolioInput } | { ok: false; errorKey: string } {
  const title = text(f.title);
  if (title.length < PORTFOLIO_LIMITS.title[0] || title.length > PORTFOLIO_LIMITS.title[1]) return { ok: false, errorKey: "portfolio.errors.title" };
  const description = text(f.description);
  if (description.length > PORTFOLIO_LIMITS.description) return { ok: false, errorKey: "portfolio.errors.description" };
  const rawUrl = text(f.url);
  let url: string | null = null;
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== "https:" || rawUrl.length > PORTFOLIO_LIMITS.url) return { ok: false, errorKey: "portfolio.errors.url" };
      url = u.toString();
    } catch {
      return { ok: false, errorKey: "portfolio.errors.url" };
    }
  }
  const platformRaw = text(f.platform);
  const platform = (PORTFOLIO_PLATFORMS as string[]).includes(platformRaw) ? (platformRaw as PortfolioPlatform) : null;
  const brand = text(f.brand_name);
  if (brand.length > PORTFOLIO_LIMITS.brand[1]) return { ok: false, errorKey: "portfolio.errors.brand" };
  const consent = f.brand_name_public === "on" || f.brand_name_public === true;
  if (consent && !brand) return { ok: false, errorKey: "portfolio.errors.consent" };
  const day = text(f.published_on);
  if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00Z`)))) return { ok: false, errorKey: "portfolio.errors.date" };
  return {
    ok: true,
    value: {
      title,
      description: description || null,
      url,
      platform,
      brand_name: brand || null,
      brand_name_public: consent && !!brand,
      published_on: day || null,
      is_public: f.is_public === "on" || f.is_public === true,
    },
  };
}

/** Visibility from checkboxes: a field is on only when its box was ticked. */
export function parseVisibility(checked: (name: VisibilityField) => boolean): Pick<PublicProfileSettings, VisibilityField> {
  return Object.fromEntries(VISIBILITY_FIELDS.map((k) => [k, checked(k)])) as Pick<PublicProfileSettings, VisibilityField>;
}

export function parseShortlistName(v: unknown): string | null {
  const name = text(v).replace(/\s+/g, " ");
  return name.length >= PORTFOLIO_LIMITS.shortlistName[0] && name.length <= PORTFOLIO_LIMITS.shortlistName[1] ? name : null;
}

/** Map a trigger or constraint refusal to a dictionary key. */
export function p3ErrorKey(message: string | null | undefined): string {
  const m = message ?? "";
  if (m.includes("shortlist:too_many")) return "shortlists.errors.too_many";
  if (m.includes("shortlist:not_creator")) return "shortlists.errors.not_creator";
  if (m.includes("shortlists_unique_name")) return "shortlists.errors.duplicate";
  if (m.includes("shortlist_entries_pkey") || m.includes("duplicate key")) return "shortlists.errors.already";
  if (m.includes("portfolio:too_many")) return "portfolio.errors.too_many";
  return "ui.errors.generic";
}

/** New sort order after moving item `id` one place up or down. Pure. */
export function reorder(ids: string[], id: string, dir: "up" | "down"): string[] {
  const i = ids.indexOf(id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
