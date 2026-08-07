import { BRAND } from "@/app/lib/brand.ts";

/**
 * The canonical origin. Must be set at deploy time — metadataBase, the sitemap and
 * canonical URLs all derive from it, and a wrong value produces canonical tags
 * pointing at localhost.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export const SITE_DESCRIPTION = `Spin for a chance to win the current sponsored prize. Ten free spins every day, no purchase necessary. ${BRAND.name} draws a winning entry, seals it before the first spin, and reveals it when the draw ends.`;

/** Routes worth indexing. Claim pages and dev previews are excluded on purpose. */
export const INDEXABLE_PATHS = [
  "/",
  "/rules",
  "/winners",
  "/sign-in",
  "/campaign/seed-100-gift-card",
  "/sponsor/tillwon",
  "/legal/terms",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/accessibility",
  "/legal/sponsor-disclosure",
  "/legal/prize-tax",
  "/legal/contact",
  "/legal/abuse",
] as const;
