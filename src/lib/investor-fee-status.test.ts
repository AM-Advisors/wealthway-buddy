import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null as any, inserted: null as any }));
vi.mock('@/lib/fund-tabs.server', () => ({ db: async () => state.db, assertFund: vi.fn() }));
vi.mock('@/lib/investor-onboarding.server', () => ({ reconcileAfter: vi.fn(async () => undefined) }));
import { acceptFees, feeStatus } from './investor-extras.server';

function fixture(options: { sideLetterError?: boolean } = {}) {
  const rows: Record<string, any[]> = {
    investor_onboardings: [{ id: 'trust', offering_id: 'erebor', investor_user_id: 'owner', investment_profile_id: 'profile' }],
    investment_profiles: [{ id: 'profile', owner_user_id: 'owner' }],
    fund_fee_terms: [{ id: 'fees', offering_id: 'erebor', status: 'active', management_fee_pct: 6, carry_pct: 20, management_fee_basis: 'Committed capital', hurdle_pct: 0, notes: 'staff-only' }],
    investor_fee_acceptances: [{ onboarding_id: 'trust', fee_terms_id: 'fees', accepted_at: '2026-11-20', accepted_name: 'Recorded trustee' }],
    side_letters: [
      { id: 'letter', offering_id: 'erebor', onboarding_id: 'trust', status: 'active', effective_date: null, expiry_date: null, terms: [{ category: 'fee_discount', value: '0%' }, { category: 'carry_reduction', value: '0%' }] },
      { id: 'other', offering_id: 'other-fund', onboarding_id: 'trust', status: 'active', terms: [{ category: 'fee_discount', value: '10%' }] },
    ],
  };
  return { from(table: string) {
    let data = rows[table] ?? [];
    const error = table === 'side_letters' && options.sideLetterError ? { message: 'unavailable' } : null;
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain,
      eq: (key: string, value: unknown) => { data = data.filter(r => r[key] === value); return chain; },
      maybeSingle: async () => ({ data: data[0] ?? null, error }),
      insert: async (value: unknown) => { state.inserted = value; return { error: null }; },
      then: (resolve: any) => resolve({ data, error }),
    };
    return chain;
  } };
}

beforeEach(() => { state.db = fixture(); state.inserted = null; });

describe('authorized trust fee summary and acceptance', () => {
  it('reads back the linked trust’s 0% fees and retains the original acceptance', async () => {
    const result = await feeStatus('owner', 'trust');
    expect(result.terms).toMatchObject({ managementFeePct: 0, carryPct: 0, source: 'Side letter', notes: null });
    expect(result.accepted).toEqual({ at: '2026-11-20', name: 'Recorded trustee' });
    expect(state.inserted).toBeNull();
  });
  it('records the displayed 0% rates for a new acceptance instead of 6% and 20%', async () => {
    await acceptFees('owner', 'trust', 'fees', 'Trustee');
    expect(state.inserted).toMatchObject({ onboarding_id: 'trust', fee_terms_id: 'fees', terms: { management_fee_pct: 0, carry_pct: 0 } });
  });
  it('does not expose trust fees to another login', async () => {
    await expect(feeStatus('not-owner', 'trust')).rejects.toThrow("isn't available");
  });
  it('does not silently restore defaults when side letters cannot be read', async () => {
    state.db = fixture({ sideLetterError: true });
    await expect(feeStatus('owner', 'trust')).rejects.toThrow('could not be loaded');
  });
});