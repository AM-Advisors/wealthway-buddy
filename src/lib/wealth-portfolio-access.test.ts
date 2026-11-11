import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Consolidated portfolio access, end to end through the real server readers
 * and the real delegation check, against an in-memory fake database.
 * Owner edits; whole-person view_investments delegations and staff with
 * reports:see read; nothing else (fund manager, scoped or revoked sharing).
 */

const OWNER = '11111111-1111-4111-8111-000000000001';
const DELEGATE = '22222222-2222-4222-8222-000000000001';
const STAFF = '33333333-3333-4333-8333-000000000001';
const LEGAL = '33333333-3333-4333-8333-000000000002';
const MANAGER = '44444444-4444-4444-8444-000000000001';
const STRANGER = '55555555-5555-4555-8555-000000000001';
const FUND = '66666666-6666-4666-8666-000000000001';
const PROFILE = '77777777-7777-4777-8777-000000000001';
const HOUR = 3600_000;
const past = new Date(Date.now() - 48 * HOUR).toISOString();

const tables: Record<string, any[]> = {};
function reset() {
  for (const k of Object.keys(tables)) delete tables[k];
  Object.assign(tables, {
    profiles: [{ id: PROFILE, user_id: OWNER, legal_name: 'Fictional Owner' }],
    delegations: [], delegation_permissions: [], professional_memberships: [],
    user_roles: [{ user_id: STAFF, role: 'admin' }, { user_id: LEGAL, role: 'legal' }, { user_id: MANAGER, role: 'fund_manager' }],
    fund_team_members: [{ user_id: MANAGER, offering_id: FUND, role: 'manager' }],
    personal_wealth_observations: [], wealth_portfolio_records: [], wealth_audit_events: [],
    wealth_report_versions: [],
  });
}
function share(over: Record<string, unknown>, caps = ['view_investments']) {
  const id = `del-${tables['delegations']!.length + 1}`;
  tables['delegations']!.push({ id, principal_user_id: OWNER, delegate_user_id: DELEGATE, organization_id: null, scope_type: 'person', scope_id: OWNER, authority_level: 'view', status: 'active', acceptance_state: 'not_required', effective_at: past, expires_at: null, revoked_at: null, ...over });
  for (const capability of caps) tables['delegation_permissions']!.push({ delegation_id: id, capability });
}
function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api, order: () => api, limit: () => api,
    eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return api; },
    in: (c: string, v: unknown[]) => { rows = rows.filter(r => v.includes(r[c])); return api; },
    lte: (c: string, v: any) => { rows = rows.filter(r => r[c] <= v); return api; },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: rows, error: null }),
    insert: (payload: any) => { (tables[table] ??= []).push(...(Array.isArray(payload) ? payload : [payload])); return Promise.resolve({ data: null, error: null }); },
  };
  return api;
}
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (t: string) => builder(t) } }));

import { resolvePortfolioAccess, reportSnapshot, reportList, auditTrail, portfolioSubjects } from './wealth-portfolio.server';
import { canonicalJson } from './wealth-portfolio-model';

async function sha(text: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function publishFictional() {
  const snapshot = { periodLabel: 'Q3 2026', view: { totals: [{ currency: 'USD', valueCents: 100_00, missingValues: 0, lines: 1 }], completeness: { complete: true, message: 'ok' } } };
  tables['wealth_report_versions']!.push({ id: 'rep-1', owner_user_id: OWNER, period_label: 'Q3 2026', period_start: '2026-07-01', period_end: '2026-09-30', version: 1, published_at: past, supersedes_id: null, snapshot: JSON.parse(JSON.stringify(snapshot)), snapshot_sha256: await sha(canonicalJson(snapshot)) });
}
const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow(/do not have access|Report not found/);

beforeEach(reset);

describe('who can open a consolidated portfolio', () => {
  it('owner edits', async () => {
    expect(await resolvePortfolioAccess(OWNER, OWNER)).toEqual({ role: 'owner', canEdit: true });
  });
  it('an active whole-person share with "view investments" reads only', async () => {
    share({});
    expect(await resolvePortfolioAccess(DELEGATE, OWNER)).toEqual({ role: 'delegate', canEdit: false });
  });
  it.each([
    ['revoked', { revoked_at: past, status: 'revoked' }, undefined],
    ['revoked (timestamp only)', { revoked_at: past }, undefined],
    ['expired', { expires_at: past }, undefined],
    ['awaiting acceptance', { acceptance_state: 'pending' }, undefined],
    ['scoped to one fund', { scope_type: 'fund', scope_id: FUND }, undefined],
    ['scoped to one investing party', { scope_type: 'investment_profile', scope_id: PROFILE }, undefined],
    ['without "view investments"', {}, ['view_profile']],
  ])('a share that is %s grants nothing', async (_l, over, caps) => {
    share(over, caps);
    await denied(resolvePortfolioAccess(DELEGATE, OWNER));
  });
  it('Harmonious staff with reporting permission read only; staff without it get nothing', async () => {
    expect(await resolvePortfolioAccess(STAFF, OWNER)).toEqual({ role: 'staff', canEdit: false });
    await denied(resolvePortfolioAccess(LEGAL, OWNER));
  });
  it("managing one of the person's funds grants nothing", async () => {
    await denied(resolvePortfolioAccess(MANAGER, OWNER));
  });
  it('an unrelated signed-in person gets nothing', async () => {
    await denied(resolvePortfolioAccess(STRANGER, OWNER));
  });
  it('revoked shares drop out of the portfolio picker', async () => {
    share({ revoked_at: past });
    const { subjects } = await portfolioSubjects(DELEGATE);
    expect(subjects.map(s => s.ownerId)).toEqual([DELEGATE]);
    reset(); share({});
    expect((await portfolioSubjects(DELEGATE)).subjects.map(s => s.role)).toEqual(['owner', 'delegate']);
  });
});

describe('report download links', () => {
  it('owner, live share and staff can download; the copy verifies against its fingerprint', async () => {
    await publishFictional(); share({});
    for (const actor of [OWNER, DELEGATE, STAFF]) {
      const r = await reportSnapshot(actor, 'rep-1');
      expect(r.integrity).toBe('verified');
      expect((r.snapshot as any).view.totals[0].valueCents).toBe(100_00);
    }
  });
  it('a direct link opened by a revoked share, a fund manager, staff without reporting or a stranger looks like a missing report', async () => {
    await publishFictional(); share({ revoked_at: past });
    for (const actor of [DELEGATE, MANAGER, LEGAL, STRANGER]) await expect(reportSnapshot(actor, 'rep-1')).rejects.toThrow('Report not found.');
    await expect(reportSnapshot(OWNER, 'rep-unknown')).rejects.toThrow('Report not found.');
  });
  it('a stored copy that no longer matches its fingerprint is flagged, not silently served as verified', async () => {
    await publishFictional();
    tables['wealth_report_versions']![0].snapshot.view.totals[0].valueCents = 999_00;
    expect((await reportSnapshot(OWNER, 'rep-1')).integrity).toBe('unverified');
  });
  it('report lists and change history follow the same rule', async () => {
    await publishFictional();
    await denied(reportList(MANAGER, OWNER));
    await denied(auditTrail(STRANGER, OWNER));
    expect(await reportList(STAFF, OWNER)).toHaveLength(1);
  });
});

describe('writes are owner-only by construction', () => {
  it('every write server function passes the signed-in user as owner, never a requested owner', () => {
    const src = readFileSync(join(__dirname, 'wealth-portfolio.functions.ts'), 'utf8');
    for (const fn of ['saveRecord', 'importPreview', 'importCommit', 'publishQuarterReport']) {
      const call = src.slice(src.indexOf(`.${fn}(`), src.indexOf(`.${fn}(`) + 120);
      expect(call).toMatch(/context\.userId/);
      expect(call).not.toMatch(/ownerUserId/);
    }
  });
});
