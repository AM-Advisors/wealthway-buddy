import { CtaLink } from "@/components/marketing/cta-link";
import { useQuery } from "@tanstack/react-query";
import { getPublicServicePricing } from "@/lib/service-engagements.functions";
import { ADMINISTRATION_TIERS, annualSavings, tierByKey } from "@/lib/administration-tiers";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

const LEVEL: Record<string, string> = { core: "CORE", fund_admin: "FUND_ADMINISTRATION", white_glove: "WHITE_GLOVE", institutional: "INSTITUTIONAL" };

export function AdministrationTiers() {
  // Live prices come from the pricing configuration; the built-in list is the fallback.
  const q = useQuery({ queryKey: ["public-service-pricing"], queryFn: () => getPublicServicePricing(), staleTime: 300_000 });
  const tiers = ADMINISTRATION_TIERS.map((t) => {
    const p = q.data?.find((x) => x.service_level === LEVEL[t.key]);
    if (!p || t.key === "core") return t;
    if (t.key === "institutional") return { ...t, startingAnnual: p.starting_price ?? t.startingAnnual };
    return p.annual_price ? { ...t, prices: { annual: Number(p.annual_price), quarterly: Number(p.quarterly_price), monthly: Number(p.monthly_price) } } : t;
  });
  return (
    <section className="mt-12">
      <h2 className="text-2xl">Fund administration levels</h2>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Software, people and execution — know exactly what is being handled without having to manage your administrator.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {tiers.map((t) => {
          const save = annualSavings(t);
          return (
            <article key={t.key} className="flex flex-col rounded-xl border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.positioning}</p>
              <h3 className="mt-1 text-lg">{t.name}</h3>
              <p className="mt-1 text-sm italic text-muted-foreground">“{t.statement}”</p>
              <div className="mt-4">
                {t.prices?.annual ? (
                  <>
                    <p className="text-2xl font-semibold">{usd(t.prices.annual)}<span className="text-sm font-normal text-muted-foreground">/year</span></p>
                    {save ? <p className="text-xs font-medium text-accent-foreground"><span className="rounded bg-accent px-1.5 py-0.5">Best value — save {usd(save)}</span></p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">or {usd(t.prices.quarterly!)}/quarter · {usd(t.prices.monthly!)}/month</p>
                  </>
                ) : t.startingAnnual ? (
                  <p className="text-2xl font-semibold">From {usd(t.startingAnnual)}<span className="text-sm font-normal text-muted-foreground">/year</span></p>
                ) : (
                  <p className="text-base font-medium">Included with Harmonious SPVs</p>
                )}
              </div>
              {t.scope ? <p className="mt-3 text-xs text-muted-foreground">Starting scope: {t.scope.join(" · ")}</p> : null}
              <ul className="mt-4 space-y-1 text-sm">
                {t.includesPrevious ? <li className="font-medium">Everything in {tierByKey(t.includesPrevious).name}, plus:</li> : null}
                {t.entitlements.slice(0, 8).map((e) => <li key={e}>• {e}</li>)}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">{t.operatingModel}</p>
              {t.key === "institutional" ? (
                <div className="mt-4"><CtaLink cta="talk_to_administrator" /></div>
              ) : null}
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Core Administration is SPV infrastructure, not full-service fund administration.</p>
    </section>
  );
}
