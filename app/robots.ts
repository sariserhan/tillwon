import type { MetadataRoute } from "next";
import { SITE_URL } from "@/app/lib/site.ts";

/**
 * Claim pages carry a reference tied to one person's prize and must never be
 * indexed. /admin is an internal review tool, not a public surface. /preview
 * is development-only and 404s in production, but excluding it costs nothing
 * and documents the intent.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/claim/", "/admin", "/preview/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
