import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DocumentShell } from "@/app/components/DocumentShell";
import { LEGAL_PAGES, findLegalPage } from "@/app/legal/content.ts";

/** One route for eight near-identical documents, rather than eight files that drift. */
export function generateStaticParams() {
  return LEGAL_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findLegalPage(slug);
  if (page === undefined) return {};
  return { title: `${page.title} — SpinDrop`, description: page.standfirst };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = findLegalPage(slug);
  if (page === undefined) notFound();

  return (
    <DocumentShell
      title={page.title}
      standfirst={page.standfirst}
      draftNotice={page.draftNotice}
    >
      {page.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body.map((paragraph) =>
            paragraph.startsWith("NEEDS:") ? (
              // Rendered distinctly on purpose: an unsupplied fact must be
              // visibly missing, never mistaken for finished copy.
              <p
                key={paragraph}
                className="mt-3.5 bg-ink/[0.06] px-4 py-3 text-sm text-ink-soft"
              >
                <span className="font-display text-[0.7rem] uppercase tracking-[0.14em] text-ink">
                  Still required
                </span>
                <br />
                {paragraph.replace("NEEDS: ", "")}
              </p>
            ) : (
              <p key={paragraph}>{paragraph}</p>
            ),
          )}
        </section>
      ))}
    </DocumentShell>
  );
}
