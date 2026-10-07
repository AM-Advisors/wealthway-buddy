import { useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CALCULATOR_ITEMS, SPV_RAISE_TIERS, spvFeeForRaise } from "@/lib/marketing/site-config";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const INCLUDED_INVESTORS = 20;
const EXTRA_INVESTOR_USD = 50;

/** Public estimate: raise-based SPV fee plus basic fixed add-ons. Custom items are flagged for a quote. */
export function PricingCalculator() {
  const [raise, setRaise] = useState("500000");
  const [mgmtFee, setMgmtFee] = useState("2");
  const [carry, setCarry] = useState("20");
  const [investors, setInvestors] = useState("10");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [on, setOn] = useState<Record<string, boolean>>({});

  const raiseUsd = Math.max(0, Number(raise.replace(/[^\d.]/g, "")) || 0);
  const tier = spvFeeForRaise(raiseUsd);
  const investorCount = Math.max(0, Number(investors.replace(/[^\d]/g, "")) || 0);
  const extraInvestors = Math.max(0, investorCount - INCLUDED_INVESTORS);
  const investorFee = extraInvestors * EXTRA_INVESTOR_USD;

  const totals = useMemo(() => {
    let oneTime = 2500 + (tier?.feeUsd ?? 0) + investorFee;
    let yearly = 0;
    const custom: string[] = [];
    for (const i of CALCULATOR_ITEMS) {
      if (i.kind === "count") oneTime += (counts[i.key] ?? 0) * (i.amountUsd ?? 0);
      else if (i.kind === "toggle" && on[i.key]) {
        if (i.unit === "year") yearly += i.amountUsd ?? 0;
        else if (i.unit === "month") yearly += (i.amountUsd ?? 0) * 12;
        else oneTime += i.amountUsd ?? 0;
      } else if (i.kind === "custom" && on[i.key]) custom.push(i.name);
    }
    return { oneTime, yearly, custom };
  }, [tier, investorFee, counts, on]);

  return (
    <section className="mt-12 rounded-xl border bg-card p-6" aria-labelledby="calc-title">
      <h2 id="calc-title" className="text-xl">SPV cost calculator</h2>
      <p className="mt-1 text-sm text-muted-foreground">An estimate for planning. Your statement of work sets the final price.</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div>
            <label htmlFor="raise" className="text-sm font-medium">How much is the SPV raising?</label>
            <Input id="raise" inputMode="numeric" className="mt-2 max-w-xs" value={raise ? Number(raise).toLocaleString("en-US") : ""} onChange={(e) => setRaise(e.target.value.replace(/[^\d]/g, ""))} />
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {SPV_RAISE_TIERS.map((t) => (
                <span key={t.label} className={`rounded-full border px-3 py-1 ${t === tier ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {t.label}: {usd(t.feeUsd)}
                </span>
              ))}
              <span className={`rounded-full border px-3 py-1 ${tier == null ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                $10,000,000+: Custom
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="mgmt-fee" className="text-sm font-medium">Management fee (%)</label>
              <Input id="mgmt-fee" inputMode="decimal" className="mt-2" value={mgmtFee} onChange={(e) => setMgmtFee(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <div>
              <label htmlFor="carry" className="text-sm font-medium">Carried interest (%)</label>
              <Input id="carry" inputMode="decimal" className="mt-2" value={carry} onChange={(e) => setCarry(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <div>
              <label htmlFor="investors" className="text-sm font-medium">Number of investors</label>
              <Input id="investors" inputMode="numeric" className="mt-2" value={investors} onChange={(e) => setInvestors(e.target.value.replace(/[^\d]/g, ""))} />
              <p className="mt-1 text-xs text-muted-foreground">{INCLUDED_INVESTORS} included, then {usd(EXTRA_INVESTOR_USD)} per additional investor.</p>
            </div>
          </div>

          <div>
            <h3 className="text-base">Basic add-ons</h3>
            <ul className="mt-3 space-y-3">
              {CALCULATOR_ITEMS.filter((i) => i.kind !== "custom").map((i) => (
                <li key={i.key} className="flex items-center justify-between gap-4 text-sm">
                  {i.kind === "count" ? (
                    <>
                      <span>{i.name} <span className="text-muted-foreground">({i.note})</span></span>
                      <Input type="number" min={0} max={50} aria-label={i.name} className="h-9 w-20" value={counts[i.key] ?? 0} onChange={(e) => setCounts({ ...counts, [i.key]: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} />
                    </>
                  ) : (
                    <label className="flex w-full items-center justify-between gap-4">
                      <span className="flex items-center gap-2"><Checkbox checked={Boolean(on[i.key])} onCheckedChange={(c) => setOn({ ...on, [i.key]: Boolean(c) })} />{i.name}</span>
                      <span className="text-muted-foreground">{usd(i.amountUsd ?? 0)} / {i.unit}</span>
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-base">Custom services</h3>
            <p className="text-xs text-muted-foreground">Priced for your fund. Tick any you need and we'll include them in your quote.</p>
            <ul className="mt-3 space-y-2">
              {CALCULATOR_ITEMS.filter((i) => i.kind === "custom").map((i) => (
                <li key={i.key}>
                  <label className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2"><Checkbox checked={Boolean(on[i.key])} onCheckedChange={(c) => setOn({ ...on, [i.key]: Boolean(c) })} />{i.name}</span>
                    <span className="text-muted-foreground">Custom</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="h-fit rounded-lg bg-muted/50 p-5 text-sm">
          <div className="flex justify-between"><span>Setup fee</span><span>{usd(2500)}</span></div>
          <div className="mt-2 flex justify-between"><span>SPV ({tier ? tier.label : "$10,000,000+"})</span><span>{tier ? usd(tier.feeUsd) : "Custom"}</span></div>
          <div className="mt-2 flex justify-between"><span>Management fee / carry</span><span>{mgmtFee || "0"}% / {carry || "0"}%</span></div>
          <div className="mt-2 flex justify-between"><span>Investors ({investorCount})</span><span>{investorFee ? usd(investorFee) : "Included"}</span></div>
          <div className="mt-4 flex justify-between border-t pt-3 text-base font-medium"><span>One-time estimate</span><span>{usd(totals.oneTime)}{tier == null ? " + custom" : ""}</span></div>
          <div className="mt-2 flex justify-between"><span>Ongoing per year</span><span>{usd(totals.yearly)}</span></div>
          {totals.custom.length ? <p className="mt-4 text-xs text-muted-foreground">Plus custom pricing for: {totals.custom.join(", ")}.</p> : null}
          <p className="mt-4 text-xs text-muted-foreground">State filing fees are billed at cost.</p>
        </aside>
      </div>
    </section>
  );
}
