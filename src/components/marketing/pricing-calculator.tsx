import { useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CALCULATOR_ITEMS, SPV_RAISE_TIERS, spvFeeForRaise } from "@/lib/marketing/site-config";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Public estimate: raise-based SPV fee plus basic fixed add-ons. Custom items are flagged for a quote. */
export function PricingCalculator() {
  const [raise, setRaise] = useState("500000");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [on, setOn] = useState<Record<string, boolean>>({});

  const raiseUsd = Math.max(0, Number(raise.replace(/[^\d.]/g, "")) || 0);
  const tier = spvFeeForRaise(raiseUsd);

  const totals = useMemo(() => {
    let oneTime = 2500 + tier.feeUsd;
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
  }, [tier, counts, on]);

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
          <div className="mt-2 flex justify-between"><span>SPV ({tier.label})</span><span>{usd(tier.feeUsd)}</span></div>
          <div className="mt-4 flex justify-between border-t pt-3 text-base font-medium"><span>One-time estimate</span><span>{usd(totals.oneTime)}</span></div>
          <div className="mt-2 flex justify-between"><span>Ongoing per year</span><span>{usd(totals.yearly)}</span></div>
          {totals.custom.length ? <p className="mt-4 text-xs text-muted-foreground">Plus custom pricing for: {totals.custom.join(", ")}.</p> : null}
          <p className="mt-4 text-xs text-muted-foreground">Investor Onboarding is included with SPVs. State filing fees are billed at cost.</p>
        </aside>
      </div>
    </section>
  );
}
