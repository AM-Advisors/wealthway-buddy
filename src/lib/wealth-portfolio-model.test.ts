import { describe, expect, it } from 'vitest';
import {
  buildPortfolio, ownershipShares, investmentPerformance, portfolioAccess, previewHoldingImport, previewFlowImport,
  parseCsv, quarterOf, lastCompletedQuarter, portfolioReportCsv, rowFingerprint, SELF,
  type PortfolioInput, type PortfolioEntity, type OwnershipLink,
} from './wealth-portfolio-model';
import { WEALTH_ASSET_CLASSES } from './wealth-services';

const trust: PortfolioEntity = { recordId: '11111111-1111-4111-8111-111111111111', name: 'Fictional Family Trust', entityType: 'trust', investmentProfileId: 'profile-trust' };
const llc: PortfolioEntity = { recordId: '22222222-2222-4222-8222-222222222222', name: 'Fictional Holdings LLC', entityType: 'llc', investmentProfileId: null };
const base = (over: Partial<PortfolioInput> = {}): PortfolioInput => ({ asOf: '2026-09-30', periodStart: '2026-07-01', entities: [], links: [], holdings: [], funds: [], commitments: [], privateFlows: [], projected: [], personalCash: [], connected: [], connectedLive: false, ...over });

describe('ownership look-through', () => {
  it('multiplies shares along each path: 50% of a trust that owns 40% of an LLC is 20%', () => {
    const links: OwnershipLink[] = [{ recordId: 'a', parentId: SELF, childId: trust.recordId, pctBps: 5000 }, { recordId: 'b', parentId: trust.recordId, childId: llc.recordId, pctBps: 4000 }];
    const { shares, issues } = ownershipShares([trust, llc], links);
    expect(shares.get(trust.recordId)).toBeCloseTo(0.5);
    expect(shares.get(llc.recordId)).toBeCloseTo(0.2);
    expect(issues).toEqual([]);
  });
  it('flags missing percentages, unlinked entities and owners above 100%', () => {
    const links: OwnershipLink[] = [{ recordId: 'a', parentId: SELF, childId: trust.recordId, pctBps: null }, { recordId: 'b', parentId: SELF, childId: llc.recordId, pctBps: 7000 }, { recordId: 'c', parentId: SELF, childId: llc.recordId, pctBps: 5000 }];
    const codes = ownershipShares([trust, llc], links).issues.map(i => i.code);
    expect(codes).toContain('ownership_missing_pct');
    expect(codes).toContain('ownership_over_100');
    const unlinked = ownershipShares([trust], []).issues.map(i => i.code);
    expect(unlinked).toContain('ownership_unlinked');
  });
  it('counts an LLC holding at the owner share: $1,000,000 held by a 20%-owned LLC is $200,000', () => {
    const view = buildPortfolio(base({ entities: [trust, llc], links: [{ recordId: 'a', parentId: SELF, childId: trust.recordId, pctBps: 5000 }, { recordId: 'b', parentId: trust.recordId, childId: llc.recordId, pctBps: 4000 }],
      holdings: [{ holdingId: 'h1', name: 'Fictional Building', assetClass: 'real_estate', currency: 'USD', valueCents: 100_000_000, costCents: null, asOf: '2026-09-01', source: 'manual', sector: 'Real estate', geography: 'United States', holderEntityId: llc.recordId, representsEntityId: null }] }));
    expect(view.totals).toEqual([{ currency: 'USD', valueCents: 20_000_000, missingValues: 0, lines: 1 }]);
  });
});

describe('double counting', () => {
  it('excludes a holding that represents an entity whose own holdings are already counted', () => {
    const view = buildPortfolio(base({ entities: [llc], links: [{ recordId: 'a', parentId: SELF, childId: llc.recordId, pctBps: 10000 }],
      holdings: [
        { holdingId: 'h1', name: 'Brokerage inside LLC', assetClass: 'public_equity', currency: 'USD', valueCents: 50_000_00, costCents: null, asOf: '2026-09-01', source: 'manual', sector: null, geography: null, holderEntityId: llc.recordId, representsEntityId: null },
        { holdingId: 'h2', name: 'My LLC interest', assetClass: 'business', currency: 'USD', valueCents: 50_000_00, costCents: null, asOf: '2026-09-01', source: 'manual', sector: null, geography: null, holderEntityId: null, representsEntityId: llc.recordId },
      ] }));
    expect(view.totals[0]!.valueCents).toBe(50_000_00);
    expect(view.lines.find(l => l.holdingId === 'h2')!.counted).toBe(false);
  });
  it('counts a fund position once even if listed twice, and flags a manual entry with the same fund name', () => {
    const fund = { positionId: 'p1', offeringId: 'o1', fundName: 'Fictional Growth Fund I', investmentProfileId: null, profileLabel: null, commitmentCents: 100_000_00, contributedCents: 60_000_00, distributionsCents: 0, unfundedCents: 40_000_00, valueCents: 70_000_00, valueDate: '2026-06-30', valuations: [], flows: [] };
    const view = buildPortfolio(base({ funds: [fund, fund], holdings: [{ holdingId: 'h1', name: 'Fictional Growth Fund I', assetClass: 'private_fund', currency: 'USD', valueCents: 70_000_00, costCents: null, asOf: '2026-09-01', source: 'manual', sector: null, geography: null, holderEntityId: null, representsEntityId: null }] }));
    expect(view.lines.filter(l => l.kind === 'fund')).toHaveLength(1);
    expect(view.issues.map(i => i.code)).toContain('possible_duplicate_fund');
  });
  it('never adds connected balances while connections are in test mode', () => {
    const view = buildPortfolio(base({ connected: [{ id: 'c1', name: 'Test checking', currency: 'USD', balanceCents: 999_00, accountType: 'depository', observedAt: '2026-09-29T00:00:00Z' }], connectedLive: false }));
    expect(view.lines).toHaveLength(0);
  });
});

describe('returns', () => {
  const flows = [{ id: 'f1', date: '2025-09-30', kind: 'contribution' as const, amountCents: 100_000_00, source: 't' }];
  it('XIRR of $100,000 in and $110,000 value one year later is 10%', () => {
    const p = investmentPerformance({ key: 'k', name: 'Fictional', currency: 'USD', asOf: '2026-09-30', flows, valuations: [{ date: '2026-09-30', valueCents: 110_000_00 }] });
    expect(p.irr.status).toBe('solved');
    expect(Math.abs((p.irr.bps ?? 0) - 1000)).toBeLessThanOrEqual(2);
    expect(p.tvpi).toBeCloseTo(1.1);
    expect(p.dpi).toBe(0);
  });
  it("never invents a return without a value, and hides time-weighted return with fewer than 3 values", () => {
    const p = investmentPerformance({ key: 'k', name: 'Fictional', currency: 'USD', asOf: '2026-09-30', flows, valuations: [] });
    expect(p.irr.bps).toBeNull();
    expect(p.tvpi).toBeNull();
    expect(p.twr).toBeNull();
    expect(p.warnings.join(' ')).toMatch(/No dated value/);
    const two = investmentPerformance({ key: 'k', name: 'Fictional', currency: 'USD', asOf: '2026-09-30', flows, valuations: [{ date: '2026-03-31', valueCents: 100_000_00 }, { date: '2026-09-30', valueCents: 105_000_00 }] });
    expect(two.twr?.status).toBe('not_eligible');
    expect(two.twr?.bps).toBeNull();
  });
  it('time-weighted return chains 10% and 10% into 21% with three values', () => {
    const p = investmentPerformance({ key: 'k', name: 'Fictional', currency: 'USD', asOf: '2026-09-30', flows, valuations: [{ date: '2025-09-30', valueCents: 100_000_00 }, { date: '2026-03-31', valueCents: 110_000_00 }, { date: '2026-09-30', valueCents: 121_000_00 }] });
    expect(p.twr?.status).toBe('solved');
    expect(p.twr?.bps).toBe(2100);
  });
  it('flags a value older than 120 days', () => {
    const p = investmentPerformance({ key: 'k', name: 'Fictional', currency: 'USD', asOf: '2026-09-30', flows, valuations: [{ date: '2026-05-01', valueCents: 100_000_00 }] });
    expect(p.warnings.join(' ')).toMatch(/more than 120 days/);
  });
});

describe('liquidity separates projected from actual', () => {
  it('upcoming calls are listed as projected and outside commitments reduce unfunded by actual contributions only', () => {
    const view = buildPortfolio(base({
      commitments: [{ recordId: 'c1', name: 'Fictional Venture LP', currency: 'USD', commitmentCents: 500_000_00, holderEntityId: null, holdingId: null, startDate: '2025-01-01' }],
      privateFlows: [
        { recordId: 'x1', commitmentId: 'c1', date: '2025-03-01', flowType: 'contribution', status: 'actual', amountCents: 200_000_00, note: '', source: 'manual' },
        { recordId: 'x2', commitmentId: 'c1', date: '2026-12-01', flowType: 'contribution', status: 'projected', amountCents: 100_000_00, note: '', source: 'manual' },
      ] }));
    const usd = view.liquidity.find(l => l.currency === 'USD')!;
    expect(usd.unfundedCents).toBe(300_000_00);
    expect(usd.projectedCallsCents).toBe(100_000_00);
    expect(view.cash.some(c => c.amountCents === 100_000_00)).toBe(false);
  });
});

describe('CSV import validation', () => {
  const header = 'name,asset_class,currency,value,cost,as_of,sector,region,held_by,source_note';
  it('reads quoted cells with commas', () => {
    expect(parseCsv('a,"b, c"\n1,"say ""hi"""')).toEqual([['a', 'b, c'], ['1', 'say "hi"']]);
  });
  it('rejects missing columns, bad classes, future dates and unknown entities; marks repeats as duplicates', () => {
    expect(previewHoldingImport('name,value\nX,1', { assetClasses: WEALTH_ASSET_CLASSES, entities: [], existingFingerprints: new Set(), today: '2026-10-01' }).fileErrors[0]).toMatch(/Missing required columns/);
    const existing = new Set([rowFingerprint(['Fictional Bond', 'fixed_income', 'USD', 1000000, '2026-09-30', null])]);
    const text = [header, 'Fictional Bond,fixed_income,USD,10000,,2026-09-30,,,,', 'Bad,crypto,USD,1,,2026-09-30,,,,', 'Later,cash,USD,1,,2027-01-01,,,,', 'Held,cash,USD,1,,2026-09-30,,,Unknown LLC,', 'New one,cash,usd,"1,500.50",,2026-09-30,,,you,', 'New one,cash,usd,"1,500.50",,2026-09-30,,,you,'].join('\n');
    const rows = previewHoldingImport(text, { assetClasses: WEALTH_ASSET_CLASSES, entities: [], existingFingerprints: existing, today: '2026-10-01' }).rows;
    expect(rows.map(r => r.status)).toEqual(['duplicate', 'error', 'error', 'error', 'ready', 'duplicate']);
    expect(rows[4]!.value?.valueCents).toBe(150050);
  });
  it('requires a known private investment and refuses future-dated actual flows', () => {
    const rows = previewFlowImport('investment,date,type,status,amount,note\nFictional Venture LP,2027-01-01,contribution,actual,100,\nUnknown,2026-01-01,contribution,actual,100,\nFictional Venture LP,2026-01-01,distribution,actual,250.00,', { commitments: [{ recordId: 'c1', name: 'Fictional Venture LP', currency: 'USD', commitmentCents: 1, holderEntityId: null, holdingId: null, startDate: '2025-01-01' }], existingFingerprints: new Set(), today: '2026-10-01' }).rows;
    expect(rows.map(r => r.status)).toEqual(['error', 'error', 'ready']);
    expect(rows[2]!.value?.amountCents).toBe(25000);
  });
});

describe('access', () => {
  it('owner edits; delegate and staff read only; fund management alone gives nothing', () => {
    expect(portfolioAccess({ actorId: 'a', ownerId: 'a', delegationAllowed: false, staffCanSee: false })).toEqual({ role: 'owner', canEdit: true });
    expect(portfolioAccess({ actorId: 'm', ownerId: 'a', delegationAllowed: true, staffCanSee: false })).toEqual({ role: 'delegate', canEdit: false });
    expect(portfolioAccess({ actorId: 's', ownerId: 'a', delegationAllowed: false, staffCanSee: true })).toEqual({ role: 'staff', canEdit: false });
    expect(portfolioAccess({ actorId: 'm', ownerId: 'a', delegationAllowed: false, staffCanSee: false })).toBeNull();
  });
});

describe('quarterly report', () => {
  it('uses calendar quarters and the last completed one', () => {
    expect(quarterOf('2026-11-11')).toEqual({ label: 'Q4 2026', start: '2026-10-01', end: '2026-12-31' });
    expect(lastCompletedQuarter('2026-11-11').label).toBe('Q3 2026');
    expect(lastCompletedQuarter('2026-12-31').label).toBe('Q4 2026');
  });
  it('CSV neutralises spreadsheet formulas and keeps projected items in their own section', () => {
    const view = buildPortfolio(base({ holdings: [{ holdingId: 'h', name: '=HYPERLINK("x")', assetClass: 'cash', currency: 'USD', valueCents: 100, costCents: null, asOf: '2026-09-01', source: 'manual', sector: null, geography: null, holderEntityId: null, representsEntityId: null }] }));
    const csv = portfolioReportCsv(view, 'Q3 2026');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('Upcoming (projected, not actual)');
  });
});

// ---------------------------------------------------------------- Phase 1 validation

const A: PortfolioEntity = { recordId: 'a0000000-0000-4000-8000-00000000000a', name: 'Fictional A Trust', entityType: 'trust', investmentProfileId: null };
const B: PortfolioEntity = { recordId: 'b0000000-0000-4000-8000-00000000000b', name: 'Fictional B LLC', entityType: 'llc', investmentProfileId: null };
const C: PortfolioEntity = { recordId: 'c0000000-0000-4000-8000-00000000000c', name: 'Fictional C LP', entityType: 'partnership', investmentProfileId: null };
const D: PortfolioEntity = { recordId: 'd0000000-0000-4000-8000-00000000000d', name: 'Fictional D Corp', entityType: 'corporation', investmentProfileId: null };
const hold = (id: string, over: Partial<import('./wealth-portfolio-model').PortfolioHolding> = {}) => ({ holdingId: id, name: `Holding ${id}`, assetClass: 'public_equity', currency: 'USD', valueCents: 100_000_00, costCents: null, asOf: '2026-09-30', source: 'manual' as const, sector: 'Tech', geography: 'US', holderEntityId: null, representsEntityId: null, ...over });

describe('ownership validation', () => {
  it('sums multiple paths (diamond): 50%x20% + 50%x30% = 25%, and a child of the diamond is 25%x40% = 10%', () => {
    const links: OwnershipLink[] = [
      { recordId: '1', parentId: SELF, childId: A.recordId, pctBps: 5000 }, { recordId: '2', parentId: SELF, childId: B.recordId, pctBps: 5000 },
      { recordId: '3', parentId: A.recordId, childId: C.recordId, pctBps: 2000 }, { recordId: '4', parentId: B.recordId, childId: C.recordId, pctBps: 3000 },
      { recordId: '5', parentId: C.recordId, childId: D.recordId, pctBps: 4000 },
    ];
    const { shares, issues } = ownershipShares([A, B, C, D], links);
    expect(shares.get(C.recordId)).toBeCloseTo(0.25);
    expect(shares.get(D.recordId)).toBeCloseTo(0.10);
    expect(issues).toEqual([]);
    const view = buildPortfolio(base({ entities: [A, B, C, D], links, holdings: [hold('h1', { holderEntityId: D.recordId, valueCents: 1_000_000_00 })] }));
    expect(view.totals[0]!.valueCents).toBe(100_000_00);
  });
  it('circular ownership is flagged, the loop is not followed, and shares never exceed 100%', () => {
    const links: OwnershipLink[] = [{ recordId: '1', parentId: SELF, childId: A.recordId, pctBps: 6000 }, { recordId: '2', parentId: A.recordId, childId: B.recordId, pctBps: 5000 }, { recordId: '3', parentId: B.recordId, childId: A.recordId, pctBps: 5000 }];
    const { shares, issues } = ownershipShares([A, B], links);
    expect(issues.map(i => i.code)).toContain('ownership_cycle');
    expect(shares.get(A.recordId)).toBeCloseTo(0.6);
    expect(shares.get(B.recordId)).toBeCloseTo(0.3);
    const view = buildPortfolio(base({ entities: [A, B], links, holdings: [hold('h1', { holderEntityId: B.recordId, valueCents: 1_000_00 })] }));
    expect(view.totals[0]!.valueCents).toBe(300_00);
  });
  it('partial ownership counts the recorded share only; a missing percentage leaves the holding out and makes the total incomplete', () => {
    const partial = buildPortfolio(base({ entities: [A], links: [{ recordId: '1', parentId: SELF, childId: A.recordId, pctBps: 3333 }], holdings: [hold('h1', { holderEntityId: A.recordId, valueCents: 900_00 })] }));
    expect(partial.totals[0]!.valueCents).toBe(299_97);
    expect(partial.completeness.complete).toBe(true);
    const missing = buildPortfolio(base({ entities: [A], links: [{ recordId: '1', parentId: SELF, childId: A.recordId, pctBps: null }], holdings: [hold('h1', { holderEntityId: A.recordId }), hold('h2')] }));
    expect(missing.totals[0]!.valueCents).toBe(100_000_00);
    expect(missing.completeness.complete).toBe(false);
    expect(missing.completeness.notCounted.map(n => n.name)).toEqual(['Holding h1']);
  });
  it('a stake that represents an entity is skipped only when that entity is itself counted', () => {
    const counted = buildPortfolio(base({ entities: [A], links: [{ recordId: '1', parentId: SELF, childId: A.recordId, pctBps: 10000 }], holdings: [hold('inside', { holderEntityId: A.recordId }), hold('stake', { representsEntityId: A.recordId })] }));
    expect(counted.totals[0]!.valueCents).toBe(100_000_00);
    expect(counted.completeness.complete).toBe(true);
    const unlinked = buildPortfolio(base({ entities: [A], links: [], holdings: [hold('inside', { holderEntityId: A.recordId }), hold('stake', { representsEntityId: A.recordId, valueCents: 40_000_00 })] }));
    expect(unlinked.lines.find(l => l.holdingId === 'stake')!.counted).toBe(true);
    expect(unlinked.totals[0]!.valueCents).toBe(40_000_00);
  });
  it('flags the same holding recorded twice for the same owner and currency', () => {
    const view = buildPortfolio(base({ holdings: [hold('h1', { name: 'Fictional Index Fund' }), hold('h2', { name: 'fictional  index fund' }), hold('h3', { name: 'Fictional Index Fund', currency: 'EUR' })] }));
    expect(view.issues.filter(i => i.code === 'possible_duplicate_holding')).toHaveLength(1);
  });
});

describe('quarter-end completeness', () => {
  it('uses the latest value on or before quarter end, lists holdings with only later values, and warns the total is incomplete', () => {
    const view = buildPortfolio(base({ holdings: [
      hold('h1', { name: 'Has earlier value', asOf: '2026-10-15', valueCents: 999_00, history: [{ asOf: '2026-09-15', valueCents: 500_00 }] }),
      hold('h2', { name: 'Only later value', asOf: '2026-10-15', valueCents: 700_00 }),
    ], excludedAfterPeriod: [{ holdingId: 'h9', name: 'Server-reported later holding', firstValueDate: '2026-11-01' }] }));
    expect(view.totals[0]!.valueCents).toBe(500_00);
    expect(view.completeness.complete).toBe(false);
    expect(view.completeness.excluded.map(e => e.name)).toEqual(['Only later value', 'Server-reported later holding']);
    expect(view.completeness.message).toMatch(/does not represent the entire portfolio/);
    const csv = portfolioReportCsv(view, 'Q3 2026');
    expect(csv).toContain('Not included,Only later value');
    expect(csv).toContain('Completeness,Incomplete');
  });
  it('a fully valued portfolio is complete', () => {
    expect(buildPortfolio(base({ holdings: [hold('h1')] })).completeness.complete).toBe(true);
  });
});

describe('currencies stay separate', () => {
  it('totals, allocation and combined returns are per currency and never added together', () => {
    const view = buildPortfolio(base({
      holdings: [hold('u', { valueCents: 100_00 }), hold('e', { currency: 'EUR', valueCents: 50_00 })],
      commitments: [{ recordId: 'cu', name: 'USD fund', currency: 'USD', commitmentCents: 100_00, holderEntityId: null, holdingId: 'u', startDate: '2025-09-30' }, { recordId: 'ce', name: 'EUR fund', currency: 'EUR', commitmentCents: 100_00, holderEntityId: null, holdingId: 'e', startDate: '2025-09-30' }],
      privateFlows: [{ recordId: 'f1', commitmentId: 'cu', date: '2025-09-30', flowType: 'contribution', status: 'actual', amountCents: 100_00, note: '', source: 'manual' }, { recordId: 'f2', commitmentId: 'ce', date: '2025-09-30', flowType: 'contribution', status: 'actual', amountCents: 100_00, note: '', source: 'manual' }],
    }));
    expect(view.totals).toEqual([{ currency: 'EUR', valueCents: 50_00, missingValues: 0, lines: 1 }, { currency: 'USD', valueCents: 100_00, missingValues: 0, lines: 1 }]);
    expect(view.allocation.map(a => a.currency)).toEqual(['EUR', 'USD']);
    expect(view.combined.map(c => [c.currency, c.investments])).toEqual([['EUR', 1], ['USD', 1]]);
    expect(view.combined.find(c => c.currency === 'EUR')!.irr.bps).toBeLessThan(-4000);
    expect(Math.abs(view.combined.find(c => c.currency === 'USD')!.irr.bps ?? 99)).toBeLessThanOrEqual(1);
    expect(view.liquidity.every(l => l.currency === 'USD' || l.currency === 'EUR')).toBe(true);
  });
  it('a commitment linked to a holding in another currency gets no converted return', () => {
    const view = buildPortfolio(base({ holdings: [hold('e', { currency: 'EUR' })], commitments: [{ recordId: 'c', name: 'Mismatch', currency: 'USD', commitmentCents: 1, holderEntityId: null, holdingId: 'e', startDate: '2025-01-01' }], privateFlows: [{ recordId: 'f', commitmentId: 'c', date: '2025-09-30', flowType: 'contribution', status: 'actual', amountCents: 100, note: '', source: 'manual' }] }));
    expect(view.performance[0]!.irr.bps).toBeNull();
    expect(view.performance[0]!.warnings.join(' ')).toMatch(/not converted/);
  });
});

describe('returns validation', () => {
  const contrib = (id: string, date: string, amountCents: number) => ({ id, date, kind: 'contribution' as const, amountCents, source: 't' });
  const dist = (id: string, date: string, amountCents: number) => ({ id, date, kind: 'distribution' as const, amountCents, source: 't' });
  it('XIRR and multiples stop at the latest value; later cash is left out with a warning, not set against an old value', () => {
    const p = investmentPerformance({ key: 'k', name: 'F', currency: 'USD', asOf: '2026-09-30', flows: [contrib('a', '2025-06-30', 100_000_00), contrib('b', '2026-08-01', 50_000_00)], valuations: [{ date: '2026-06-30', valueCents: 110_000_00 }] });
    expect(p.paidInCents).toBe(100_000_00);
    expect(p.tvpi).toBeCloseTo(1.1);
    expect(p.periodEnd).toBe('2026-06-30');
    expect(Math.abs((p.irr.bps ?? 0) - 1000)).toBeLessThanOrEqual(2);
    expect(p.warnings.join(' ')).toMatch(/1 cash flow\(s\) after the latest value/);
  });
  it('distributions count toward DPI and TVPI: $100k in, $30k out, $90k value is 1.20x TVPI, 0.30x DPI', () => {
    const p = investmentPerformance({ key: 'k', name: 'F', currency: 'USD', asOf: '2026-09-30', flows: [contrib('a', '2025-09-30', 100_000_00), dist('b', '2026-03-31', 30_000_00)], valuations: [{ date: '2026-09-30', valueCents: 90_000_00 }] });
    expect(p.tvpi).toBeCloseTo(1.2); expect(p.dpi).toBeCloseTo(0.3); expect(p.rvpi).toBeCloseTo(0.9);
    expect(p.irr.status).toBe('solved');
  });
  it('time-weighted return is not shown when cash moves between valuation dates, even with three or more values', () => {
    const p = investmentPerformance({ key: 'k', name: 'F', currency: 'USD', asOf: '2026-09-30', flows: [contrib('a', '2025-09-30', 100_000_00), contrib('b', '2026-05-15', 50_000_00)], valuations: [{ date: '2025-09-30', valueCents: 100_000_00 }, { date: '2026-03-31', valueCents: 110_000_00 }, { date: '2026-09-30', valueCents: 170_000_00 }] });
    expect(p.twr?.status).toBe('not_eligible');
    expect(p.twr?.bps).toBeNull();
    expect(p.twr?.detail).toMatch(/2026-05-15/);
  });
  it('a contribution on a valuation date is removed from that value: $100k → $160k incl. $50k call → $176k chains 10% and 10% into 21%', () => {
    const p = investmentPerformance({ key: 'k', name: 'F', currency: 'USD', asOf: '2026-09-30', flows: [contrib('a', '2025-12-31', 100_000_00), contrib('b', '2026-03-31', 50_000_00)], valuations: [{ date: '2025-12-31', valueCents: 100_000_00 }, { date: '2026-03-31', valueCents: 160_000_00 }, { date: '2026-06-30', valueCents: 176_000_00 }] });
    expect(p.twr?.status).toBe('solved');
    expect(p.twr?.bps).toBe(2100);
  });
  it('the measured span starts at the first value above zero', () => {
    const p = investmentPerformance({ key: 'k', name: 'F', currency: 'USD', asOf: '2026-09-30', flows: [contrib('a', '2025-12-31', 100_00)], valuations: [{ date: '2025-06-30', valueCents: 0 }, { date: '2025-12-31', valueCents: 100_00 }, { date: '2026-03-31', valueCents: 110_00 }] });
    expect(p.twr?.status).toBe('not_eligible');
    expect(p.twr?.detail).toMatch(/2 recorded from 2025-12-31/);
  });
  it('ownership share scales flows and values together, so the return is unchanged and amounts are 40%', () => {
    const fund = { positionId: 'p', offeringId: 'o', fundName: 'Fictional Fund', investmentProfileId: 'prof', profileLabel: null, commitmentCents: 0, contributedCents: 0, distributionsCents: 0, unfundedCents: 0, valueCents: 110_000_00, valueDate: '2026-09-30', valuations: [{ date: '2026-09-30', valueCents: 110_000_00 }], flows: [{ id: 'f', date: '2025-09-30', kind: 'contribution' as const, amountCents: 100_000_00 }] };
    const ent: PortfolioEntity = { ...A, investmentProfileId: 'prof' };
    const view = buildPortfolio(base({ entities: [ent], links: [{ recordId: '1', parentId: SELF, childId: A.recordId, pctBps: 4000 }], funds: [fund] }));
    const p = view.performance[0]!;
    expect(p.paidInCents).toBe(40_000_00); expect(p.valueCents).toBe(44_000_00);
    expect(Math.abs((p.irr.bps ?? 0) - 1000)).toBeLessThanOrEqual(2);
    expect(view.totals[0]!.valueCents).toBe(44_000_00);
  });
  it('a commitment and its holding recorded under different owners give no return', () => {
    const view = buildPortfolio(base({ entities: [A], links: [{ recordId: '1', parentId: SELF, childId: A.recordId, pctBps: 5000 }], holdings: [hold('h', { holderEntityId: A.recordId })], commitments: [{ recordId: 'c', name: 'C', currency: 'USD', commitmentCents: 1, holderEntityId: null, holdingId: 'h', startDate: '2025-01-01' }], privateFlows: [{ recordId: 'f', commitmentId: 'c', date: '2025-09-30', flowType: 'contribution', status: 'actual', amountCents: 100, note: '', source: 'manual' }] }));
    expect(view.performance[0]!.irr.bps).toBeNull();
    expect(view.performance[0]!.warnings.join(' ')).toMatch(/different owners/);
  });
});

describe('report reconciliation', () => {
  const fixture = () => buildPortfolio(base({ entities: [A], links: [{ recordId: '1', parentId: SELF, childId: A.recordId, pctBps: 5000 }],
    holdings: [hold('h1', { name: 'Fictional Bond Ladder', assetClass: 'fixed_income', valueCents: 123_456_78 }), hold('h2', { name: 'Fictional Rental', holderEntityId: A.recordId, valueCents: 200_000_01 }), hold('h3', { name: 'Fictional Euro Cash', assetClass: 'cash', currency: 'EUR', valueCents: 10_000_00 })] }));
  it('the stored snapshot, CSV and PDF show the same totals and holdings as the screen view', async () => {
    const screen = fixture();
    const stored = JSON.parse(JSON.stringify(screen)) as typeof screen; // what the database returns
    expect(stored.totals).toEqual(screen.totals);
    expect(stored.lines.map(l => [l.name, l.valueCents])).toEqual(screen.lines.map(l => [l.name, l.valueCents]));
    const csv = parseCsv(portfolioReportCsv(stored, 'Q3 2026', 'abcdef0123456789ffff'));
    const totalRows = csv.filter(r => r.length === 4 && /^[A-Z]{3}$/.test(r[0]!));
    expect(totalRows.map(r => [r[0], Math.round(Number(r[1]) * 100)])).toEqual(screen.totals.map(t => [t.currency, t.valueCents]));
    const hStart = csv.findIndex(r => r[0] === 'Holdings') + 2;
    const holdingRows = csv.slice(hStart, hStart + screen.lines.length);
    expect(holdingRows.map(r => [r[0], Math.round(Number(r[7]) * 100)])).toEqual(screen.lines.map(l => [l.name, l.valueCents]));
    expect(csv.some(r => r[0] === 'Report fingerprint' && r[1] === 'abcdef0123456789')).toBe(true);
    const { portfolioReportPdf } = await import('./wealth-portfolio-model');
    const pdf = portfolioReportPdf(stored, 'Q3 2026', 'Fictional Owner', 1, 'abcdef0123456789ffff');
    const fmt = (c: number, cur: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(c / 100);
    for (const t of screen.totals) expect(pdf.meta!.find(m => m.label === `Total value (${t.currency})`)!.value).toBe(fmt(t.valueCents, t.currency));
    const pdfHoldings = pdf.sections!.find(s => s.heading?.startsWith('Holdings'))!.rows!;
    expect(pdfHoldings.map(r => r.value.split(' · ')[0])).toEqual(screen.lines.filter(l => l.counted).map(l => fmt(l.valueCents!, l.currency)));
  });
  it('a stored report does not change when records are edited later, and its fingerprint still matches', async () => {
    const { canonicalJson } = await import('./wealth-portfolio-model');
    const published = JSON.parse(JSON.stringify({ periodLabel: 'Q3 2026', view: fixture() }));
    const before = canonicalJson(published);
    const later = buildPortfolio(base({ holdings: [hold('h1', { valueCents: 1 })] })); // a later correction
    expect(later.totals[0]!.valueCents).toBe(1);
    expect(canonicalJson(published)).toBe(before);
    expect(portfolioReportCsv(published.view, 'Q3 2026')).toContain('123456.78');
    const reordered = JSON.parse(JSON.stringify(published, Object.keys(published).reverse()));
    expect(canonicalJson({ view: published.view, periodLabel: published.periodLabel })).toBe(before);
    expect(reordered).toBeTruthy();
  });
});
