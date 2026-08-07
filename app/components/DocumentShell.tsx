import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

/**
 * The shell for every Read surface: Official Rules, the winner archive, and the
 * legal pages.
 *
 * A printed sheet under studio light. In-world — a televised draw publishes its
 * regulations as printed matter — and the right call for reading, since ink on
 * paper beats cream-on-teal for a document someone actually has to get through.
 * The reader here is suspicious by default, so legibility is a credibility
 * factor, not a nicety.
 */
export function DocumentShell({
  title,
  standfirst,
  draftNotice,
  children,
}: {
  title: string;
  standfirst?: string;
  /** Renders a conspicuous banner. Present on anything not reviewed by counsel. */
  draftNotice?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-studio-900">
      <SiteHeader />

      <main className="studio-light flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <article className="mx-auto max-w-[46rem] rounded-[3px] bg-paper px-5 py-8 shadow-[0_18px_40px_rgb(0_0_0/0.45)] ring-1 ring-paper-edge sm:px-10 sm:py-12">
          <h1 className="font-display text-[clamp(1.6rem,4.2vw,2.4rem)] uppercase leading-[1.02] text-ink">
            {title}
          </h1>

          {standfirst && (
            <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-ink-soft sm:text-lg">
              {standfirst}
            </p>
          )}

          {draftNotice && (
            /* An overprinted stripe, the way printed matter marks a proof. In one
               ink, not tally red: red means the draw is live and nothing else may
               borrow that signal. Cream on tally red also measured 3.78:1, under
               the 4.5:1 floor for text this size, so the discipline and the
               contrast requirement pointed the same way. */
            <div role="note" className="mt-7">
              <p className="bg-ink px-3 py-1.5 font-display text-xs uppercase tracking-[0.16em] text-paper">
                Draft — not legally reviewed
              </p>
              <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-ink-soft">
                {draftNotice}
              </p>
            </div>
          )}

          {/* Measure held to ~70 CHARACTERS, which is 53ch — not 70ch. The `ch`
              unit is the width of "0" (9.32px here) while an average lowercase
              character is 7.1px, so a naive max-w-[70ch] runs ~89 characters and
              overshoots the readable range. Measured, not assumed. */}
          <div className="mt-8 max-w-[53ch] text-[0.95rem] leading-[1.7] text-ink [&_h2]:mb-2 [&_h2]:mt-9 [&_h2]:font-display [&_h2]:text-sm [&_h2]:uppercase [&_h2]:tracking-[0.12em] [&_h2]:text-ink [&_h3]:mb-1.5 [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3.5 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
            {children}
          </div>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
