export type PortfolioPosition = { id: string; offeringId: string; fundName: string; assetName: string; issuerName: string; assetClass: string; costCents: number | null; valueCents: number | null; effectiveDate: string | null; currency: string; monitoring: Record<string,any> };
export function portfolioSummary(rows: PortfolioPosition[]) {
  const currencies = new Set(rows.map(r=>r.currency));
  const known = rows.filter(r=>r.valueCents !== null);
  return { positions: rows.length, valued: known.length, currency: currencies.size === 1 ? rows[0]?.currency ?? null : null, valueCents: rows.length && currencies.size === 1 && known.length === rows.length ? known.reduce((s,r)=>s+Number(r.valueCents),0) : null, costCents: rows.length && currencies.size === 1 && rows.every(r=>r.costCents!==null) ? rows.reduce((s,r)=>s+Number(r.costCents),0) : null };
}
export function portfolioAttention(r: PortfolioPosition, asOf: string) {
  const reasons: string[]=[];
  if(r.valueCents === null) reasons.push('No effective valuation');
  if(r.monitoring["watchlist"]) reasons.push('Watchlist');
  if(r.monitoring["nextReportDue"] && r.monitoring["nextReportDue"] < asOf) reasons.push('Report overdue');
  if(r.monitoring["riskRating"] === 'high' || r.monitoring["riskRating"] === 'critical') reasons.push('Elevated recorded risk');
  for(const k of r.monitoring["kpis"] ?? []) if(k.threshold !== null && k.threshold !== undefined && (k.direction === 'above' ? k.value > k.threshold : k.value < k.threshold)) reasons.push(`${k.metric} threshold breached`);
  return reasons;
}

export type ExposureDimension = 'assetClass' | 'fund' | 'vintage' | 'risk' | 'stage';
export type ExposureSlice = { key: string; label: string; positions: number; valueCents: number; share: number };
/** Groups positions for exposure charts. Value uses approved marks only; unmarked positions count but add no value. */
export function exposureBreakdown(rows: PortfolioPosition[], dimension: ExposureDimension): ExposureSlice[] {
  const keyOf = (r: PortfolioPosition): [string, string] => {
    const m = r.monitoring ?? {};
    if (dimension === 'fund') return [r.offeringId, r.fundName];
    if (dimension === 'vintage') return m['vintageYear'] ? [String(m['vintageYear']), String(m['vintageYear'])] : ['none', 'Not recorded'];
    if (dimension === 'risk') return m['riskRating'] ? [String(m['riskRating']), String(m['riskRating'])] : ['none', 'Not rated'];
    if (dimension === 'stage') return m['stage'] ? [String(m['stage']), String(m['stage'])] : ['none', 'Not recorded'];
    return [r.assetClass, String(r.assetClass ?? 'other').replaceAll('_', ' ')];
  };
  const map = new Map<string, ExposureSlice>();
  for (const r of rows) {
    const [key, label] = keyOf(r);
    const s = map.get(key) ?? { key, label, positions: 0, valueCents: 0, share: 0 };
    s.positions += 1; s.valueCents += r.valueCents ?? 0; map.set(key, s);
  }
  const total = [...map.values()].reduce((a, s) => a + s.valueCents, 0);
  return [...map.values()].map(s => ({ ...s, share: total > 0 ? Math.round((s.valueCents / total) * 1000) / 10 : 0 })).sort((a, b) => b.valueCents (a.valueCents || b.positions) a.positions);
}
/** Largest single-slice share of value, for concentration warnings. */
export function topConcentration(slices: ExposureSlice[]) { return slices.reduce((m, s) => Math.max(m, s.share), 0); }
