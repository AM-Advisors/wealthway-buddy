import { CtaLink } from "@/components/marketing/cta-link";
import { useQuery } from "@tanstack/react-query";
import { getPublicServicePricing } from "@/lib/service-engagements.functions";
import { type AdministrationTier, ADMINISTRATION_TIERS, annualSavings } from "@/lib/administration-tiers";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
type Price = { service_product: string; service_level: string; annual_price: number | null; quarterly_price: number | null; monthly_price: number | null; starting_price: number | null };

interface Card { key: string; level: string; name: string; positioning: string; priceText?: string; prices?: AdministrationTier["prices"]; starting?: number; startingSuffix?: string; plus?: string; items: string[]; note?: string; cta?: boolean }

const SPV_CORE_ITEMS = ["Investor roster & portal", "KYC/KYB/AML & accreditation", "Subscription & commitment tracking", "Funding status", "Document storage", "Basic GL & bank reconciliation", "Contributions, distributions & expenses", "Investor capital balances", "Basic investor communications", "Tax document delivery"];
const SPV_CARDS: Card[] = [
  { key: "spv-core", level: "CORE", name: "SPV Core", positioning: "Essential SPV Infrastructure", priceText: "Included with SPV", items: SPV_CORE_ITEMS },
  { key: "spv-plus", level: "PLUS", name: "SPV Plus", positioning: "Enhanced SPV Administration", starting: 2500, startingSuffix: "/year · configurable", plus: "SPV Core", note: "Or included in certain SPV packages.",
    items: ["Enhanced reconciliation", "Investor statements", "Enhanced capital reporting", "Annual financial package", "Investment value tracking", "Enhanced distribution calculations", "Tax preparer coordination", "Enhanced close support", "Additional reporting"] },
  { key: "spv-wg", level: "WHITE_GLOVE", name: "SPV White Glove", positioning: "Managed SPV Operations", starting: 7500, startingSuffix: "/year additional", plus: "SPV Plus", note: "Configured by SPV complexity.",
    items: ["Dedicated administrator", "Priority support", "Proactive investor follow-up", "KYC exception management", "Treasury coordination", "Distribution management", "Investor inquiry management", "Transfer administration", "Tax coordination", "Regulatory & operating calendars"] },
];

const fundTier = (k: AdministrationTier["key"]) => ADMINISTRATION_TIERS.find((t) => t.key === k)!;
const FUND_CARDS: Card[] = [
  { key: "fund-core", level: "CORE", name: "Fund Core", positioning: "Essential Fund Administration", prices: { annual: 15000, quarterly: 4250, monthly: 1500 },
    items: ["Fund general ledger & bank reconciliation", "Contributions & distributions", "Investor roster, onboarding & portal", "KYC/KYB/AML & accreditation", "Subscription & commitment records", "Basic capital accounts", "Investor statements", "Fund documents", "Basic quarterly reporting", "Year-end accounting data package"] },
  { key: "fund-admin", level: "FUND_ADMINISTRATION", name: "Fund Administration", positioning: "Complete Fund Administration", prices: fundTier("fund_admin").prices, plus: "Fund Core",
    items: ["Investment accounting & full capital accounts", "Quarterly NAV & quarterly close", "Management fee & standard waterfall", "Capital call & distribution administration", "Quarterly reporting package & schedule of investments", "Tax & audit coordination", "Fund operating calendar", "Enhanced investor reporting"] },
  { key: "fund-wg", level: "WHITE_GLOVE", name: "White Glove Fund Administration", positioning: "Managed Fund Operations", prices: fundTier("white_glove").prices, plus: "Fund Administration", items: fundTier("white_glove").entitlements.slice(0, 9) },
  { key: "fund-inst", level: "INSTITUTIONAL", name: "Institutional", positioning: "Outsourced Fund Operations", starting: 60000, startingSuffix: "/year", note: "Custom pricing required.", items: fundTier("institutional").entitlements.slice(0, 8), cta: true },
];

function withLive(cards: Card[], product: string, live?: Price[]): Card[] {
  return cards.map((c) => {
    const p = live?.find((x) => x.service_product === product && x.service_level === c.level);
    if (!p || c.priceText) return c;
    if (p.annual_price) return { ...c, prices: { annual: Number(p.annual_price), quarterly: Number(p.quarterly_price), monthly: Number(p.monthly_price) } };
    if (p.starting_price) return { ...c, starting: Number(p.starting_price) };
    return c;
  });
}

function CardView({ c }: { c: Card }) {
  const save = c.prices ? annualSavings({ prices: c.prices } as AdministrationTier) : null;
  return (
    <article className="flex flex-col rounded-xl border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.positioning}</p>
      <h4 className="mt-1 text-lg">{c.name}</h4>
      <div className="mt-3">
        {c.prices?.annual ? (
          <>
            <p className="text-2xl font-semibold">{usd(c.prices.annual)}<span className="text-sm font-normal text-muted-foreground">/year</span></p>
            {save ? <p className="text-xs"><span className="rounded bg-accent px-1.5 py-0.5 text-accent-foreground">Best value — save {usd(save)}</span></p> : null}
            <p className="mt-1 text-xs text-muted-foreground">or {usd(c.prices.quarterly!)}/quarter · {usd(c.prices.monthly!)}/month</p>
          </>
        ) : c.starting ? (
          <p className="text-2xl font-semibold">From {usd(c.starting)}<span className="text-sm font-normal text-muted-foreground">{c.startingSuffix}</span></p>
        ) : <p className="text-base font-medium">{c.priceText}</p>}
        {c.note ? <p className="mt-1 text-xs text-muted-foreground">{c.note}</p> : null}
      </div>
      <ul className="mt-4 space-y-1 text-sm">
        {c.plus ? <li className="font-medium">Everything in {c.plus}, plus:</li> : null}
        {c.items.map((e) => <li key={e}>• {e}</li>)}
      </ul>
      {c.cta ? <div className="mt-4"><CtaLink cta="talk_to_administrator" /></div> : null}
    </article>
  );
}

export function AdministrationTiers() {
  const q = useQuery({ queryKey: ["public-service-pricing"], queryFn: () => getPublicServicePricing(), staleTime: 300_000 });
  return (
    <section className="mt-12 space-y-10">
      <div>
        <h2 className="text-2xl">SPV Administration</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Service levels for Harmonious-administered SPVs.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">{withLive(SPV_CARDS, "SPV_ADMINISTRATION", q.data).map((c) => <CardView key={c.key} c={c} />)}</div>
      </div>
      <div>
        <h2 className="text-2xl">Fund Administration</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Software, people and execution for funds — know exactly what is being handled.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{withLive(FUND_CARDS, "FUND_ADMINISTRATION", q.data).map((c) => <CardView key={c.key} c={c} />)}</div>
        <p className="mt-3 text-xs text-muted-foreground">SPV Core and Fund Core are different packages.</p>
      </div>
    </section>
  );
}
