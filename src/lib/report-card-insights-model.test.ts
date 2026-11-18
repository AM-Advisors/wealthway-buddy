import { describe, expect, it } from 'vitest';
import { accessDecisionError, accessRequestRefusal, accessState, compareCards, figureChecks, funnelSteps, gradeChangeAlerts, reportCardsCoverage, toCsv, exportRows, type CardLite } from './report-card-insights-model';

const today = '2026-11-18';
const ent = (o: Partial<any>) => ({ client_id: 'c1', offering_id: null, service_key: 'report_cards', status: 'included', ...o });
const card = (o: Partial<CardLite>): CardLite => ({ id: 'x', kind: 'operational', subject_type: 'fund', subject_id: 'f1', subjectLabel: 'Fund One', period_start: '2026-01-01', period_end: '2026-03-31', created_at: '2026-04-01T00:00:00Z', status: 'published', grade: { grade: 'B', score: 81 }, metrics: [], ...o });

describe('Report Cards coverage', () => {
  it('a fund add-on covers only that fund', () => {
    const rows = [ent({ offering_id: 'f1' })];
    expect(reportCardsCoverage(rows, { clientId: 'c1', offeringId: 'f1' }, today)).toBe('fund_add_on');
    expect(reportCardsCoverage(rows, { clientId: 'c1', offeringId: 'f2' }, today)).toBeNull();
    expect(reportCardsCoverage(rows, { clientId: 'c1', offeringId: null }, today)).toBeNull();
  });
  it('the standalone service covers the client and all of its funds', () => {
    const rows = [ent({})];
    expect(reportCardsCoverage(rows, { clientId: 'c1', offeringId: null }, today)).toBe('standalone');
    expect(reportCardsCoverage(rows, { clientId: 'c1', offeringId: 'f9' }, today)).toBe('standalone');
    expect(reportCardsCoverage(rows, { clientId: 'c2', offeringId: null }, today)).toBeNull();
  });
  it('switched off, not yet started or ended services do not count', () => {
    expect(reportCardsCoverage([ent({ status: 'not_included' })], { clientId: 'c1', offeringId: null }, today)).toBeNull();
    expect(reportCardsCoverage([ent({ effective_date: '2026-12-01' })], { clientId: 'c1', offeringId: null }, today)).toBeNull();
    expect(reportCardsCoverage([ent({ termination_date: today })], { clientId: 'c1', offeringId: null }, today)).toBeNull();
  });
});

describe('grade change alerts', () => {
  it('flags a published grade drop against the previous published card', () => {
    const a = gradeChangeAlerts([card({ id: 'a', grade: { grade: 'A', score: 92 } }), card({ id: 'b', period_start: '2026-04-01', period_end: '2026-06-30', created_at: '2026-07-01T00:00:00Z', grade: { grade: 'C', score: 72 } })]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ cardId: 'b', from: 'A', to: 'C', direction: 'down' });
  });
  it('ignores drafts and unchanged grades', () => {
    expect(gradeChangeAlerts([card({ id: 'a' }), card({ id: 'b', period_end: '2026-06-30', status: 'draft', grade: { grade: 'F', score: 10 } })])).toHaveLength(0);
    expect(gradeChangeAlerts([card({ id: 'a' }), card({ id: 'b', period_end: '2026-06-30' })])).toHaveLength(0);
  });
});

describe('figures to check', () => {
  const prev = card({ id: 'p', metrics: [{ label: 'Reporting', score: 90, weight: 1, evidence: 'x' }, { label: 'Filings', score: 80, weight: 1, evidence: 'y' }] });
  it('flags a 20-point swing, weight change and a dropped measure', () => {
    const c = card({ id: 'n', period_start: '2026-04-01', period_end: '2026-06-30', created_at: '2026-07-01T00:00:00Z', metrics: [{ label: 'Reporting', score: 65, weight: 2, evidence: 'z' }] });
    const out = figureChecks(c, prev);
    expect(out.some((s) => s.includes('moved from 90 to 65'))).toBe(true);
    expect(out.some((s) => s.includes('weight changed from 1 to 2'))).toBe(true);
    expect(out.some((s) => s.startsWith('Filings was measured last time'))).toBe(true);
  });
  it('a 19-point move is not flagged', () => {
    const c = card({ id: 'n', period_start: '2026-04-01', period_end: '2026-06-30', metrics: [{ label: 'Reporting', score: 71, weight: 1, evidence: 'z' }, { label: 'Filings', score: 80, weight: 1, evidence: 'y' }] });
    expect(figureChecks(c, prev)).toEqual([]);
  });
  it('flags a score without evidence and an overlapping period', () => {
    const c = card({ id: 'n', period_start: '2026-03-01', metrics: [{ label: 'Reporting', score: 88, weight: 1, evidence: ' ' }, { label: 'Filings', score: 80, weight: 1, evidence: 'y' }] });
    const out = figureChecks(c, prev);
    expect(out.some((s) => s.includes('no evidence'))).toBe(true);
    expect(out.some((s) => s.includes('overlaps'))).toBe(true);
  });
});

describe('compare and funnel', () => {
  it('lines measures up by name, case-insensitively', () => {
    const rows = compareCards({ metrics: [{ label: 'Reporting', score: 70, weight: 1, evidence: 'a' }] }, { metrics: [{ label: 'reporting ', score: 85, weight: 1, evidence: 'b' }, { label: 'Filings', score: null, weight: 1, evidence: '' }] });
    expect(rows).toEqual([{ label: 'Reporting', a: 70, b: 85, diff: 15 }, { label: 'Filings', a: null, b: null, diff: null }]);
  });
  it('funnel percentages are of everyone on the fund', () => {
    const s = funnelSteps({ total: 8, invited: 6, opened: 4, started: 3, verified: 2, signed: 2, funded: 1 });
    expect(s.find((x) => x.key === 'funded')).toMatchObject({ count: 1, pct: 13 });
    expect(s[0]).toMatchObject({ count: 8, pct: 100 });
  });
});

describe('access requests', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  it('latest decision wins and approval ends at its expiry', () => {
    expect(accessState([], now)).toBe('pending');
    expect(accessState([{ decision: 'approved', expires_at: '2026-11-20T00:00:00Z', created_at: '2026-11-17T00:00:00Z' }], now)).toBe('active');
    expect(accessState([{ decision: 'approved', expires_at: '2026-11-18T00:00:00Z', created_at: '2026-11-10T00:00:00Z' }], now)).toBe('expired');
    expect(accessState([{ decision: 'approved', expires_at: '2026-11-30T00:00:00Z', created_at: '2026-11-10T00:00:00Z' }, { decision: 'revoked', expires_at: null, created_at: '2026-11-12T00:00:00Z' }], now)).toBe('revoked');
  });
  it('only published, covered, unseen cards can be requested, and risk cards never', () => {
    const base = { kind: 'operational', published: true, covered: true, alreadyReadable: false, state: null };
    expect(accessRequestRefusal(base)).toBeNull();
    expect(accessRequestRefusal({ ...base, kind: 'investor' })).toMatch(/private/);
    expect(accessRequestRefusal({ ...base, published: false })).toMatch(/published/);
    expect(accessRequestRefusal({ ...base, covered: false })).toMatch(/switched on/);
    expect(accessRequestRefusal({ ...base, state: 'pending' })).toMatch(/already asked/);
  });
  it('the requester cannot decide and approval lasts 1 to 30 days', () => {
    expect(accessDecisionError({ decision: 'approved', days: 31, deciderIsRequester: false, canDecide: true })).toMatch(/1 to 30/);
    expect(accessDecisionError({ decision: 'approved', days: 30, deciderIsRequester: false, canDecide: true })).toBeNull();
    expect(accessDecisionError({ decision: 'denied', days: null, deciderIsRequester: true, canDecide: true })).toMatch(/other than/);
  });
});

describe('downloads', () => {
  it('spreadsheet cells that look like formulas stay text', () => {
    const csv = toCsv(exportRows([{ subject: '=HYPERLINK("x")', kind: 'operational', periodStart: '2026-01-01', periodEnd: '2026-03-31', status: 'published', grade: 'B', score: 81, coverage: 100, summary: '', metrics: [{ label: 'Reporting, timely', score: 81, weight: 1, evidence: 'ok' }], risk: null }]));
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"Reporting, timely"');
  });
});
