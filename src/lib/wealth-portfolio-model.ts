/**
 * Consolidated portfolio projection (pure). Owner-recorded holdings, imported
 * rows, connected balances (only when live) and published fund records are
 * combined into one look-through view. Nothing here posts fund books, moves
 * money or invents a value: missing data stays missing and is flagged.
 */
import type { PdfDocSpec } from './pdf-render';
import {
  contributionFlow,
  distributionFlow,
  terminalFlow,
  xirr,
  privateMarketMultiples,
  timeWeightedReturn,
  daysBetween,
  type DatedCashFlow,
  type Subperiod,
} from './performance-model';

export const STALE_VALUE_DAYS = 120;
export const MIN_TWR_VALUES = 3;
export const SELF = 'self';

export type DataSource = 'manual' | 'import' | 'fund_records' | 'connected';
export const SOURCE_LABELS: Record<DataSource, string> = {
  manual: 'Entered manually',
  import: 'Imported',
  fund_records: 'From fund records',
  connected: 'Connected account',
};
export const ENTITY_TYPES = ['trust', 'llc', 'partnership', 'corporation', 'ira', 'foundation', 'other'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const ENTITY_TYPE_LABELS: Record<EntityType, string> = { trust: 'Trust', llc: 'LLC', partnership: 'Partnership', corporation: 'Corporation', ira: 'IRA', foundation: 'Foundation', other: 'Other entity' };
export const ASSET_CLASS_LABELS: Record<string, string> = { cash: 'Cash', public_equity: 'Public equity', fixed_income: 'Fixed income', private_fund: 'Private fund', real_estate: 'Real estate', business: 'Private business', other: 'Other' };
export const NOT_RECORDED = 'Not recorded';

export type PortfolioEntity = { recordId: string; name: string; entityType: EntityType; investmentProfileId: string | null; rowId?: string };
export type OwnershipLink = { recordId: string; parentId: string; childId: string; pctBps: number | null; rowId?: string };
export type PortfolioHolding = {
  holdingId: string; observationId?: string; sourceNote?: string; name: string; assetClass: string; currency: string;
  valueCents: number | null; costCents: number | null; asOf: string; source: DataSource;
  sector: string | null; geography: string | null; holderEntityId: string | null; representsEntityId: string | null;
  /** Earlier dated values of the same holding, oldest first, for value history. */
  history?: { asOf: string; valueCents: number | null }[];
};
export type FundPosition = {
  positionId: string; offeringId: string; fundName: string; investmentProfileId: string | null; profileLabel: string | null;
  commitmentCents: number; contributedCents: number; distributionsCents: number; unfundedCents: number;
  valueCents: number | null; valueDate: string | null;
  valuations: { date: string; valueCents: number }[];
  flows: { id: string; date: string; kind: 'contribution' | 'distribution'; amountCents: number }[];
};
export type PrivateCommitment = { recordId: string; name: string; currency: string; commitmentCents: number; holderEntityId: string | null; holdingId: string | null; startDate: string; rowId?: string };
export type PrivateCashFlow = { recordId: string; commitmentId: string; date: string; flowType: 'contribution' | 'distribution'; status: 'actual' | 'projected'; amountCents: number; note: string; source: DataSource; rowId?: string };
export type ProjectedItem = { id: string; kind: 'capital_call' | 'distribution'; name: string; currency: string; amountCents: number | null; date: string | null; source: DataSource };
export type PersonalCash = { id: string; name: string; currency: string; amountCents: number; date: string; direction: 'inflow' | 'outflow' };

export type Issue = { code: string; severity: 'warning' | 'info'; message: string; ref?: string };

// ------------------------------------------------------------- ownership

/**
 * Effective share (0..1) of each entity owned by the portfolio owner, summed
 * over every ownership path from "self". Missing percentages, cycles,
 * unreachable entities and over-allocated entities are reported, never guessed.
 */
export function ownershipShares(entities: PortfolioEntity[], links: OwnershipLink[]) {
  const issues: Issue[] = [];
  const ids = new Set(entities.map(e => e.recordId));
  const name = (id: string) => entities.find(e => e.recordId === id)?.name ?? 'Unknown entity';
  const children = new Map<string, OwnershipLink[]>();
  for (const l of links) {
    if (!ids.has(l.childId) || (l.parentId !== SELF && !ids.has(l.parentId))) { issues.push({ code: 'ownership_unknown_entity', severity: 'warning', message: 'An ownership record points to an entity that is no longer on file.', ref: l.recordId }); continue; }
    if (l.pctBps === null) { issues.push({ code: 'ownership_missing_pct', severity: 'warning', message: `Ownership percentage missing for ${name(l.childId)}${l.parentId === SELF ? '' : ` held by ${name(l.parentId)}`}.`, ref: l.recordId }); continue; }
    const list = children.get(l.parentId) ?? []; list.push(l); children.set(l.parentId, list);
  }
  for (const e of entities) {
    const total = links.filter(l => l.childId === e.recordId && l.pctBps !== null).reduce((n, l) => n + (l.pctBps ?? 0), 0);
    if (total > 10000) issues.push({ code: 'ownership_over_100', severity: 'warning', message: `Recorded owners of ${e.name} add up to ${(total / 100).toFixed(2)}%, more than 100%.`, ref: e.recordId });
  }
  const shares = new Map<string, number>();
  let cycle = false;
  const walk = (node: string, factor: number, path: Set<string>) => {
    for (const l of children.get(node) ?? []) {
      if (path.has(l.childId)) { cycle = true; continue; }
      const f = factor * Math.min(10000, l.pctBps ?? 0) / 10000;
      shares.set(l.childId, (shares.get(l.childId) ?? 0) + f);
      walk(l.childId, f, new Set([...path, l.childId]));
    }
  };
  walk(SELF, 1, new Set([SELF]));
  if (cycle) issues.push({ code: 'ownership_cycle', severity: 'warning', message: 'Ownership records loop back on themselves; the loop is ignored.' });
  for (const e of entities) {
    if (!shares.has(e.recordId) && !links.some(l => l.childId === e.recordId && l.pctBps === null)) issues.push({ code: 'ownership_unlinked', severity: 'warning', message: `${e.name} is not linked to you, so its holdings are not counted.`, ref: e.recordId });
    const s = shares.get(e.recordId);
    if (s !== undefined && s > 1.0000001) issues.push({ code: 'ownership_over_100', severity: 'warning', message: `Your effective share of ${e.name} is more than 100%; check the ownership records.`, ref: e.recordId });
  }
  for (const [k, v] of shares) shares.set(k, Math.min(1, v));
  return { shares, issues };
}

// ------------------------------------------------------------- look-through lines

export type PortfolioLine = {
  key: string; kind: 'holding' | 'fund' | 'connected'; name: string; holder: string;
  assetClass: string; sector: string; geography: string; currency: string;
  grossValueCents: number | null; sharePct: number; valueCents: number | null; costCents: number | null;
  valueDate: string | null; source: DataSource; counted: boolean; excludedReason: string | null; holdingId: string | null; positionId: string | null;
  observationId: string | null; holderEntityId: string | null; representsEntityId: string | null;
};
export type ConnectedAccount = { id: string; name: string; currency: string; balanceCents: number | null; accountType: string; observedAt: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function lookThroughLines(input: { entities: PortfolioEntity[]; links: OwnershipLink[]; holdings: PortfolioHolding[]; funds: FundPosition[]; connected: ConnectedAccount[] }) {
  const { shares, issues } = ownershipShares(input.entities, input.links);
  const entityName = (id: string | null) => id ? input.entities.find(e => e.recordId === id)?.name ?? 'Unknown entity' : 'You directly';
  const shareOf = (id: string | null) => id === null ? 1 : (shares.get(id) ?? 0);
  const entityHasContent = (id: string) => input.holdings.some(h => h.holderEntityId === id) || input.funds.some(f => profileEntity(input.entities, f.investmentProfileId) === id);
  const lines: PortfolioLine[] = [];
  for (const h of input.holdings) {
    const known = h.holderEntityId === null || input.entities.some(e => e.recordId === h.holderEntityId);
    const share = known ? shareOf(h.holderEntityId) : 0;
    let excluded: string | null = null;
    if (!known) excluded = 'Held by an entity that is no longer on file.';
    else if (h.representsEntityId && entityHasContent(h.representsEntityId)) excluded = `Already counted through ${entityName(h.representsEntityId)}'s own holdings.`;
    else if (share === 0) excluded = 'Ownership incomplete, so this is not counted.';
    lines.push({ key: `holding:${h.holdingId}`, kind: 'holding', name: h.name, holder: entityName(h.holderEntityId), assetClass: h.assetClass, sector: h.sector?.trim() || NOT_RECORDED, geography: h.geography?.trim() || NOT_RECORDED, currency: h.currency,
      grossValueCents: h.valueCents, sharePct: share, valueCents: excluded || h.valueCents === null ? null : Math.round(h.valueCents * share), costCents: h.costCents === null ? null : Math.round(h.costCents * share),
      valueDate: h.asOf, source: h.source, counted: !excluded, excludedReason: excluded, holdingId: h.holdingId, positionId: null, observationId: h.observationId ?? null, holderEntityId: h.holderEntityId, representsEntityId: h.representsEntityId });
    if (h.representsEntityId && !entityHasContent(h.representsEntityId)) issues.push({ code: 'represents_empty_entity', severity: 'info', message: `${h.name} is marked as your interest in ${entityName(h.representsEntityId)}, which has no holdings recorded, so the interest itself is counted.`, ref: h.holdingId });
  }
  const seenPositions = new Set<string>();
  for (const f of input.funds) {
    if (seenPositions.has(f.positionId)) continue; seenPositions.add(f.positionId);
    const holderId = profileEntity(input.entities, f.investmentProfileId);
    const share = shareOf(holderId);
    const excluded = share === 0 ? 'Ownership incomplete, so this is not counted.' : null;
    lines.push({ key: `fund:${f.positionId}`, kind: 'fund', name: f.fundName, holder: holderId ? entityName(holderId) : (f.profileLabel || 'You directly'), assetClass: 'private_fund', sector: NOT_RECORDED, geography: NOT_RECORDED, currency: 'USD',
      grossValueCents: f.valueCents, sharePct: share, valueCents: excluded || f.valueCents === null ? null : Math.round(f.valueCents * share), costCents: Math.round(f.contributedCents * share),
      valueDate: f.valueDate, source: 'fund_records', counted: !excluded, excludedReason: excluded, holdingId: null, positionId: f.positionId, observationId: null, holderEntityId: holderId, representsEntityId: null });
  }
  for (const a of input.connected) {
    lines.push({ key: `connected:${a.id}`, kind: 'connected', name: a.name, holder: 'You directly', assetClass: a.accountType === 'depository' ? 'cash' : 'public_equity', sector: NOT_RECORDED, geography: NOT_RECORDED, currency: a.currency,
      grossValueCents: a.balanceCents, sharePct: 1, valueCents: a.balanceCents, costCents: null, valueDate: a.observedAt.slice(0, 10), source: 'connected', counted: true, excludedReason: null, holdingId: null, positionId: null, observationId: null, holderEntityId: null, representsEntityId: null });
  }
  return { lines, issues, shares };
}

export function profileEntity(entities: PortfolioEntity[], profileId: string | null) {
  if (!profileId) return null;
  return entities.find(e => e.investmentProfileId === profileId)?.recordId ?? null;
}

// ------------------------------------------------------------- totals and allocation

export function totalsByCurrency(lines: PortfolioLine[]) {
  const currencies = [...new Set(lines.map(l => l.currency))].sort();
  return currencies.map(currency => {
    const rows = lines.filter(l => l.currency === currency && l.counted);
    return { currency, valueCents: rows.reduce((n, l) => n + (l.valueCents ?? 0), 0), missingValues: rows.filter(l => l.valueCents === null).length, lines: rows.length };
  });
}

export type AllocationDimension = 'assetClass' | 'sector' | 'geography' | 'currency';
export function allocation(lines: PortfolioLine[], dimension: AllocationDimension, currency: string) {
  const rows = lines.filter(l => l.counted && l.valueCents !== null && l.currency === currency);
  const total = rows.reduce((n, l) => n + (l.valueCents ?? 0), 0);
  const groups = new Map<string, number>();
  for (const l of rows) {
    const key = dimension === 'assetClass' ? (ASSET_CLASS_LABELS[l.assetClass] ?? l.assetClass) : dimension === 'currency' ? l.currency : l[dimension];
    groups.set(key, (groups.get(key) ?? 0) + (l.valueCents ?? 0));
  }
  return [...groups.entries()].map(([label, valueCents]) => ({ label, valueCents, pct: total > 0 ? Math.round(valueCents / total * 10000) / 100 : null })).sort((a, b) => b.valueCents - a.valueCents);
}
/** Currency allocation spans every currency, so values are never added across currencies. */
export function currencyExposure(lines: PortfolioLine[]) {
  return totalsByCurrency(lines).map(t => ({ label: t.currency, valueCents: t.valueCents }));
}

// ------------------------------------------------------------- data quality

export function dataQualityIssues(lines: PortfolioLine[], asOf: string, staleDays = STALE_VALUE_DAYS): Issue[] {
  const out: Issue[] = [];
  for (const l of lines) {
    if (!l.counted) continue;
    if (l.valueCents === null) out.push({ code: 'missing_value', severity: 'warning', message: `${l.name} has no value recorded.`, ref: l.key });
    else if (!l.valueDate) out.push({ code: 'missing_value_date', severity: 'warning', message: `${l.name} has no valuation date.`, ref: l.key });
    else if (daysBetween(l.valueDate, asOf) > staleDays) out.push({ code: 'stale_value', severity: 'warning', message: `${l.name} was last valued ${l.valueDate}, more than ${staleDays} days ago.`, ref: l.key });
    if (l.kind === 'holding' && l.assetClass !== 'cash' && (l.sector === NOT_RECORDED || l.geography === NOT_RECORDED)) out.push({ code: 'missing_classification', severity: 'info', message: `${l.name} has no ${l.sector === NOT_RECORDED ? 'sector' : 'region'} recorded, so it shows as "${NOT_RECORDED}" in allocation.`, ref: l.key });
  }
  const funds = lines.filter(l => l.kind === 'fund').map(l => norm(l.name));
  for (const l of lines) if (l.kind === 'holding' && l.counted && l.assetClass === 'private_fund' && funds.includes(norm(l.name))) out.push({ code: 'possible_duplicate_fund', severity: 'warning', message: `${l.name} looks like a fund already shown from fund records. If it is the same investment, archive the manual entry so it is not counted twice.`, ref: l.key });
  return out;
}

// ------------------------------------------------------------- performance

export type InvestmentPerformance = {
  key: string; name: string; currency: string; periodStart: string | null; periodEnd: string;
  paidInCents: number; distributionsCents: number; valueCents: number | null; valueDate: string | null;
  irr: { status: string; bps: number | null; detail: string };
  tvpi: number | null; dpi: number | null; rvpi: number | null;
  twr: { status: string; bps: number | null; detail: string } | null;
  warnings: string[];
};
export const PERFORMANCE_ASSUMPTIONS = [
  'Money-weighted return (XIRR) uses the actual dated contributions and distributions, plus the latest recorded value as a final amount on the valuation date.',
  'Multiples: TVPI = (distributions + value) / paid in; DPI = distributions / paid in; RVPI = value / paid in.',
  `Time-weighted return is shown only when at least ${MIN_TWR_VALUES} dated values exist; cash flows between two values are treated as occurring at the start of that period.`,
  'Projected capital calls and distributions are never included. No benchmarks are shown.',
  'Values in different currencies are never added together.',
];

export function investmentPerformance(input: { key: string; name: string; currency: string; asOf: string; flows: { id: string; date: string; kind: 'contribution' | 'distribution'; amountCents: number; source: string }[]; valuations: { date: string; valueCents: number | null }[] }): InvestmentPerformance {
  const flows = input.flows.filter(f => f.date <= input.asOf).sort((a, b) => a.date.localeCompare(b.date));
  const values = input.valuations.filter(v => v.date <= input.asOf && v.valueCents !== null).sort((a, b) => a.date.localeCompare(b.date)) as { date: string; valueCents: number }[];
  const latest = values[values.length - 1] ?? null;
  const paidIn = flows.filter(f => f.kind === 'contribution').reduce((n, f) => n + Math.abs(f.amountCents), 0);
  const dist = flows.filter(f => f.kind === 'distribution').reduce((n, f) => n + Math.abs(f.amountCents), 0);
  const warnings: string[] = [];
  if (!flows.length) warnings.push('No dated contributions or distributions are recorded, so returns cannot be calculated.');
  if (!latest) warnings.push('No dated value is recorded, so the final amount is unknown.');
  else if (daysBetween(latest.date, input.asOf) > STALE_VALUE_DAYS) warnings.push(`The latest value is from ${latest.date}, more than ${STALE_VALUE_DAYS} days before the report date.`);
  const dated: DatedCashFlow[] = flows.map(f => f.kind === 'contribution' ? contributionFlow(f.date, f.amountCents, f.source, f.id) : distributionFlow(f.date, f.amountCents, f.source, f.id));
  let irr: InvestmentPerformance['irr'];
  if (!flows.length || !latest) irr = { status: 'insufficient_data', bps: null, detail: 'Not enough dated data.' };
  else {
    const r = xirr([...dated, terminalFlow(latest.date >= (flows[flows.length - 1]?.date ?? '') ? latest.date : input.asOf, latest.valueCents, 'latest_value')]);
    irr = { status: r.status, bps: r.bps, detail: r.detail };
    if (latest.date < (flows[flows.length - 1]?.date ?? '')) warnings.push('Cash moved after the latest value date; the value may not reflect that activity.');
  }
  const m = privateMarketMultiples({ paidInCapitalCents: paidIn, distributionsCents: dist, residualValueCents: latest?.valueCents ?? 0 });
  let twr: InvestmentPerformance['twr'] = null;
  if (values.length >= MIN_TWR_VALUES) {
    const subperiods: Subperiod[] = [];
    for (let i = 1; i < values.length; i++) {
      const a = values[i - 1]!, b = values[i]!;
      const external = flows.filter(f => f.date > a.date && f.date <= b.date).reduce((n, f) => n + (f.kind === 'contribution' ? Math.abs(f.amountCents) : -Math.abs(f.amountCents)), 0);
      subperiods.push({ start: a.date, end: b.date, beginningValueCents: a.valueCents, externalFlowCents: external, endingValueCents: b.valueCents });
    }
    const r = timeWeightedReturn(subperiods);
    twr = { status: r.status, bps: r.bps, detail: r.detail };
  } else if (values.length) warnings.push(`Time-weighted return needs at least ${MIN_TWR_VALUES} dated values; ${values.length} recorded.`);
  return { key: input.key, name: input.name, currency: input.currency, periodStart: flows[0]?.date ?? values[0]?.date ?? null, periodEnd: latest && latest.date >= (flows[flows.length - 1]?.date ?? '') ? latest.date : input.asOf, paidInCents: paidIn, distributionsCents: dist, valueCents: latest?.valueCents ?? null, valueDate: latest?.date ?? null, irr, tvpi: paidIn > 0 && latest ? m.tvpi : null, dpi: paidIn > 0 ? m.dpi : null, rvpi: paidIn > 0 && latest ? m.rvpi : null, twr, warnings };
}

/** Combined private-investment XIRR per currency, from every investment with flows and a value. */
export function combinedPerformance(items: { currency: string; flows: { id: string; date: string; kind: 'contribution' | 'distribution'; amountCents: number; source: string }[]; latest: { date: string; valueCents: number } | null }[], asOf: string) {
  return [...new Set(items.map(i => i.currency))].sort().map(currency => {
    const set = items.filter(i => i.currency === currency && i.flows.length);
    const missing = set.filter(i => !i.latest).length;
    const flows: DatedCashFlow[] = set.flatMap(i => i.flows.filter(f => f.date <= asOf).map(f => f.kind === 'contribution' ? contributionFlow(f.date, f.amountCents, f.source, f.id) : distributionFlow(f.date, f.amountCents, f.source, f.id)));
    const terminal = set.filter(i => i.latest).map(i => { const last = i.flows.filter(f => f.date <= asOf).reduce((d, f) => f.date > d ? f.date : d, ''); return terminalFlow(i.latest!.date >= last ? i.latest!.date : asOf, i.latest!.valueCents, 'latest_value'); });
    const r = flows.length && !missing ? xirr([...flows, ...terminal]) : null;
    return { currency, investments: set.length, irr: r ? { status: r.status, bps: r.bps, detail: r.detail } : { status: 'insufficient_data', bps: null, detail: missing ? `${missing} investment(s) have no value recorded.` : 'No dated cash flows recorded.' } };
  });
}

// ------------------------------------------------------------- liquidity and cash

export function liquidity(input: { lines: PortfolioLine[]; funds: FundPosition[]; commitments: PrivateCommitment[]; privateFlows: PrivateCashFlow[]; projected: ProjectedItem[]; shares: Map<string, number>; entities: PortfolioEntity[]; asOf: string }) {
  const currencies = [...new Set([...input.lines.map(l => l.currency), ...input.commitments.map(c => c.currency), ...input.projected.map(p => p.currency), 'USD'])].sort();
  const share = (id: string | null) => id === null ? 1 : input.shares.get(id) ?? 0;
  return currencies.map(currency => {
    const cash = input.lines.filter(l => l.counted && l.currency === currency && l.assetClass === 'cash').reduce((n, l) => n + (l.valueCents ?? 0), 0);
    const fundUnfunded = currency === 'USD' ? input.funds.reduce((n, f) => n + Math.round(Math.max(0, f.unfundedCents) * share(profileEntity(input.entities, f.investmentProfileId))), 0) : 0;
    const outsideUnfunded = input.commitments.filter(c => c.currency === currency).reduce((n, c) => {
      const paid = input.privateFlows.filter(f => f.commitmentId === c.recordId && f.status === 'actual' && f.flowType === 'contribution' && f.date <= input.asOf).reduce((s, f) => s + f.amountCents, 0);
      return n + Math.round(Math.max(0, c.commitmentCents - paid) * share(c.holderEntityId));
    }, 0);
    const upcoming = input.projected.filter(p => p.currency === currency && (!p.date || p.date >= input.asOf)).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
    const calls = upcoming.filter(p => p.kind === 'capital_call').reduce((n, p) => n + (p.amountCents ?? 0), 0);
    const dists = upcoming.filter(p => p.kind === 'distribution').reduce((n, p) => n + (p.amountCents ?? 0), 0);
    return { currency, availableCashCents: cash, unfundedCents: fundUnfunded + outsideUnfunded, projectedCallsCents: calls, projectedDistributionsCents: dists, upcoming, unknownAmounts: upcoming.filter(p => p.amountCents === null).length };
  }).filter(r => r.availableCashCents || r.unfundedCents || r.upcoming.length || r.currency === 'USD');
}

export type CashActivity = { id: string; date: string; name: string; currency: string; direction: 'inflow' | 'outflow'; amountCents: number; source: DataSource | 'personal_record' };
export function cashActivity(input: { funds: FundPosition[]; commitments: PrivateCommitment[]; privateFlows: PrivateCashFlow[]; personal: PersonalCash[]; start: string; end: string }) {
  const out: CashActivity[] = [];
  for (const f of input.funds) for (const fl of f.flows) out.push({ id: `fund:${fl.id}`, date: fl.date, name: `${f.fundName} · ${fl.kind === 'contribution' ? 'contribution' : 'distribution'}`, currency: 'USD', direction: fl.kind === 'contribution' ? 'outflow' : 'inflow', amountCents: Math.abs(fl.amountCents), source: 'fund_records' });
  for (const fl of input.privateFlows) if (fl.status === 'actual') { const c = input.commitments.find(x => x.recordId === fl.commitmentId); if (c) out.push({ id: `private:${fl.recordId}`, date: fl.date, name: `${c.name} · ${fl.flowType}`, currency: c.currency, direction: fl.flowType === 'contribution' ? 'outflow' : 'inflow', amountCents: fl.amountCents, source: fl.source }); }
  for (const p of input.personal) out.push({ id: `personal:${p.id}`, date: p.date, name: p.name, currency: p.currency, direction: p.direction, amountCents: p.amountCents, source: 'personal_record' });
  return out.filter(r => r.date >= input.start && r.date <= input.end).sort((a, b) => b.date.localeCompare(a.date));
}

// ------------------------------------------------------------- periods

export function quarterOf(date: string) {
  const [y = 2026, m = 1] = date.split('-').map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  const startMonth = (q - 1) * 3 + 1;
  const end = new Date(Date.UTC(y, startMonth + 2, 0)).toISOString().slice(0, 10);
  return { label: `Q${q} ${y}`, start: `${y}-${String(startMonth).padStart(2, '0')}-01`, end };
}
/** The most recent quarter that has fully ended on or before the date. */
export function lastCompletedQuarter(today: string) {
  const q = quarterOf(today);
  if (q.end <= today) return q;
  const d = new Date(`${q.start}T00:00:00Z`); d.setUTCDate(0);
  return quarterOf(d.toISOString().slice(0, 10));
}

// ------------------------------------------------------------- full projection

export type PortfolioInput = {
  asOf: string; periodStart: string;
  entities: PortfolioEntity[]; links: OwnershipLink[]; holdings: PortfolioHolding[]; funds: FundPosition[];
  commitments: PrivateCommitment[]; privateFlows: PrivateCashFlow[]; projected: ProjectedItem[]; personalCash: PersonalCash[];
  connected: ConnectedAccount[]; connectedLive: boolean;
};

export function buildPortfolio(input: PortfolioInput) {
  const holdings = input.holdings.filter(h => h.asOf <= input.asOf);
  const { lines, issues, shares } = lookThroughLines({ entities: input.entities, links: input.links, holdings, funds: input.funds, connected: input.connectedLive ? input.connected : [] });
  const performance: InvestmentPerformance[] = [];
  const combinedInputs: Parameters<typeof combinedPerformance>[0] = [];
  for (const f of input.funds) {
    const s = shares.get(profileEntity(input.entities, f.investmentProfileId) ?? '') ?? (profileEntity(input.entities, f.investmentProfileId) ? 0 : 1);
    if (s === 0) continue;
    const flows = f.flows.map(x => ({ ...x, amountCents: Math.round(x.amountCents * s), source: 'fund_records' }));
    const valuations = f.valuations.map(v => ({ date: v.date, valueCents: Math.round(v.valueCents * s) }));
    const p = investmentPerformance({ key: `fund:${f.positionId}`, name: f.fundName, currency: 'USD', asOf: input.asOf, flows, valuations });
    performance.push(p);
    combinedInputs.push({ currency: 'USD', flows, latest: p.valueCents !== null && p.valueDate ? { date: p.valueDate, valueCents: p.valueCents } : null });
  }
  for (const c of input.commitments) {
    const s = c.holderEntityId === null ? 1 : shares.get(c.holderEntityId) ?? 0;
    if (s === 0) continue;
    const flows = input.privateFlows.filter(f => f.commitmentId === c.recordId && f.status === 'actual').map(f => ({ id: f.recordId, date: f.date, kind: f.flowType, amountCents: Math.round(f.amountCents * s), source: f.source }));
    const holding = c.holdingId ? input.holdings.find(h => h.holdingId === c.holdingId) : undefined;
    const valuations = holding ? [...(holding.history ?? []), { asOf: holding.asOf, valueCents: holding.valueCents }].map(v => ({ date: v.asOf, valueCents: v.valueCents === null ? null : Math.round(v.valueCents * s) })) : [];
    const p = investmentPerformance({ key: `private:${c.recordId}`, name: c.name, currency: c.currency, asOf: input.asOf, flows, valuations });
    if (!holding) p.warnings.push('Link this commitment to a holding so its value history can be used.');
    performance.push(p);
    combinedInputs.push({ currency: c.currency, flows, latest: p.valueCents !== null && p.valueDate ? { date: p.valueDate, valueCents: p.valueCents } : null });
  }
  const projected = [
    ...input.projected,
    ...input.privateFlows.filter(f => f.status === 'projected').map(f => { const c = input.commitments.find(x => x.recordId === f.commitmentId); return { id: `private:${f.recordId}`, kind: f.flowType === 'contribution' ? 'capital_call' as const : 'distribution' as const, name: c?.name ?? 'Private investment', currency: c?.currency ?? 'USD', amountCents: f.amountCents, date: f.date, source: f.source }; }),
  ];
  const quality = [...issues, ...dataQualityIssues(lines, input.asOf)];
  const currencies = [...new Set(lines.filter(l => l.counted).map(l => l.currency))].sort();
  return {
    asOf: input.asOf, periodStart: input.periodStart,
    totals: totalsByCurrency(lines),
    lines,
    entities: input.entities.map(e => ({ ...e, sharePct: shares.get(e.recordId) ?? 0 })),
    links: input.links,
    allocation: currencies.map(currency => ({ currency, assetClass: allocation(lines, 'assetClass', currency), sector: allocation(lines, 'sector', currency), geography: allocation(lines, 'geography', currency) })),
    currencyExposure: currencyExposure(lines),
    performance,
    combined: combinedPerformance(combinedInputs, input.asOf),
    assumptions: PERFORMANCE_ASSUMPTIONS,
    liquidity: liquidity({ lines, funds: input.funds, commitments: input.commitments, privateFlows: input.privateFlows, projected, shares, entities: input.entities, asOf: input.asOf }),
    cash: cashActivity({ funds: input.funds, commitments: input.commitments, privateFlows: input.privateFlows, personal: input.personalCash, start: input.periodStart, end: input.asOf }),
    commitments: input.commitments.map(c => {
      const flows = input.privateFlows.filter(f => f.commitmentId === c.recordId);
      const paid = flows.filter(f => f.status === 'actual' && f.flowType === 'contribution').reduce((n, f) => n + f.amountCents, 0);
      const dist = flows.filter(f => f.status === 'actual' && f.flowType === 'distribution').reduce((n, f) => n + f.amountCents, 0);
      return { ...c, paidInCents: paid, distributionsCents: dist, unfundedCents: Math.max(0, c.commitmentCents - paid), flows };
    }),
    funds: input.funds.map(f => ({ positionId: f.positionId, fundName: f.fundName, profileLabel: f.profileLabel, commitmentCents: f.commitmentCents, contributedCents: f.contributedCents, distributionsCents: f.distributionsCents, unfundedCents: f.unfundedCents, valueCents: f.valueCents, valueDate: f.valueDate, valuations: f.valuations })),
    issues: quality,
    connectedLive: input.connectedLive,
  };
}
export type PortfolioView = ReturnType<typeof buildPortfolio>;

// ------------------------------------------------------------- access

export type PortfolioAccess = { role: 'owner' | 'delegate' | 'staff'; canEdit: boolean };
/** Owner edits; a live delegation or staff reporting permission reads only. Fund management alone grants nothing. */
export function portfolioAccess(input: { actorId: string; ownerId: string; delegationAllowed: boolean; staffCanSee: boolean }): PortfolioAccess | null {
  if (!input.actorId || !input.ownerId) return null;
  if (input.actorId === input.ownerId) return { role: 'owner', canEdit: true };
  if (input.delegationAllowed) return { role: 'delegate', canEdit: false };
  if (input.staffCanSee) return { role: 'staff', canEdit: false };
  return null;
}

// ------------------------------------------------------------- CSV import

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

export const HOLDING_COLUMNS = ['name', 'asset_class', 'currency', 'value', 'cost', 'as_of', 'sector', 'region', 'held_by', 'source_note'] as const;
export const FLOW_COLUMNS = ['investment', 'date', 'type', 'status', 'amount', 'note'] as const;

const moneyCents = (v: string): number | null | 'invalid' => {
  const t = v.replace(/[$,\s]/g, '');
  if (t === '') return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return 'invalid';
  const n = Math.round(Number(t) * 100);
  return n < 0 ? 'invalid' : n;
};
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export function rowFingerprint(parts: (string | number | null)[]) {
  return parts.map(p => String(p ?? '').trim().toLowerCase()).join('|');
}

export type ImportPreviewRow<T> = { line: number; status: 'ready' | 'error' | 'duplicate'; errors: string[]; fingerprint: string; value: T | null };
export type HoldingImport = { name: string; assetClass: string; currency: string; valueCents: number | null; costCents: number | null; asOf: string; sector: string | null; geography: string | null; holderEntityId: string | null; sourceNote: string };
export type FlowImport = { commitmentId: string; date: string; flowType: 'contribution' | 'distribution'; status: 'actual' | 'projected'; amountCents: number; note: string };

function headerIndex(header: string[], expected: readonly string[]) {
  const h = header.map(x => x.trim().toLowerCase().replace(/\s+/g, '_'));
  const missing = expected.filter(c => ['name', 'asset_class', 'currency', 'as_of', 'investment', 'date', 'type', 'amount'].includes(c) && !h.includes(c));
  return { idx: (c: string) => h.indexOf(c), missing };
}

export function previewHoldingImport(text: string, ctx: { assetClasses: readonly string[]; entities: PortfolioEntity[]; existingFingerprints: Set<string>; today: string }) {
  const rows = parseCsv(text);
  if (!rows.length) return { fileErrors: ['The file is empty.'], rows: [] as ImportPreviewRow<HoldingImport>[] };
  const { idx, missing } = headerIndex(rows[0]!, HOLDING_COLUMNS);
  if (missing.length) return { fileErrors: [`Missing required columns: ${missing.join(', ')}.`], rows: [] as ImportPreviewRow<HoldingImport>[] };
  if (rows.length > 501) return { fileErrors: ['Import up to 500 rows at a time.'], rows: [] as ImportPreviewRow<HoldingImport>[] };
  const seen = new Set<string>();
  const get = (r: string[], c: string) => (idx(c) >= 0 ? r[idx(c)] ?? '' : '').trim();
  const out = rows.slice(1).map((r, i): ImportPreviewRow<HoldingImport> => {
    const errors: string[] = [];
    const name = get(r, 'name'); if (!name) errors.push('Name is required.'); if (name.length > 160) errors.push('Name is longer than 160 characters.');
    const assetClass = get(r, 'asset_class').toLowerCase().replace(/\s+/g, '_'); if (!ctx.assetClasses.includes(assetClass)) errors.push(`Asset class must be one of: ${ctx.assetClasses.join(', ')}.`);
    const currency = get(r, 'currency').toUpperCase(); if (!/^[A-Z]{3}$/.test(currency)) errors.push('Currency must be a 3-letter code such as USD.');
    const value = moneyCents(get(r, 'value')); if (value === 'invalid') errors.push('Value must be a positive amount such as 1250.00.');
    const cost = moneyCents(get(r, 'cost')); if (cost === 'invalid') errors.push('Cost must be a positive amount or blank.');
    const asOf = get(r, 'as_of'); if (!isDate(asOf)) errors.push('As-of date must be YYYY-MM-DD.'); else if (asOf > ctx.today) errors.push('As-of date cannot be in the future.');
    const heldBy = get(r, 'held_by');
    let holderEntityId: string | null = null;
    if (heldBy && !['you', 'me', 'self', 'direct', 'directly'].includes(heldBy.toLowerCase())) {
      const match = ctx.entities.filter(e => norm(e.name) === norm(heldBy));
      if (match.length !== 1) errors.push(match.length ? `More than one entity is named "${heldBy}".` : `No entity named "${heldBy}" is on file. Add it under Ownership first.`);
      else holderEntityId = match[0]!.recordId;
    }
    const fingerprint = rowFingerprint([name, assetClass, currency, typeof value === 'number' ? value : '', asOf, holderEntityId]);
    const duplicate = ctx.existingFingerprints.has(fingerprint) || seen.has(fingerprint);
    seen.add(fingerprint);
    const ok = !errors.length;
    return { line: i + 2, status: !ok ? 'error' : duplicate ? 'duplicate' : 'ready', errors: duplicate && ok ? ['Same holding, value and date already recorded.'] : errors, fingerprint,
      value: ok ? { name, assetClass, currency, valueCents: value as number | null, costCents: cost as number | null, asOf, sector: get(r, 'sector') || null, geography: get(r, 'region') || null, holderEntityId, sourceNote: get(r, 'source_note') || 'Imported from file' } : null };
  });
  return { fileErrors: [] as string[], rows: out };
}

export function previewFlowImport(text: string, ctx: { commitments: PrivateCommitment[]; existingFingerprints: Set<string>; today: string }) {
  const rows = parseCsv(text);
  if (!rows.length) return { fileErrors: ['The file is empty.'], rows: [] as ImportPreviewRow<FlowImport>[] };
  const { idx, missing } = headerIndex(rows[0]!, FLOW_COLUMNS);
  if (missing.length) return { fileErrors: [`Missing required columns: ${missing.join(', ')}.`], rows: [] as ImportPreviewRow<FlowImport>[] };
  if (rows.length > 501) return { fileErrors: ['Import up to 500 rows at a time.'], rows: [] as ImportPreviewRow<FlowImport>[] };
  const seen = new Set<string>();
  const get = (r: string[], c: string) => (idx(c) >= 0 ? r[idx(c)] ?? '' : '').trim();
  const out = rows.slice(1).map((r, i): ImportPreviewRow<FlowImport> => {
    const errors: string[] = [];
    const inv = get(r, 'investment');
    const match = ctx.commitments.filter(c => norm(c.name) === norm(inv));
    if (match.length !== 1) errors.push(match.length ? `More than one private investment is named "${inv}".` : `No private investment named "${inv}". Add the commitment first.`);
    const date = get(r, 'date'); if (!isDate(date)) errors.push('Date must be YYYY-MM-DD.');
    const type = get(r, 'type').toLowerCase(); if (type !== 'contribution' && type !== 'distribution') errors.push('Type must be contribution or distribution.');
    const status = (get(r, 'status') || 'actual').toLowerCase(); if (status !== 'actual' && status !== 'projected') errors.push('Status must be actual or projected.');
    if (status === 'actual' && isDate(date) && date > ctx.today) errors.push('An actual cash flow cannot be dated in the future; mark it projected.');
    const amount = moneyCents(get(r, 'amount')); if (amount === null || amount === 'invalid' || amount === 0) errors.push('Amount must be a positive number.');
    const commitmentId = match[0]?.recordId ?? '';
    const fingerprint = rowFingerprint([commitmentId, date, type, status, typeof amount === 'number' ? amount : '']);
    const duplicate = ctx.existingFingerprints.has(fingerprint) || seen.has(fingerprint);
    seen.add(fingerprint);
    const ok = !errors.length;
    return { line: i + 2, status: !ok ? 'error' : duplicate ? 'duplicate' : 'ready', errors: duplicate && ok ? ['Same cash flow already recorded.'] : errors, fingerprint,
      value: ok ? { commitmentId, date, flowType: type as FlowImport['flowType'], status: status as FlowImport['status'], amountCents: amount as number, note: get(r, 'note') } : null };
  });
  return { fileErrors: [] as string[], rows: out };
}

// ------------------------------------------------------------- report export

const csvCell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s; };
const dollars = (c: number | null | undefined) => c === null || c === undefined ? '' : (c / 100).toFixed(2);
export function portfolioReportCsv(view: PortfolioView, periodLabel: string) {
  const out: string[][] = [['Harmonious portfolio report', periodLabel, `As of ${view.asOf}`], [], ['Holdings'], ['Name', 'Held by', 'Asset class', 'Sector', 'Region', 'Currency', 'Your share %', 'Value', 'Value date', 'Source', 'Counted']];
  for (const l of view.lines) out.push([l.name, l.holder, ASSET_CLASS_LABELS[l.assetClass] ?? l.assetClass, l.sector, l.geography, l.currency, (l.sharePct * 100).toFixed(2), dollars(l.valueCents), l.valueDate ?? '', SOURCE_LABELS[l.source], l.counted ? 'Yes' : `No: ${l.excludedReason ?? ''}`]);
  out.push([], ['Performance'], ['Investment', 'Currency', 'Period start', 'Period end', 'Paid in', 'Distributions', 'Value', 'Value date', 'XIRR %', 'XIRR status', 'TVPI', 'DPI', 'TWR %', 'Warnings']);
  for (const p of view.performance) out.push([p.name, p.currency, p.periodStart ?? '', p.periodEnd, dollars(p.paidInCents), dollars(p.distributionsCents), dollars(p.valueCents), p.valueDate ?? '', p.irr.bps === null ? '' : (p.irr.bps / 100).toFixed(2), p.irr.status, p.tvpi === null ? '' : String(p.tvpi), p.dpi === null ? '' : String(p.dpi), p.twr?.bps == null ? '' : (p.twr.bps / 100).toFixed(2), p.warnings.join(' ')]);
  out.push([], ['Cash activity (actual)'], ['Date', 'Description', 'Currency', 'Direction', 'Amount', 'Source']);
  for (const c of view.cash) out.push([c.date, c.name, c.currency, c.direction, dollars(c.amountCents), c.source === 'personal_record' ? 'Personal record' : SOURCE_LABELS[c.source]]);
  out.push([], ['Upcoming (projected, not actual)'], ['Date', 'Description', 'Type', 'Currency', 'Amount']);
  for (const l of view.liquidity) for (const u of l.upcoming) out.push([u.date ?? 'Not set', u.name, u.kind === 'capital_call' ? 'Capital call' : 'Distribution', u.currency, u.amountCents === null ? 'Not recorded' : dollars(u.amountCents)]);
  out.push([], ['Assumptions'], ...view.assumptions.map(a => [a]));
  return out.map(r => r.map(csvCell).join(',')).join('\r\n');
}

const money = (c: number | null | undefined, currency = 'USD') => c === null || c === undefined ? 'Not recorded' : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(c / 100);
const pctText = (bps: number | null | undefined) => bps === null || bps === undefined ? 'Not calculated' : `${(bps / 100).toFixed(2)}%`;
/** Branded quarterly report for the shared PDF renderer. Only recorded figures; gaps print as "Not recorded". */
export function portfolioReportPdf(view: PortfolioView, periodLabel: string, ownerLabel: string, version: number | null): PdfDocSpec {
  const short = (t: string, n = 48) => t.length > n ? `${t.slice(0, n - 1)}…` : t;
  const x = (m: number | null) => m === null ? 'n/a' : `${m.toFixed(2)}x`;
  const excluded = view.lines.filter(l => !l.counted);
  const notes = [...excluded.map(l => `${l.name}: not counted. ${l.excludedReason ?? ''}`), ...view.issues.filter(i => i.severity === 'warning').map(i => i.message), ...view.performance.flatMap(p => p.warnings.map(w => `${p.name}: ${w}`))];
  return {
    kicker: 'Quarterly portfolio report', title: periodLabel, subtitle: ownerLabel, badge: version ? `Version ${version}` : 'Draft preview',
    meta: [{ label: 'Period', value: `${view.periodStart} to ${view.asOf}` }, ...view.totals.map(t => ({ label: `Total value (${t.currency})`, value: money(t.valueCents, t.currency) + (t.missingValues ? ` · ${t.missingValues} without value` : '') }))],
    sections: [
      { heading: 'Holdings (your share, value date)', rows: view.lines.filter(l => l.counted).map(l => ({ label: short(l.name), value: `${money(l.valueCents, l.currency)} · ${l.valueDate ?? 'no date'}` })) },
      { heading: 'Held through entities', rows: view.lines.filter(l => l.counted && l.sharePct < 1).map(l => ({ label: short(`${l.name}, via ${l.holder}`, 60), value: `${(l.sharePct * 100).toFixed(1)}% of ${money(l.grossValueCents, l.currency)}` })) },
      { heading: 'Returns: XIRR, TVPI, DPI', rows: view.performance.map(p => ({ label: short(p.name), value: `${p.irr.status === 'solved' ? pctText(p.irr.bps) : 'n/a'} · ${x(p.tvpi)} · ${x(p.dpi)}` })) },
      { heading: 'Time-weighted return (3 or more values)', rows: view.performance.filter(p => p.twr).map(p => ({ label: short(p.name), value: p.twr!.status === 'solved' ? pctText(p.twr!.bps) : 'n/a' })) },
      ...view.allocation.map(a => ({ heading: `Allocation by type (${a.currency})`, rows: a.assetClass.map(g => ({ label: g.label, value: `${money(g.valueCents, a.currency)} · ${g.pct ?? 0}%` })) })),
      { heading: 'Cash activity (actual)', rows: view.cash.length ? view.cash.map(c => ({ label: short(`${c.date} · ${c.name}`, 60), value: `${c.direction === 'inflow' ? '+' : '-'}${money(c.amountCents, c.currency)}` })) : [{ label: 'No cash activity recorded in this period', value: '' }] },
      { heading: 'Cash needs', rows: view.liquidity.flatMap(l => [{ label: `Available cash (${l.currency})`, value: money(l.availableCashCents, l.currency) }, { label: `Still to pay on commitments (${l.currency})`, value: money(l.unfundedCents, l.currency) }]) },
      { heading: 'Upcoming (projected, not actual)', rows: view.liquidity.flatMap(l => l.upcoming.map(u => ({ label: short(`${u.kind === 'capital_call' ? 'Call' : 'Distribution'} · ${u.name}`, 60), value: `${u.amountCents === null ? 'not set' : money(u.amountCents, u.currency)} · ${u.date ?? 'no date'}` }))) },
      ...(notes.length ? [{ heading: 'Data notes', text: notes.slice(0, 40).join('\n') }] : []),
    ].filter(s => !('rows' in s) || (s.rows?.length ?? 0) > 0),
    notes: [...view.assumptions, 'Figures come only from records entered, imported or published on this platform. This report is not an audited statement and includes no benchmarks.'],
    fileName: `portfolio-report-${periodLabel.replace(/\s+/g, '-').toLowerCase()}${version ? `-v${version}` : ''}.pdf`,
  };
}
