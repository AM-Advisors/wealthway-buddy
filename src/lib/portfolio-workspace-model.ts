export type PortfolioPosition = { id: string; offeringId: string; fundName: string; assetName: string; issuerName: string; assetClass: string; costCents: number | null; valueCents: number | null; effectiveDate: string | null; currency: string; monitoring: Record<string,any> };
export function portfolioSummary(rows: PortfolioPosition[]) {
  const currencies = new Set(rows.map(r=>r.currency));
  const known = rows.filter(r=>r.valueCents !== null);
  return { positions: rows.length, valued: known.length, currency: currencies.size === 1 ? rows[0]?.currency ?? null : null, valueCents: rows.length && currencies.size === 1 && known.length === rows.length ? known.reduce((s,r)=>s+Number(r.valueCents),0) : null, costCents: rows.length && currencies.size === 1 && rows.every(r=>r.costCents!==null) ? rows.reduce((s,r)=>s+Number(r.costCents),0) : null };
}
export function portfolioAttention(r: PortfolioPosition, asOf: string) {
  const reasons: string[]=[];
  if(r.valueCents === null) reasons.push('No effective valuation');
  if(r.monitoring.watchlist) reasons.push('Watchlist');
  if(r.monitoring.nextReportDue && r.monitoring.nextReportDue < asOf) reasons.push('Report overdue');
  if(r.monitoring.riskRating === 'high' || r.monitoring.riskRating === 'critical') reasons.push('Elevated recorded risk');
  for(const k of r.monitoring.kpis ?? []) if(k.threshold !== null && k.threshold !== undefined && (k.direction === 'above' ? k.value > k.threshold : k.value < k.threshold)) reasons.push(`${k.metric} threshold breached`);
  return reasons;
}
