import type { LegalDocument } from "@/lib/legal-content";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** Shared layout for the public Privacy Policy and Terms of Service pages. */
export function LegalDocumentPage({ doc }: { doc: LegalDocument }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        <section className="bg-brand-gradient text-primary-foreground">
          <div className="mx-auto max-w-4xl px-4 py-14 sm:py-20">
            <h1 className="text-3xl leading-tight sm:text-4xl">{doc.title}</h1>
            <p className="mt-4 text-sm text-primary-foreground/75">
              Last updated {doc.updated}
            </p>
            <p className="mt-6 max-w-2xl text-base text-primary-foreground/80">{doc.summary}</p>
          </div>
        </section>

        <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
          {doc.blocks.map((block, i) => (
            <section key={block.heading ?? `block-${i}`} className="mb-10 last:mb-0">
              {block.heading ? (
                <h2 className="mb-4 text-xl leading-snug sm:text-2xl">{block.heading}</h2>
              ) : null}

              {(block.paragraphs ?? []).map((p, pi) => (
                <p key={pi} className="mb-4 text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}

              {block.bullets?.length ? (
                <ul className="mb-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                  {block.bullets.map((b, bi) => (
                    <li key={bi} className="break-words">
                      {b}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
