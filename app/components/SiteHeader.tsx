import Link from "next/link";

/**
 * The header rail, shared by every surface. Extracted from the campaign page so
 * a document page cannot drift from it.
 *
 * Official Rules and Winners are hidden below `sm` because they wrap the rail to
 * two lines at 375px; both stay reachable from the footer and the compliance
 * caption.
 */
export function SiteHeader() {
  return (
    <header className="brushed-dark relative z-20 flex items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
      <Link
        href="/"
        className="font-display text-lg uppercase tracking-[0.02em] text-enamel sm:text-xl"
      >
        SpinDrop
      </Link>
      <nav className="flex items-center gap-4 text-sm sm:gap-6">
        <Link href="/rules" className="hidden text-caption hover:text-enamel sm:inline">
          Official Rules
        </Link>
        <Link href="/winners" className="hidden text-caption hover:text-enamel sm:inline">
          Winners
        </Link>
        <Link
          href="/sign-in"
          className="rounded-[3px] border border-enamel/40 px-3 py-1.5 text-enamel hover:border-enamel"
        >
          Sign in
        </Link>
      </nav>
    </header>
  );
}
