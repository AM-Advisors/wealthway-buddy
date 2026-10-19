import { describe, expect, it } from 'vitest';
import { exposureBreakdown, topConcentration, type PortfolioPosition } from './portfolio-workspace-model';
import { complianceSummary, nextRunOn, recipientAllowed } from './compliance-schedule-model';
import { shareLinkState, shareRefusal } from './report-card-share-model';

const pos = (o: Partial<PortfolioPosition>): PortfolioPosition => ({ id: 'x', offeringId: 'f1', fundName: 'Fund 1', assetName: 'A', issuerName: 'I', assetClass: 'equity', costCents: null, valueCents: null, effectiveDate: null, currency: 'USD', monitoring: {}, ...o });

describe('portfolio exposure', () => {
  it('shares value by asset class and counts unmarked positions without value', () => {
    const s = exposureBreakdown([pos({ valueCents: 7500 }), pos({ assetClass: 'debt', valueCents: 2500 }), pos({ assetClass: 'debt' })], 'assetClass');
    expect(s.find((x) => x.key === 'equity')?.share).toBe(75);
    expect(s.find((x) => x.key === 'debt')?.positions).toBe(2);
    expect(topConcentration(s)).toBe(75);
  });
  it('groups missing vintage as Not recorded', () => {
    expect(exposureBreakdown([pos({})], 'vintage')[0]?.label).toBe('Not recorded');
  });
});

describe('report card share links', () => {
  it('never shares investor risk assessments', () => { expect(shareRefusal({ kind: 'investor', published: true, days: 7 })).toMatch(/private/); });
  it('requires publication', () => { expect(shareRefusal({ kind: 'operational', published: false, days: 7 })).toMatch(/published/); });
  it('caps links at 30 days', () => { expect(shareRefusal({ kind: 'operational', published: true, days: 31 })).not.toBeNull(); expect(shareRefusal({ kind: 'operational', published: true, days: 30 })).toBeNull(); });
  it('treats revoked and expired links as unusable', () => {
    const now = new Date('2026-10-19T00:00:00Z');
    expect(shareLinkState({ expires_at: '2026-10-20T00:00:00Z', revoked_at: '2026-10-18T00:00:00Z' }, now)).toBe('revoked');
    expect(shareLinkState({ expires_at: '2026-10-18T00:00:00Z', revoked_at: null }, now)).toBe('expired');
    expect(shareLinkState({ expires_at: '2026-10-20T00:00:00Z', revoked_at: null }, now)).toBe('active');
  });
});

describe('compliance schedules', () => {
  it('only allows harmonious.co recipients', () => { expect(recipientAllowed('ops@harmonious.co')).toBe(true); expect(recipientAllowed('x@gmail.com')).toBe(false); expect(recipientAllowed('x@harmonious.co.evil.com')).toBe(false); });
  it('advances weekly, monthly (clamped) and quarterly', () => {
    expect(nextRunOn('2026-10-19', 'weekly')).toBe('2026-10-26');
    expect(nextRunOn('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextRunOn('2026-10-19', 'quarterly')).toBe('2027-01-19');
  });
  it('counts overdue and next-30-day items, excluding filed', () => {
    const s = complianceSummary([{ status: 'not_started', due_date: '2026-10-01', filed_on: null }, { status: 'not_started', due_date: '2026-11-10', filed_on: null }, { status: 'filed', due_date: '2026-10-01', filed_on: '2026-09-30' }], 2, '2026-10-19');
    expect(s).toMatchObject({ openItems: 2, overdue: 1, dueNext30Days: 1, openHolds: 2 });
  });
});

import { filingDeadlines as _fd, kycAml as _kyc, redactForOutside as _red, validateOutsideRecipients as _vor } from './compliance-schedule-model';
describe('compliance report sections and outside recipients', () => {
  it('requires confirmation and a reason for outside addresses', () => {
    expect(() => _vor([{ email: 'a@firm.com', reason: 'counsel', confirmed: false }])).toThrow();
    expect(() => _vor([{ email: 'a@firm.com', reason: '', confirmed: true }])).toThrow();
    expect(_vor([{ email: 'A@firm.com', reason: 'fund counsel', confirmed: true }])).toEqual([{ email: 'a@firm.com', reason: 'fund counsel' }]);
  });
  it('outside recipients see counts but no names', () => {
    const s = _kyc([{ status: 'review', name: 'Calvin Jung' }, { status: 'approved', name: 'X' }]);
    expect(s.count).toBe(1); expect(_red([s])[0]!.lines).toEqual([]);
  });
  it('lists overdue and next-30-day filings only', () => {
    const r = _fd([{ label: 'Form D', category: null, status: 'open', due_date: '2026-10-01', filed_on: null, fund: 'Erebor' }, { label: 'K-1', category: null, status: 'open', due_date: '2027-03-01', filed_on: null, fund: 'Erebor' }], '2026-10-19');
    expect(r.count).toBe(1); expect(r.lines[0]).toContain('overdue');
  });
});
