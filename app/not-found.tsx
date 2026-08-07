import Link from "next/link";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";

/**
 * A bad link previously landed on Next's default 404, which looks nothing like
 * this product — and a page that suddenly stops looking like the site is exactly
 * what a visitor already suspicious of a free prize draw reads as a bad sign.
 *
 * Off-air is the form's own answer: the tally lamp is dark and the studio is
 * empty.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-studio-900">
      <SiteHeader />

      <main
        id="content"
        className="studio-light flex flex-1 items-center justify-center px-4 py-16 sm:px-6"
      >
        <div className="max-w-[46ch] text-center">
          <div className="brushed-dark mx-auto inline-flex items-center gap-2.5 rounded-[3px] px-3 py-2">
            <span className="h-3.5 w-3.5 rounded-full bg-alu-600 shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]" />
            <span className="font-display text-xs uppercase tracking-[0.14em] text-enamel">
              Off air
            </span>
          </div>

          <h1 className="font-display mt-6 text-[clamp(1.6rem,4.6vw,2.4rem)] uppercase leading-[1.02] text-enamel">
            Nothing is scheduled here
          </h1>
          <p className="mx-auto mt-3 text-base leading-relaxed text-caption">
            This page does not exist. The draw itself is still running.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <Link
              href="/"
              className="btn-primary"
            >
              Back to the draw
            </Link>
            <Link
              href="/rules"
              className="text-caption underline decoration-caption/40 hover:text-enamel"
            >
              Official Rules
            </Link>
            <Link
              href="/winners"
              className="text-caption underline decoration-caption/40 hover:text-enamel"
            >
              Winners
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
