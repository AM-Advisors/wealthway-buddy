/** Pure, integer-cent commission basis. Actual entries replace estimates, including explicit zeroes. */
export type CostEntry = { id: string; invoice_id?: string | null; sow_id?: string | null; service_key: string; kind: "provider" | "deal"; amount_cents: number; supersedes_id?: string | null };
export type CostSettings = { service_cost_pct: Record<string, number>; overhead_pct: number; effective_at: string };
export function settingsAt(versions: CostSettings[], at: string): CostSettings {
  return [...versions].filter(v => v.effective_at <= at).sort((a, b) => a.effective_at.localeCompare(b.effective_at)).at(-1) ?? { service_cost_pct: {}, overhead_pct: 0, effective_at: "" };
}
export function activeCosts(entries: CostEntry[]) {
  const superseded = new Set(entries.map(e => e.supersedes_id).filter(Boolean));
  return entries.filter(e => !superseded.has(e.id));
}
export function commissionProfit(input: { revenueCents: number; passThroughCents?: number; actualCosts?: number[]; costPct?: number; rates: number[]; processingFeeCents?: number; overheadPct?: number }) {
  const revenueCents = input.revenueCents;
  const costCents = input.actualCosts?.length ? input.actualCosts.reduce((s, n) => s + n, 0) : Math.round(revenueCents * (input.costPct ?? 0) / 100);
  const grossProfitCents = Math.max(0, revenueCents - (input.passThroughCents ?? 0) - costCents);
  const commissions = input.rates.map(rate => Math.round(grossProfitCents * rate / 100));
  const commissionCents = commissions.reduce((s, n) => s + n, 0);
  return { revenueCents, grossProfitCents, netProfitCents: grossProfitCents - commissionCents - (input.processingFeeCents ?? 0) - Math.round(revenueCents * (input.overheadPct ?? 0) / 100), commissionCents, commissions };
}
/** Allocate invoice/SOW service costs once, proportionally over matching service revenue. */
export function lineActualCosts(entries: CostEntry[], invoiceId: string, sowId: string | null, serviceKey: string, revenue: number, invoiceServiceRevenue: number, sowServiceRevenue: number) {
  return activeCosts(entries).filter(e => e.service_key === serviceKey && (e.invoice_id === invoiceId || (!e.invoice_id && sowId && e.sow_id === sowId))).map(e => Math.round(Number(e.amount_cents) * revenue / Math.max(1, e.invoice_id ? invoiceServiceRevenue : sowServiceRevenue)));
}
