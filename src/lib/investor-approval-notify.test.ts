import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.hoisted(() => vi.fn(async (_template: string, _recipient: string, _options: Record<string, any>) => ({ sent: true })))
const funding = vi.hoisted(() => vi.fn(async () => ({ unlocked: true, instructions: { account: 'private-account' } })))
vi.mock('@/lib/email-templates/send-email', () => ({ sendTemplateEmail: send }))
vi.mock('@/lib/investor-onboarding.server', () => ({ fundingInstructions: funding }))
import { sendInvestorApprovalNotice } from './investor-approval-notify.server'

function fixture(over: Record<string, any> = {}) {
  const rows: Record<string, any[]> = {
    investor_onboardings: [{ id: 'investment', offering_id: 'fund', investor_user_id: 'investor', person_id: 'person', stage: 'harmonious_review', approved_to_fund_at: '2026-10-21', approved_to_fund_by: 'manager', ...over }],
    fund_managers: [{ user_id: 'manager' }, { user_id: 'second-manager' }],
    offerings: [{ name: 'Synthetic Fund' }], persons: [{ legal_first_name: 'Test', legal_last_name: 'Investor' }],
  }
  return {
    from(table: string) {
      let data = rows[table] ?? []
      const chain: any = { select: () => chain, order: () => chain,
        eq: (key: string, value: any) => { data = data.filter((r) => r[key] === value || !(key in r)); return chain },
        maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
        then: (resolve: any) => resolve({ data, error: null }),
      }
      return chain
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.com`, email_confirmed_at: over.unverified ? null : '2026-10-20' } }, error: null }) } },
  }
}
beforeEach(() => { send.mockClear(); funding.mockReset(); funding.mockResolvedValue({ unlocked: true, instructions: { account: 'private-account' } }) })

describe('investor approval event emails', () => {
  it('sends review to one responsible fund manager, never the investor or a broadcast', async () => {
    await sendInvestorApprovalNotice(fixture({ assigned_to: 'second-manager' }), { onboardingId: 'investment', action: 'review', ref: 'signature-1' })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[1]).toBe('second-manager@example.com')
  })
  it('does not send to an assigned staff member outside the fund manager list', async () => {
    await sendInvestorApprovalNotice(fixture({ assigned_to: 'staff' }), { onboardingId: 'investment', action: 'review', ref: 'signature-1' })
    expect(send.mock.calls[0]?.[1]).toBe('manager@example.com')
  })
  it('sends countersign notice only to the assigned same-fund signatory', async () => {
    await sendInvestorApprovalNotice(fixture(), { onboardingId: 'investment', action: 'sign', ref: 'sig', signerUserId: 'second-manager' })
    expect(send.mock.calls[0]?.[1]).toBe('second-manager@example.com')
    send.mockClear()
    await sendInvestorApprovalNotice(fixture(), { onboardingId: 'investment', action: 'sign', ref: 'sig', signerUserId: 'outside-manager' })
    expect(send).not.toHaveBeenCalled()
  })
  it('notifies the verified owning investor after exact-fund manager funding approval', async () => {
    await sendInvestorApprovalNotice(fixture({ stage: 'awaiting_funds' }), { onboardingId: 'investment', action: 'fund', ref: 'approval' })
    expect(send.mock.calls[0]?.[1]).toBe('investor@example.com')
    expect(send.mock.calls[0]?.[2]).toMatchObject({ managed: true, templateData: { action: 'fund', instructionsAvailable: true, portalUrl: 'https://app.harmonious.co/investment/investment?step=fund' } })
    expect(JSON.stringify(send.mock.calls)).not.toContain('private-account')
  })
  it('never sends funding confirmation before approval', async () => {
    await sendInvestorApprovalNotice(fixture({ approved_to_fund_at: null }), { onboardingId: 'investment', action: 'fund', ref: 'approval' })
    expect(send).not.toHaveBeenCalled()
  })
  it('refuses funding notices approved by an unrelated actor', async () => {
    await sendInvestorApprovalNotice(fixture({ approved_to_fund_by: 'staff' }), { onboardingId: 'investment', action: 'fund', ref: 'approval' })
    expect(send).not.toHaveBeenCalled()
  })
  it('does not claim instructions are available when the canonical funding read is locked', async () => {
    funding.mockResolvedValueOnce({ unlocked: false, instructions: null } as any)
    await sendInvestorApprovalNotice(fixture(), { onboardingId: 'investment', action: 'fund', ref: 'approval' })
    expect(send.mock.calls[0]?.[2]).toMatchObject({ templateData: { instructionsAvailable: false } })
  })
  it('retries reuse the same event and recipient idempotency key', async () => {
    const input = { onboardingId: 'investment', action: 'review' as const, ref: 'sig-123' }
    await sendInvestorApprovalNotice(fixture(), input)
    await sendInvestorApprovalNotice(fixture(), input)
    expect(send.mock.calls[0]?.[2]?.idempotencyKey).toBe('investment-approval:review:sig-123:manager')
    expect(send.mock.calls[1]?.[2]?.idempotencyKey).toBe(send.mock.calls[0]?.[2]?.idempotencyKey)
  })
  it('does not notify unverified email addresses or removed investments', async () => {
    await sendInvestorApprovalNotice(fixture({ unverified: true }), { onboardingId: 'investment', action: 'review', ref: 'sig' })
    await sendInvestorApprovalNotice(fixture({ removed_at: '2026-10-21' }), { onboardingId: 'investment', action: 'review', ref: 'sig' })
    expect(send).not.toHaveBeenCalled()
  })
})