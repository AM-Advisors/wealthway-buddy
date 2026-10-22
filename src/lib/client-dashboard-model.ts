/** Pure bucketing for the client dashboard insights. Integer cents only; read-only summaries. */
export type Period = "deal" | "month" | "quarter" | "year" | "all";
export const PERIODS: Period[] = ["deal", "month", "quarter", "year", "all"];
export const PERIOD_LABEL: Record<Period, string> = { deal: "Per deal", month: "Month", quarter: "Quarter", year: "Year", all: "All time" };

export type Fact = {
  kind: "cost_invoiced" | "cost_paid" | "raised_committed" | "raised_funded" | "fee_earned" | "carry_earned";
  fundId: string | null;
  fundName: string;
  service?: string | null;
  date: string; // YYYY-MM-DD
  cents: number;
};

export type Bucket = { key: string; label: string; costInvoiced: number; costPaid: number; committed: number; funded: number; fees: number; carry: number; earned: number; net: number };

export function bucketKey(date: string, period: Period, fundName = ""): { key: string; label: string } {
  const [y, m] = date.slice(0, 7).split("-");
  if (period === "deal") return { key: fundName || "Unassigned", label: fundName || "Unassigned" };
  if (period === "all") return { key: "all", label: "All time" };
  if (period === "year") return { key: y, label: y };
  if (period === "quarter") { const q = Math.floor((Number(m) - 1) / 3) + 1; return { key: `${y}-Q${q}`, label: `Q${q} ${y}` }; }
  const label = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return { key: `${y}-${m}`, label };
}

export function filterFacts(facts: Fact[], f: { fundId?: string | null; service?: string | null }): Fact[] {
  return facts.filter((x) => (!f.fundId || x.fundId === f.fundId) && (!f.service || x.kind.startsWith("cost") === false || x.service === f.service));
}

export function bucketize(facts: Fact[], period: Period): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const f of facts) {
    if (!f.date || !Number.isFinite(f.cents)) continue;
    const { key, label } = bucketKey(f.date, period, f.fundName);
    const b = map.get(key) ?? { key, label, costInvoiced: 0, costPaid: 0, committed: 0, funded: 0, fees: 0, carry: 0, earned: 0, net: 0 };
    const c = Math.round(f.cents);
    if (f.kind === "cost_invoiced") b.costInvoiced += c;
    else if (f.kind === "cost_paid") b.costPaid += c;
    else if (f.kind === "raised_committed") b.committed += c;
    else if (f.kind === "raised_funded") b.funded += c;
    else if (f.kind === "fee_earned") b.fees += c;
    else if (f.kind === "carry_earned") b.carry += c;
    map.set(key, b);
  }
  const out = [...map.values()].map((b) => ({ ...b, earned: b.fees + b.carry, net: b.fees + b.carry - b.costInvoiced }));
  return period === "deal" ? out.sort((a, b) => b.earned - a.earned || a.label.localeCompare(b.label)) : out.sort((a, b) => a.key.localeCompare(b.key));
}

export function totals(facts: Fact[]): Bucket { return bucketize(facts, "all")[0] ?? { key: "all", label: "All time", costInvoiced: 0, costPaid: 0, committed: 0, funded: 0, fees: 0, carry: 0, earned: 0, net: 0 }; }

export function byService(facts: Fact[]): { service: string; invoiced: number; paid: number }[] {
  const m = new Map<string, { service: string; invoiced: number; paid: number }>();
  for (const f of facts) {
    if (f.kind !== "cost_invoiced" && f.kind !== "cost_paid") continue;
    const s = f.service || "Other services";
    const r = m.get(s) ?? { service: s, invoiced: 0, paid: 0 };
    if (f.kind === "cost_invoiced") r.invoiced += f.cents; else r.paid += f.cents;
    m.set(s, r);
  }
  return [...m.values()].sort((a, b) => b.invoiced - a.invoiced);
}

/** Dashboard cards a person may show, hide and reorder. */
export const DASHBOARD_CARDS = [
  { id: "attention", label: "Needs your attention" },
  { id: "summary", label: "Summary tiles" },
  { id: "insights", label: "Costs and earnings charts" },
  { id: "services", label: "Costs by service" },
  { id: "funds", label: "Fund comparison" },
  { id: "records", label: "Funds, requests and invoices" },
  { id: "sow", label: "Statements of work" },
  { id: "captables", label: "Cap tables" },
] as const;
export type CardId = (typeof DASHBOARD_CARDS)[number]["id"];
export const DEFAULT_ORDER: CardId[] = DASHBOARD_CARDS.map((c) => c.id);

/** Merge a saved order with the known cards: unknown ids dropped, new cards appended. */
export function resolveLayout(saved: unknown, hidden: unknown): { order: CardId[]; hidden: CardId[] } {
  const known = new Set<string>(DEFAULT_ORDER);
  const order = (Array.isArray(saved) ? saved : []).filter((x): x is CardId => typeof x === "string" && known.has(x));
  const dedup = [...new Set(order)];
  for (const id of DEFAULT_ORDER) if (!dedup.includes(id)) dedup.push(id);
  const hid = [...new Set((Array.isArray(hidden) ? hidden : []).filter((x): x is CardId => typeof x === "string" && known.has(x) && x !== "attention"))];
  return { order: dedup, hidden: hid };
}
