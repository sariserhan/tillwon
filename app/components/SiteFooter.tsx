import Link from "next/link";
import { LEGAL_PAGES } from "@/app/legal/content.ts";
import { BRAND } from "@/app/lib/brand.ts";

/**
 * The footer is where every legal surface becomes reachable. Before this existed
 * the compliance caption linked to a 404 — a "See Official Rules" link that goes
 * nowhere is the worst possible broken link for a promotion that has to prove it
 * is not a scam.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-enamel/10 bg-studio-900 px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div className="max-w-[34ch]">
            <p className="font-display text-base uppercase tracking-[0.02em] text-enamel">
              {BRAND.name}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-caption">
              A free daily prize draw. No purchase necessary, and no purchase ever
              improves your chances.
            </p>
          </div>

          <nav aria-label="Legal and site" className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <Link href="/rules" className="text-enamel hover:underline">
              Official Rules
            </Link>
            <Link href="/winners" className="text-caption hover:text-enamel">
              Winners
            </Link>
            {LEGAL_PAGES.map((page) => (
              <Link
                key={page.slug}
                href={`/legal/${page.slug}`}
                className="text-caption hover:text-enamel"
              >
                {page.navLabel}
              </Link>
            ))}
          </nav>
        </div>

        <p className="border-t border-enamel/10 pt-5 text-[0.8rem] leading-relaxed text-caption">
          No purchase necessary. A purchase will not increase your chances of
          winning. Open to legal residents of 46 US states and the District of
          Columbia, 18 or older. Void in Tennessee, Alabama, Nebraska, Mississippi,
          all US territories, and where prohibited. See{" "}
          <Link
            href="/rules"
            className="text-enamel underline decoration-enamel/40 hover:decoration-enamel"
          >
            Official Rules
          </Link>
          .
        </p>
      </div>
    </footer>
  );
}
