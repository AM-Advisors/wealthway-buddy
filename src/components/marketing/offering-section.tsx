import { INCLUDED_WITH_EVERY_FUND, INVESTOR_ONBOARDING, TAX_SERVICE } from "@/lib/marketing/offering";

/** The current Harmonious services, shown the same way on every public page. */
export function OfferingSection({ spv = false }: { spv?: boolean }) {
  const bundles = [
    { ...INVESTOR_ONBOARDING, summary: spv ? "Included with every SPV." : INVESTOR_ONBOARDING.summary },
    TAX_SERVICE,
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Our services</p>
      <h2 className="mt-4 max-w-2xl text-3xl leading-tight sm:text-4xl">Included With Every Fund</h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {INCLUDED_WITH_EVERY_FUND.map(([title, body]) => (
          <article key={title} className="rounded-xl border bg-card p-5">
            <h3 className="text-base">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </article>
        ))}
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {bundles.map((b) => (
          <article key={b.title} className="rounded-xl border bg-card p-7">
            <h3 className="text-xl">{b.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{b.summary}</p>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {b.items.map((i) => (
                <li key={i} className="flex gap-2"><span aria-hidden className="text-accent-foreground">✓</span>{i}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
