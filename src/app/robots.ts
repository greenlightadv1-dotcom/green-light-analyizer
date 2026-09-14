import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants/site";

/**
 * Two things are public and worth indexing: the landing page, and a creator's
 * shareable profile at /p/<slug> — that page exists precisely to be sent to a
 * sponsor, so it should resolve for one who later searches the creator's name.
 *
 * Everything else is either behind the auth gate (where a crawler would only
 * ever be bounced to /login) or is the interface preview, which holds invented
 * data and must never appear in a search result for this product.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/p/"],
      disallow: [
        "/api/",
        "/auth/",
        "/admin/",
        "/preview/",
        "/login",
        "/set-password",
        "/suspended",
        "/dashboard",
        "/inbox",
        "/analyzer",
        "/media-kit",
        "/discover",
        "/settings",
        "/pricing",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
