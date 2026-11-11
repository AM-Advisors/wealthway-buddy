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
  it('never invents a return without a value, and hides time-weighted return with fewer than 3 values', () => {
    const p = investmentPerformance({ key: 'k', name: 'Fictional', currency: 'USD', asOf: '2026-09-30', flows, valuations: [] });
    expect(p.irr.bps).toBeNull();
    expect(p.tvpi).toBeNull();
    expect(p.twr).toBeNull();
    expect(p.warnings.join(' ')).toMatch(/No dated value/);
    const two = investmentPerformance({ key: 'k', name: 'Fictional', currency: 'USD', asOf: '2026-09-30', flows, valuations: [{ date: '2026-03-31', valueCents: 100_000_00 }, { date: '2026-09-30', valueCents: 105_000_00 }] });
    expect(two.twr).toBeNull();
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
