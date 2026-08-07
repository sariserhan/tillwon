/**
 * The product name, in exactly one place.
 *
 * PRODUCT.md requires that the name be replaceable without touching layout or
 * copy, because it is explicitly a working name. That was not actually true until
 * this file existed — the literal was hardcoded in 34 places across 16 files.
 *
 * Every surface, document and data string now reads from here. If you find
 * yourself typing the product's name into a component, import this instead.
 */
export const BRAND = {
  name: "TillWon",
  /** Lowercase, for slugs and machine contexts. */
  slug: "tillwon",
} as const;
