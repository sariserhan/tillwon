import type { MetadataRoute } from "next";
import { INDEXABLE_PATHS, SITE_URL } from "@/app/lib/site.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    // The draw surface changes with campaign state; documents rarely do.
    changeFrequency: path === "/" ? "daily" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
