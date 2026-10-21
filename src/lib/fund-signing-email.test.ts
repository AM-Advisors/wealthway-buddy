import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ approved: vi.fn(), detail: vi.fn(), resend: vi.fn(), remind: vi.fn() }));
vi.mock('@/lib/investor-document-review.server', () => ({ managerApprovedSigned: mocks.approved }));
vi.mock('@/lib/box.server', () => ({ getSignRequestDetail: mocks.detail, resendSignRequest: mocks.resend }));
vi.mock('@/lib/signing-reminder.server', () => ({ sendSigningReminder: mocks.remind }));
import { emailFundSignatory } from './fund-signing-email.server';

function db(overrides: Record<string, any> = {}) {
  const facts: Record<string, any> = {
    document_signatures: { id: 'signature', application_id: 'application', offering_document_id: 'document', provider_agreement_id: 'original', provider_status: 'out_for_signature' },
    investor_onboardings: { id: 'investment', offering_id: 'fund' },
    document_signature_signers: [{ role_key: 'investor', status: 'signed', signed_at: '2026-10-21T12:00:00Z' }, { id: 'thomas-row', role_key: 'fund_manager', status: 'sent', signer_user_id: 'thomas', signer_email: 'signer@example.test', signer_name: 'Test signatory', provider_signer_id: 'cs:counter-request' }],
    fund_managers: { id: 'assignment' }, offering_documents: { title: 'Subscription Agreement' }, ...overrides,
  };
  const calls: string[] = [];
  return { calls, from(table: string) {
    calls.push(table);
    const result = { data: facts[table], error: null };
    const chain: any = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => result, then: (resolve: any) => Promise.resolve(result).then(resolve) };
    return chain;
  } };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.approved.mockResolvedValue(true);
  mocks.detail.mockResolvedValue({ status: 'sent', signers: [{ email: 'signer@example.test', decision: null, externalUserId: null }] });
  mocks.resend.mockResolvedValue(undefined);
  mocks.remind.mockImplementation(async (_actor, input) => { await input.nativeSend?.(); return { sent: true }; });
});
const send = (database = db()) => emailFundSignatory(database, 'staff', { offeringId: 'fund', signatureId: 'signature' });
describe('fund-signatory signing email', () => {
  it('resends only the existing countersign request without modifying any signature', async () => {
    const database = db();
    await send(database);
    expect(mocks.resend).toHaveBeenCalledExactlyOnceWith('counter-request');
    expect(mocks.remind.mock.calls[0]?.[1].reminderKey).toBe('fund-signatory:signature:thomas-row');
    expect(database.calls).not.toContain('signature_audit_events');
  });
  it('emails an exact protected document link for an embedded request instead of converting it', async () => {
    mocks.detail.mockResolvedValue({ status: 'sent', signers: [{ email: 'signer@example.test', decision: null, externalUserId: 'embedded' }] });
    await send();
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.remind.mock.calls[0]?.[1].path).toBe('/manager/countersign/thomas-row');
  });
  it('refuses sending before saved manager approval', async () => {
    mocks.approved.mockResolvedValue(false);
    await expect(send()).rejects.toThrow('Approve');
    expect(mocks.remind).not.toHaveBeenCalled();
  });
  it('refuses sending before the investor personally signs', async () => {
    await expect(send(db({ document_signature_signers: [{ id: 'thomas-row', role_key: 'fund_manager', status: 'sent', signer_user_id: 'thomas', signer_email: 'signer@example.test' }] }))).rejects.toThrow('investor must finish');
    expect(mocks.resend).not.toHaveBeenCalled();
  });
  it('refuses a different fund', async () => {
    await expect(send(db({ investor_onboardings: { id: 'investment', offering_id: 'other' } }))).rejects.toThrow('not for this fund');
    expect(mocks.remind).not.toHaveBeenCalled();
  });
  it('refuses a removed signatory assignment', async () => {
    await expect(send(db({ fund_managers: null }))).rejects.toThrow('no longer assigned');
    expect(mocks.remind).not.toHaveBeenCalled();
  });
  it('never emails additional outstanding investors', async () => {
    mocks.detail.mockResolvedValue({ status: 'sent', signers: [{ email: 'signer@example.test', decision: null }, { email: 'investor@example.test', decision: null }] });
    await expect(send()).rejects.toThrow('signatory-only');
    expect(mocks.resend).not.toHaveBeenCalled();
  });
  it.each(['cancelled', 'completed', 'expired'])('refuses a %s provider request', async status => {
    mocks.detail.mockResolvedValue({ status, signers: [{ email: 'signer@example.test', decision: null }] });
    await expect(send()).rejects.toThrow('not ready');
    expect(mocks.remind).not.toHaveBeenCalled();
  });
  it('does not resend when the shared reminder limit refuses the send', async () => {
    mocks.remind.mockRejectedValue(new Error('Already sent in the last 24 hours'));
    await expect(send()).rejects.toThrow('24 hours');
    expect(mocks.resend).not.toHaveBeenCalled();
  });
});