import { createFileRoute } from "@tanstack/react-router";

import { CtaLink } from "@/components/marketing/cta-link";
import { AdministrationTiers } from "@/components/marketing/administration-tiers";
import { PricingCalculator } from "@/components/marketing/pricing-calculator";
import { OfferingSection } from "@/components/marketing/offering-section";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { marketingHead } from "@/lib/marketing/seo";
import { useQuery } from "@tanstack/react-query";
import { getPublicSpvTransactionPricing } from "@/lib/service-engagements.functions";
import { PRICING, formatPrice, hasPublishedPricing } from "@/lib/marketing/site-config";

export const Route = createFileRoute("/pricing")({
  head: () =>
    marketingHead({
      path: "/pricing",
      title: "Pricing - SPVs, Fund Administration & Cap Tables | Harmonious",
      description: "Pricing for Harmonious SPV administration, fund administration, cap table management and additional services.",
      // Kept out of search until approved prices are published.
      noindex: !hasPublishedPricing(),
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Pricing", path: "/pricing" },
      ],
    }),
  component: PricingPage,
});

function SpvBands() {
  const q = useQuery({ queryKey: ["public-spv-transaction-pricing"], queryFn: () => getPublicSpvTransactionPricing(), staleTime: 300_000 });
  if (!q.data?.length) return null;
  return (
    <>
      {q.data.map((b) => (
        <li key={b.id} className="flex items-start justify-between gap-4">
          <div><h3 className="text-base">SPV raising {b.label.charAt(0).toLowerCase() + b.label.slice(1)}</h3><p className="text-sm text-muted-foreground">One-time SPV administration fee based on capital raised.</p></div>
          <span className="shrink-0 text-sm font-medium">{b.fee_usd == null ? "Custom pricing" : `$${b.fee_usd.toLocaleString("en-US")} per SPV`}</span>
        </li>
      ))}
    </>
  );
}

function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-14 lg:py-20">
        <h1 className="text-3xl leading-tight sm:text-4xl">Pricing</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Pricing depends on the structure, number of investors and services you need. Talk to us and
          we'll put together a quote.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {PRICING.map((section) => (
            <section key={section.id} className="rounded-xl border bg-card p-6">
              <h2 className="text-xl">{section.title}</h2>
              {section.items.filter((i) => i.approved).length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Contact us for pricing.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {section.items.filter((i) => i.approved).map((i) => (
                    <li key={i.name} className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base">{i.name}</h3>
                        <p className="text-sm text-muted-foreground">{i.description}</p>
                      </div>
                      <span className="shrink-0 text-sm font-medium">{formatPrice(i)}</span>
                    </li>
                  ))}
                  {section.id === "spvs" ? <SpvBands /> : null}
                </ul>
              )}
            </section>
          ))}
        </div>
        <AdministrationTiers />
        <PricingCalculator />
        <div className="mt-10">
          <CtaLink cta="talk_to_administrator" />
        </div>
      </main>
      <OfferingSection />
      <SiteFooter />
    </div>
  );
}
