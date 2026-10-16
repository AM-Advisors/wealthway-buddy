import { useState } from "react";
import { BILLING_LABEL, PRODUCTS, type Line, type Price } from "@/lib/product-pricing";

const fmt = (p: Price) => (p.amount == null ? p.note ?? "Custom quote" : p.amount === 0 ? p.note ?? "Included" : `${p.note === "from" ? "From " : ""}$${p.amount.toLocaleString("en-US")}${p.note && p.note !== "from" ? ` ${p.note}` : ""}`);

function Lines({ title, lines }: { title: string; lines: Line[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="mt-2 divide-y rounded-xl border bg-card">
        {lines.map((l) => (
          <li key={l.name} className="flex items-start justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{l.name}</p>
              {l.description ? <p className="text-sm text-muted-foreground">{l.description}</p> : null}
              {l.items?.length ? <p className="mt-1 text-xs text-muted-foreground">{l.items.join(" · ")}</p> : null}
            </div>
            <div className="shrink-0 text-right text-sm">
              {l.prices.map((p, i) => <p key={i}><span className="font-medium">{fmt(p)}</span> <span className="text-muted-foreground">{BILLING_LABEL[p.billing].toLowerCase()}</span></p>)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Per-product pricing: Fund cost, Fund Administration, Servicing (client / investor), À la carte. */
export function ProductPricing() {
  const [key, setKey] = useState(PRODUCTS[0]!.key);
  const p = PRODUCTS.find((x) => x.key === key) ?? PRODUCTS[0]!;
  return (
    <section className="mt-12 space-y-6">
      <h2 className="text-2xl">Pricing by product</h2>
      <div role="tablist" className="flex flex-wrap gap-2">
        {PRODUCTS.map((x) => (
          <button key={x.key} role="tab" aria-selected={x.key === key} onClick={() => setKey(x.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${x.key === key ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`}>{x.name}</button>
        ))}
      </div>
      <p className="text-muted-foreground">{p.intro}</p>
      <Lines title="1 · Fund cost" lines={p.fundCost} />
      <Lines title="2 · Fund Administration" lines={p.administration} />
      <Lines title="3 · Client servicing" lines={p.servicing.client} />
      <Lines title="3 · Investor servicing" lines={p.servicing.investor} />
      <Lines title="4 · À la carte" lines={p.alaCarte} />
    </section>
  );
}
