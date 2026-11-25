import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, vault: new Map<string, string>(), reconciles: vi.fn(), fills: [] as string[], fail: false }));
vi.mock('@/lib/irs-forms.server', () => ({ encryptTin: async (v: string) => ({ ciphertext: v, iv: 'fictional', keyVersion: 1 }), decryptTin: async (v: string) => v }));
vi.mock('@/lib/investor-onboarding.server', () => ({ reconcileReadinessForSubjects: state.reconciles }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  from: (table: string) => {
    const filters: ((r: any) => boolean)[] = [];
    let one = false;
    let limit = Infinity;
    let insert: any = null;
    const query: any = {
      select: () => query,
      eq: (key: string, value: any) => { filters.push((r) => r[key] === value); return query; },
      is: (key: string, value: any) => { filters.push((r) => (r[key] ?? null) === value); return query; },
      limit: (value: number) => { limit = value; return query; },
      maybeSingle: () => { one = true; return query; },
      insert: (value: any) => { insert = value; return query; },
      then: (resolve: (v: unknown) => unknown) => {
        if (insert) (state.tables[table] ??= []).push({ id: 'suggestion', ...insert });
        const rows = (state.tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, limit);
        return Promise.resolve({ data: one ? rows[0] ?? null : rows, error: null }).then(resolve);
      },
    };
    return query;
  },
  rpc: async (name: string, args: any) => {
    if (name.startsWith('read_')) {
      const key = `${name === 'read_person_tax_id' ? 'persons' : 'investment_profiles'}:${args._person ?? args._profile}`;
      const stored = state.vault.get(key);
      return { data: stored ? [{ ciphertext: stored, iv: 'fictional' }] : [], error: null };
    }
    if (state.fail) return { data: null, error: { message: 'fictional secure-write failure' } };
    const key = `${args._subject}:${args._id}`;
    const row = (state.tables[args._subject] ?? []).find((r) => r.id === args._id);
    if (!row) return { data: 'missing', error: null };
    if (state.vault.has(key) || row.tax_id_last4 || row.tax_id_type && row.tax_id_type !== args._kind) return { data: 'occupied', error: null };
    state.vault.set(key, args._ciphertext);
    row.tax_id_last4 = args._last4;
    if (args._subject === 'investment_profiles') row.tax_id_type = args._kind;
    state.fills.push(key);
    return { data: 'filled', error: null };
  },
} }));
import { captureVerifiedTaxIdentifiers } from './verified-tax-identifier.server';
const decision = { status: 'Approved', session_kind: 'user', id_verifications: [{ status: 'Approved', issuing_state: 'USA', first_name: 'Jane', last_name: 'Example', date_of_birth: '1980-02-03', verification_method: 'id_lookup', id_lookup: { outcome: 'match', comparison: [{ field: 'ssn', record: '123456789', provided: '123456789', result: 'match' }] } }] };
const run = () => captureVerifiedTaxIdentifiers({ decision, sessionId: 'check', personId: 'person', identityApproved: true });
beforeEach(() => {
  state.vault.clear(); state.fills = []; state.fail = false; state.reconciles.mockReset();
  state.tables = {
    persons: [{ id: 'person', user_id: 'user', legal_first_name: 'Jane', legal_last_name: 'Example', date_of_birth: '1980-02-03', merged_into_person_id: null }],
    investment_profiles: [{ id: 'individual', person_id: 'person', profile_type: 'individual' }, { id: 'trust', person_id: 'person', profile_type: 'trust' }, { id: 'other', person_id: 'other', profile_type: 'individual' }],
    investor_onboardings: [{ id: 'investment', person_id: 'person', investment_profile_id: 'trust', questionnaire_didit_session_id: 'check', removed_at: null }],
  };
});
describe('fictional verification completion and protected read-back', () => {
  it('saves to the exact person and individual profile, never their trust or another person', async () => {
    expect(await run()).toEqual({ filled: 2 });
    expect(state.fills).toEqual(['persons:person','investment_profiles:individual']);
    expect(state.tables['persons']?.[0]?.tax_id_last4).toBe('6789');
    expect(state.tables['investment_profiles']?.[0]?.tax_id_type).toBe('ssn');
    expect(await run()).toEqual({ filled: 0 });
    expect(state.tables['investor_record_suggestions'] ?? []).toHaveLength(0);
  });
  it('compares the full secured number and flags even a same-last-four conflict without overwriting', async () => {
    state.vault.set('persons:person','234566789');
    await run(); await run();
    expect(state.vault.get('persons:person')).toBe('234566789');
    expect(state.vault.has('investment_profiles:individual')).toBe(false);
    const reviews = state.tables['investor_record_suggestions'] ?? [];
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.field).toBe('tax_id_verification_conflict');
    expect(JSON.stringify(reviews)).not.toMatch(/123456789|234566789|6789/);
  });
  it('never captures a number without a recorded exact-person session', async () => {
    state.tables['investor_onboardings'] = [];
    expect(await run()).toEqual({ filled: 0 });
    expect(state.fills).toHaveLength(0);
  });
  it('secure write failure never leaves a masked completion marker', async () => {
    state.fail = true;
    await expect(run()).rejects.toThrow('could not be stored securely');
    expect(state.tables['persons']?.[0]?.tax_id_last4).toBeUndefined();
  });
  it('saves the exact business EIN without changing either trustee’s SSN', async () => {
    const trust = state.tables['investment_profiles']?.[1];
    if (!trust) throw new Error('Missing fictional trust');
    trust.legal_name = 'Example Trust';
    const business = { status: 'Approved', session_kind: 'business', registry_checks: [{ status: 'Approved', company: { status: 'Approved', is_from_registry: true, country_code: 'USA', company_name: 'Example Trust', tax_number: '12-3456789' } }] };
    expect(await captureVerifiedTaxIdentifiers({ decision: business, sessionId: 'check', onboardingId: 'investment' })).toEqual({ filled: 1 });
    expect(state.fills).toEqual(['investment_profiles:trust']);
    expect(trust.tax_id_type).toBe('ein');
    expect(state.tables['persons']?.[0]?.tax_id_last4).toBeUndefined();
    expect(await captureVerifiedTaxIdentifiers({ decision: business, sessionId: 'unlinked', onboardingId: 'investment' })).toEqual({ filled: 0 });
  });
  it('a trust’s locked SSN choice is never changed to EIN by a business result', async () => {
    const trust = state.tables['investment_profiles']?.[1];
    if (!trust) throw new Error('Missing fictional trust');
    Object.assign(trust, { legal_name: 'Example Trust', tax_id_type: 'ssn' });
    const business = { status: 'Approved', session_kind: 'business', registry_checks: [{ status: 'Approved', company: { status: 'Approved', is_from_registry: true, country_code: 'USA', company_name: 'Example Trust', tax_number: '12-3456789' } }] };
    expect(await captureVerifiedTaxIdentifiers({ decision: business, sessionId: 'check', onboardingId: 'investment' })).toEqual({ filled: 0 });
    expect(trust.tax_id_type).toBe('ssn');
    expect(state.tables['investor_record_suggestions']?.[0]?.field).toBe('tax_id_verification_conflict');
  });
});