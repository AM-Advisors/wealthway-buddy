/**
 * Fictional consolidated-portfolio data for /qa-sandbox. Every name, amount
 * and date is invented; the handlers compute views with the same pure model
 * the server uses and never reach the backend.
 */
import { buildPortfolio, previewHoldingImport, previewFlowImport, quarterOf, lastCompletedQuarter, rowFingerprint, SELF, type PortfolioEntity, type OwnershipLink, type PortfolioHolding, type FundPosition, type PrivateCommitment, type PrivateCashFlow, type ProjectedItem } from '@/lib/wealth-portfolio-model';
import { WEALTH_ASSET_CLASSES } from '@/lib/wealth-services';

const TRUST = 'a0000000-0000-4000-8000-0000000000a1';
const LLC = 'a0000000-0000-4000-8000-0000000000a2';
const VENTURE = 'a0000000-0000-4000-8000-0000000000c1';
const VENTURE_HOLDING = 'a0000000-0000-4000-8000-0000000000b4';

export type QaPortfolio = {
  entities: PortfolioEntity[]; links: OwnershipLink[]; holdings: PortfolioHolding[]; funds: FundPosition[];
  commitments: PrivateCommitment[]; flows: PrivateCashFlow[]; projected: ProjectedItem[];
  reports: { id: string; periodLabel: string; periodStart: string; periodEnd: string; version: number; publishedAt: string; snapshot: unknown; supersedes: string | null }[];
  audit: { id: string; action: string; createdAt: string; summary: string | null }[];
  seq: number;
};

const h = (id: string, name: string, assetClass: string, valueCents: number | null, asOf: string, extra: Partial<PortfolioHolding> = {}): PortfolioHolding => ({ holdingId: id, observationId: `obs-${id}`, name, assetClass, currency: 'USD', valueCents, costCents: null, asOf, source: 'manual', sector: null, geography: 'United States', holderEntityId: null, representsEntityId: null, ...extra });

export function createQaPortfolio(): QaPortfolio {
  return {
    entities: [
      { recordId: TRUST, rowId: 'row-trust', name: 'Smith Family Trust', entityType: 'trust', investmentProfileId: null },
      { recordId: LLC, rowId: 'row-llc', name: 'Smith Harbor Holdings LLC', entityType: 'llc', investmentProfileId: null },
    ],
    links: [
      { recordId: 'l1', rowId: 'row-l1', parentId: SELF, childId: TRUST, pctBps: 10000 },
      { recordId: 'l2', rowId: 'row-l2', parentId: TRUST, childId: LLC, pctBps: 4000 },
    ],
    holdings: [
      h('a0000000-0000-4000-8000-0000000000b1', 'Fictional checking account', 'cash', 25_000_000, '2026-10-31', { geography: 'United States' }),
      h('a0000000-0000-4000-8000-0000000000b2', 'Fictional index portfolio', 'public_equity', 120_000_000, '2026-10-31', { holderEntityId: TRUST, sector: 'Diversified' }),
      h('a0000000-0000-4000-8000-0000000000b3', 'Fictional harbor building', 'real_estate', 200_000_000, '2026-06-15', { holderEntityId: LLC, sector: 'Real estate' }),
      h('a0000000-0000-4000-8000-0000000000b5', 'Trust interest in Smith Harbor Holdings', 'business', 80_000_000, '2026-06-15', { holderEntityId: TRUST, representsEntityId: LLC }),
      h(VENTURE_HOLDING, 'Fictional Venture Partners II', 'private_fund', 21_000_000, '2026-09-30', { sector: 'Technology', history: [{ asOf: '2025-12-31', valueCents: 9_500_000 }, { asOf: '2026-03-31', valueCents: 16_000_000 }, { asOf: '2026-06-30', valueCents: 17_500_000 }] }),
    ],
    funds: [{ positionId: 'qa-pos-1', offeringId: 'qa-off-1', fundName: 'Fablewood Ventures I LP', investmentProfileId: null, profileLabel: 'John Smith', commitmentCents: 50_000_000, contributedCents: 30_000_000, distributionsCents: 2_500_000, unfundedCents: 20_000_000, valueCents: 33_000_000, valueDate: '2026-09-30',
      valuations: [{ date: '2025-12-31', valueCents: 15_500_000 }, { date: '2026-03-31', valueCents: 26_000_000 }, { date: '2026-09-30', valueCents: 33_000_000 }],
      flows: [{ id: 'qf1', date: '2025-07-01', kind: 'contribution', amountCents: 15_000_000 }, { id: 'qf2', date: '2026-02-01', kind: 'contribution', amountCents: 15_000_000 }, { id: 'qf3', date: '2026-08-15', kind: 'distribution', amountCents: 2_500_000 }] }],
    commitments: [{ recordId: VENTURE, rowId: 'row-c1', name: 'Fictional Venture Partners II', currency: 'USD', commitmentCents: 25_000_000, holderEntityId: null, holdingId: VENTURE_HOLDING, startDate: '2025-10-01' }],
    flows: [
      { recordId: 'pf1', rowId: 'row-pf1', commitmentId: VENTURE, date: '2025-10-15', flowType: 'contribution', status: 'actual', amountCents: 10_000_000, note: 'First call', source: 'manual' },
      { recordId: 'pf2', rowId: 'row-pf2', commitmentId: VENTURE, date: '2026-03-31', flowType: 'contribution', status: 'actual', amountCents: 5_000_000, note: '', source: 'manual' },
      { recordId: 'pf3', rowId: 'row-pf3', commitmentId: VENTURE, date: '2026-12-15', flowType: 'contribution', status: 'projected', amountCents: 5_000_000, note: 'Expected next call', source: 'manual' },
    ],
    projected: [{ id: 'qa-call', kind: 'capital_call', name: 'Fablewood Ventures I LP · fourth call', currency: 'USD', amountCents: 10_000_000, date: '2027-01-15', source: 'fund_records' }],
    reports: [], audit: [], seq: 1,
  };
}

const today = () => new Date().toISOString().slice(0, 10);

function view(p: QaPortfolio, asOf: string, periodStart: string) {
  return buildPortfolio({ asOf, periodStart, entities: p.entities, links: p.links, holdings: p.holdings, funds: p.funds, commitments: p.commitments, privateFlows: p.flows, projected: p.projected, personalCash: [], connected: [], connectedLive: false });
}
function log(p: QaPortfolio, action: string, summary: string | null) { p.audit.unshift({ id: `qa-audit-${p.seq++}`, action, createdAt: new Date().toISOString(), summary }); }

/** Returns undefined when the call is not a portfolio call. */
export function handleQaPortfolioCall(fnName: string, data: any, p: QaPortfolio): unknown {
  switch (fnName) {
    case 'listWealthPortfolioSubjects': return { subjects: [{ ownerId: 'qa-owner', label: 'My portfolio', role: 'owner' }], staff: false };
    case 'getWealthPortfolioView': {
      const asOf = data?.asOf && data.asOf <= today() ? data.asOf : today();
      return { access: { role: 'owner', canEdit: true }, ownerId: 'qa-owner', view: view(p, asOf, data?.periodStart ?? quarterOf(asOf).start), profiles: [], holdingOptions: p.holdings.map(x => ({ holdingId: x.holdingId, name: x.name })) };
    }
    case 'saveWealthHolding': {
      if (!data?.sourceNote || String(data.sourceNote).trim().length < 3) throw new Error('Say where the value comes from.');
      const prior = data.priorId ? p.holdings.find(x => x.observationId === data.priorId) : undefined;
      if (data.priorId && !prior) throw new Error('Holding not found.');
      const next: PortfolioHolding = { holdingId: prior?.holdingId ?? `qa-h-${p.seq++}`, observationId: `obs-${p.seq++}`, name: data.name, assetClass: data.assetClass, currency: data.currency, valueCents: data.valueCents, costCents: data.costCents, asOf: data.asOf, source: prior?.source ?? 'manual', sector: data.sector ?? null, geography: data.geography ?? null, holderEntityId: data.holderEntityId ?? null, representsEntityId: data.representsEntityId ?? null,
        history: prior ? [...(prior.history ?? []), { asOf: prior.asOf, valueCents: prior.valueCents }] : [] };
      p.holdings = p.holdings.filter(x => x !== prior);
      if (!data.archived) p.holdings.push(next);
      log(p, data.archived ? 'holding.archived' : prior ? 'holding.corrected' : 'holding.added', data.name);
      return { ok: true };
    }
    case 'saveWealthPortfolioRecord': {
      const d = data?.detail ?? {};
      const replace = <T extends { rowId?: string; recordId: string }>(rows: T[], make: (recordId: string) => T) => {
        const prior = data.priorId ? rows.find(r => r.rowId === data.priorId) : undefined;
        if (data.priorId && !prior) throw new Error('That record has changed. Refresh and try again.');
        const rest = rows.filter(r => r !== prior);
        return data.archived ? rest : [...rest, { ...make(prior?.recordId ?? `qa-r-${p.seq++}`), rowId: `row-${p.seq++}` }];
      };
      if (data.kind === 'entity') p.entities = replace(p.entities, id => ({ recordId: id, name: d.name, entityType: d.entityType, investmentProfileId: d.investmentProfileId ?? null }));
      else if (data.kind === 'ownership') { if (d.parentId === d.childId) throw new Error('An entity cannot own itself.'); p.links = replace(p.links, id => ({ recordId: id, parentId: d.parentId, childId: d.childId, pctBps: d.pctBps })); }
      else if (data.kind === 'commitment') p.commitments = replace(p.commitments, id => ({ recordId: id, name: d.name, currency: d.currency, commitmentCents: d.commitmentCents, holderEntityId: d.holderEntityId ?? null, holdingId: d.holdingId ?? null, startDate: d.startDate }));
      else if (data.kind === 'cash_flow') { if (d.status === 'actual' && d.date > today()) throw new Error('An actual cash flow cannot be dated in the future; mark it projected.'); p.flows = replace(p.flows, id => ({ recordId: id, commitmentId: d.commitmentId, date: d.date, flowType: d.flowType, status: d.status, amountCents: d.amountCents, note: d.note ?? '', source: 'manual' })); }
      else throw new Error('Unknown record.');
      log(p, `${data.kind}.${data.archived ? 'archived' : data.priorId ? 'corrected' : 'added'}`, d.name ?? null);
      return { ok: true };
    }
    case 'previewWealthImport': case 'commitWealthImport': {
      const kind = data?.kind;
      const text = String(data?.text ?? '');
      const hash = `qa-${text.length}-${[...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16).padStart(8, '0')}`.padEnd(64, '0').slice(0, 64).replace(/[^a-f0-9]/g, 'a');
      const preview = kind === 'holdings'
        ? previewHoldingImport(text, { assetClasses: WEALTH_ASSET_CLASSES, entities: p.entities, existingFingerprints: new Set(p.holdings.map(x => rowFingerprint([x.name, x.assetClass, x.currency, x.valueCents ?? '', x.asOf, x.holderEntityId]))), today: today() })
        : previewFlowImport(text, { commitments: p.commitments, existingFingerprints: new Set(p.flows.map(f => rowFingerprint([f.commitmentId, f.date, f.flowType, f.status, f.amountCents]))), today: today() });
      if (fnName === 'previewWealthImport') return { hash, priorFile: null, ...preview };
      if (preview.fileErrors.length || preview.rows.some(r => r.status === 'error')) throw new Error('Fix the rows marked with problems before importing.');
      const ready = preview.rows.filter(r => r.status === 'ready');
      for (const r of ready) {
        const v = r.value as any;
        if (kind === 'holdings') p.holdings.push({ holdingId: `qa-h-${p.seq++}`, observationId: `obs-${p.seq++}`, name: v.name, assetClass: v.assetClass, currency: v.currency, valueCents: v.valueCents, costCents: v.costCents, asOf: v.asOf, source: 'import', sector: v.sector, geography: v.geography, holderEntityId: v.holderEntityId, representsEntityId: null });
        else p.flows.push({ recordId: `qa-r-${p.seq++}`, rowId: `row-${p.seq++}`, ...v, source: 'import' });
      }
      log(p, 'import.committed', `${data.fileName}: ${ready.length} imported, ${preview.rows.length - ready.length} skipped`);
      return { imported: ready.length, skipped: preview.rows.length - ready.length };
    }
    case 'listWealthReports': {
      const replaced = new Set(p.reports.map(r => r.supersedes).filter(Boolean));
      return p.reports.map(r => { const v = (r.snapshot as any)?.view; return { id: r.id, periodLabel: r.periodLabel, periodStart: r.periodStart, periodEnd: r.periodEnd, version: r.version, publishedAt: r.publishedAt, current: !replaced.has(r.id), totals: v?.totals ?? [], complete: v?.completeness?.complete === true, completenessMessage: v?.completeness?.message ?? null }; });
    }
    case 'publishWealthReport': {
      const q = lastCompletedQuarter(today());
      if (data?.periodEnd !== q.end) throw new Error('Choose a quarter end date.');
      const prior = p.reports.filter(r => r.periodEnd === q.end).sort((a, b) => b.version - a.version)[0];
      const id = `qa-report-${p.seq++}`;
      p.reports.unshift({ id, periodLabel: q.label, periodStart: q.start, periodEnd: q.end, version: (prior?.version ?? 0) + 1, publishedAt: new Date().toISOString(), snapshot: JSON.parse(JSON.stringify({ periodLabel: q.label, view: view(p, q.end, q.start) })), supersedes: prior?.id ?? null });
      log(p, 'report.published', `Version ${(prior?.version ?? 0) + 1}`);
      return { ok: true, version: (prior?.version ?? 0) + 1 };
    }
    case 'getWealthReportSnapshot': {
      const r = p.reports.find(x => x.id === data?.reportId);
      if (!r) throw new Error('Report not found.');
      return { id: r.id, periodLabel: r.periodLabel, version: r.version, publishedAt: r.publishedAt, sha256: 'f1c7f1c7f1c7f1c7fictional', integrity: 'verified', snapshot: r.snapshot };
    }
    case 'getWealthAuditTrail': return p.audit;
    default: return undefined;
  }
}
export const QA_PORTFOLIO_FNS = ['listWealthPortfolioSubjects', 'getWealthPortfolioView', 'saveWealthHolding', 'saveWealthPortfolioRecord', 'previewWealthImport', 'commitWealthImport', 'listWealthReports', 'publishWealthReport', 'getWealthReportSnapshot', 'getWealthAuditTrail'] as const;
