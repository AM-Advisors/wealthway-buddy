import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null as any, writes: [] as any[] }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  from: (table: string) => state.db.from(table),
  auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: id === 'helper' ? 'helper@example.com' : 'other@example.com' } } }) } },
} }));
vi.mock('@/lib/investor-onboarding.server', () => ({
  onboardingActor: async (id: string) => ({ userId: id, isStaff: true, managedOfferingIds: [] }),
  forbid: (message: string) => { throw new Error(message); },
}));
vi.mock('@/lib/manager-edit-window.server', () => ({ investorEditWindow: async () => true }));
import { activePreparer, contactWorkspace, listParticipants, myParticipantAssignments, preparerWorkspace } from './onboarding-participants.server';

const old = { id: 'old', onboarding_id: 'trust', offering_id: 'fund', role: 'contact', email: 'helper@example.com', full_name: 'Fictional Trustee', status: 'removed', removed_at: '2026-11-25', token: 'old-token', user_id: 'helper' };
const current = { ...old, id: 'current', role: 'preparer', status: 'active', removed_at: null, token: 'current-token' };
function fixture(options: { participants?: any[]; investment?: Record<string, unknown>; listed?: boolean; profileType?: string } = {}) {
  const rows: Record<string, any[]> = {
    onboarding_participants: options.participants ?? [old, current],
    investor_onboardings: [{ id: 'trust', offering_id: 'fund', stage: 'signature', removed_at: null, merged_into_onboarding_id: null, investment_profile_id: 'profile', funded_amount_cents: 5_000_000, persons: { legal_first_name: 'Fictional', legal_last_name: 'Investor' }, offerings: { name: 'Fictional Fund' }, investment_profiles: { profile_type: options.profileType ?? 'trust', legal_name: 'Fictional Family Trust' }, ...options.investment }],
    investment_profiles: [{ id: 'profile', profile_type: options.profileType ?? 'trust', legal_name: 'Fictional Family Trust', details: {} }],
    investment_profile_relationships: options.listed === false ? [] : [{ id: 'relationship', profile_id: 'profile', status: 'active', role: 'trustee', persons: { user_id: 'helper', email: 'helper@example.com', legal_first_name: 'Fictional', legal_last_name: 'Trustee' } }],
  };
  return { from(table: string) {
    let data = rows[table] ?? [];
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain,
      eq: (key: string, value: unknown) => { data = data.filter(r => r[key] === value); return chain; },
      neq: (key: string, value: unknown) => { data = data.filter(r => r[key] !== value); return chain; },
      in: (key: string, values: unknown[]) => { data = data.filter(r => values.includes(r[key])); return chain; },
      is: (key: string, value: unknown) => { data = data.filter(r => (r[key] ?? null) === value); return chain; },
      update: (value: unknown) => { state.writes.push(value); return chain; },
      maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data, error: null }),
    };
    return chain;
  } };
}

beforeEach(() => { state.db = fixture(); state.writes = []; });
describe('current paperwork access across Home and old contact entry', () => {
  it('Home shows only the live preparer and opens their current paperwork link', async () => {
    expect(await myParticipantAssignments('helper')).toEqual([expect.objectContaining({ id: 'current', role: 'preparer', roleLabel: 'Prepares details', href: '/onboard/prepare/current-token' })]);
  });
  it('an old removed contact link redirects using an existing current grant without restoring the old row', async () => {
    expect(await contactWorkspace('helper', 'old-token')).toEqual({ kind: 'preparer', prepareToken: 'current-token' });
    expect(state.writes).toEqual([]);
  });
  it('removed access alone never permits entry', async () => {
    state.db = fixture({ participants: [old] });
    await expect(contactWorkspace('helper', 'old-token')).rejects.toThrow('access has ended');
    await expect(activePreparer('helper', 'old')).rejects.toThrow('access has ended');
  });
  it('neither another email nor another bound login may use the link', async () => {
    await expect(contactWorkspace('other', 'old-token')).rejects.toThrow('account this invitation');
    state.db = fixture({ participants: [{ ...old, user_id: 'other' }, current] });
    await expect(contactWorkspace('helper', 'old-token')).rejects.toThrow('account this invitation');
  });
  it('a preparer assigned to another investment does not restore this investment', async () => {
    state.db = fixture({ participants: [old, { ...current, onboarding_id: 'other-investment' }] });
    await expect(contactWorkspace('helper', 'old-token')).rejects.toThrow('access has ended');
  });
  it('declined, cancelled, removed and merged investments stay unavailable', async () => {
    for (const investment of [{ stage: 'declined' }, { stage: 'cancelled' }, { removed_at: '2026-11-25' }, { merged_into_onboarding_id: 'other' }]) {
      state.db = fixture({ investment });
      await expect(contactWorkspace('helper', 'old-token')).rejects.toThrow('access has ended');
      await expect(activePreparer('helper', 'current')).rejects.toThrow('access has ended');
    }
  });
  it('lists an entitled trustee as preparing while keeping the recorded contact role intact', async () => {
    state.db = fixture({ participants: [{ ...current, role: 'contact' }] });
    const result = await listParticipants('staff', 'trust');
    expect(result.participants).toEqual([expect.objectContaining({ role: 'contact', canPrepare: true, roleLabel: 'Prepares details' })]);
    expect(await contactWorkspace('helper', 'current-token')).toEqual({ kind: 'preparer', prepareToken: 'current-token' });
  });
  it('a contact not listed on the trust still gets only a view', async () => {
    state.db = fixture({ participants: [{ ...current, role: 'contact' }], listed: false });
    const result = await contactWorkspace('helper', 'current-token');
    expect(result.kind).toBe('contact');
    expect(result.prepareToken).toBeNull();
    expect((await listParticipants('staff', 'trust')).participants[0]).toMatchObject({ canPrepare: false, roleLabel: 'Point of contact (view only)' });
  });
  it('keeps funded but unsigned paperwork editable in the preparer workspace', async () => {
    const workspace = await preparerWorkspace('helper', 'current-token');
    expect(workspace).toMatchObject({ onboardingId: 'trust', participantId: 'current', editable: true });
  });
  it('fails on ambiguous current invitations rather than guessing one', async () => {
    state.db = fixture({ participants: [old, current, { ...current, id: 'second', token: 'second-token' }] });
    await expect(contactWorkspace('helper', 'old-token')).rejects.toThrow('More than one');
  });
});