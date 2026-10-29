import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ kind: 'tax_form', fund: 'fund-a', status: 'new', writes: [] as { table: string; patch: any }[] }));
vi.mock('./fund-setup.server', () => ({ setupActor: async () => ({ isStaff: false, offeringIds: ['fund-a'] }), forbid: (m: string) => { throw new Error(m); } }));
vi.mock('./reviewer-activity.server', () => ({ logReviewerActivity: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (table: string) => {
  const q: any = { select: () => q, eq: () => q, update: (patch: any) => { state.writes.push({ table, patch }); return q; }, maybeSingle: async () => ({ data: table === 'investor_documents' ? { id: 'doc', offering_id: state.fund, onboarding_id: 'ob', investment_profile_id: 'profile', user_id: 'investor', uploaded_by: 'manager', doc_kind: state.kind, review_status: state.status } : { id: 'ob', offering_id: state.fund, investment_profile_id: 'profile', investor_user_id: 'investor', removed_at: null } }) };
  return q;
} } }));
import { reviewInvestorUpload } from './investor-upload-review.server';
describe('manager uploaded document review', () => {
  beforeEach(() => { state.kind = 'tax_form'; state.fund = 'fund-a'; state.status = 'new'; state.writes = []; });
  it('allows the manager to approve their own uploaded signed tax copy without certifying tax or signing', async () => {
    await reviewInvestorUpload('manager', { id: 'doc', status: 'accepted' });
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]?.table).toBe('investor_documents');
    expect(state.writes[0]?.patch.review_status).toBe('accepted');
    expect(state.writes[0]?.patch.reviewed_by).toBe('manager');
  });
  it('denies an unrelated fund', async () => { state.fund = 'fund-b'; await expect(reviewInvestorUpload('manager', { id: 'doc', status: 'accepted' })).rejects.toThrow(/do not manage/); expect(state.writes).toEqual([]); });
  it.each(['identification', 'proof_of_address', 'bank_letter', 'accreditation_proof'])('keeps %s on its dedicated protected path', async kind => { state.kind = kind; await expect(reviewInvestorUpload('manager', { id: 'doc', status: 'accepted' })).rejects.toThrow(/dedicated/); expect(state.writes).toEqual([]); });
  it('keeps reviewed originals unchanged', async () => { state.status = 'accepted'; await expect(reviewInvestorUpload('manager', { id: 'doc', status: 'accepted' })).rejects.toThrow(/already been reviewed/); expect(state.writes).toEqual([]); });
  it('requires an explanation when requesting more', async () => { await expect(reviewInvestorUpload('manager', { id: 'doc', status: 'needs_followup' })).rejects.toThrow(/Explain/); expect(state.writes).toEqual([]); });
});