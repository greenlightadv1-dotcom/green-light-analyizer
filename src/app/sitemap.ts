import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants/site";

/**
 * Only the public marketing page is listed.
 *
 * Creator profiles at /p/<slug> are deliberately NOT enumerated here, even
 * though robots.txt allows crawling them. Each profile is individually public
 * — that is what the shareable link is for — but a sitemap listing every one
 * of them would publish the platform's entire creator roster as a single
 * machine-readable file, which is a different disclosure from "this creator
 * shared their own link." A profile still gets indexed the moment a sponsor
 * or the creator links to it.
 *
 * If the client decides an enumerable directory is wanted, this is where it
 * goes: query profiles for non-null shareable_slug and map to /p/<slug>.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
