import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ send: vi.fn(), get: vi.fn(), create: vi.fn(), invite: vi.fn() }))
vi.mock('@/lib/email-templates/send-email', () => ({ sendTemplateEmail: mocks.send }))
vi.mock('@/lib/investor-onboarding.server', () => ({ getPersonalLink: mocks.get, createPersonalLink: mocks.create, sendPersonalLink: mocks.invite }))
vi.mock('@/lib/fund-tabs.server', () => ({ isStaff: async () => true }))
import { autoSendSubscriptionReady, sendSubscriptionSignNotice } from './subscription-sign-notice.server'

function fakeDb(overrides: Record<string, unknown> = {}) {
  const ob = { id: 'fictional-investment', offering_id: 'fictional-fund', investor_user_id: null, stage: 'signature', removed_at: null, persons: { email: 'CASEY@example.test', legal_first_name: 'Casey' }, ...overrides }
  return {
    from: (table: string) => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === 'investor_onboardings' ? ob : { name: 'Fictional fund' } }) }
      return q
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'account@example.test', user_metadata: { name: 'Casey' } } } }) } },
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.send.mockResolvedValue({ sent: true })
  mocks.get.mockResolvedValue({ link: { state: 'active', url: 'https://onboard.harmonious.co/onboard/fictional-token' } })
  mocks.invite.mockResolvedValue({ emailSent: true })
})
describe('subscription emails before account creation', () => {
  it('automatically emails the recorded person with their exact invitation, without requiring an account', async () => {
    expect(await autoSendSubscriptionReady(fakeDb(), 'fictional-investment', 'staff')).toEqual({ sent: true })
    expect(mocks.get).toHaveBeenCalledWith('staff', 'fictional-investment')
    expect(mocks.send).toHaveBeenCalledWith('signing-reminder', 'casey@example.test', expect.objectContaining({ idempotencyKey: 'subscription-ready:fictional-investment', templateData: expect.objectContaining({ ctaUrl: 'https://onboard.harmonious.co/onboard/fictional-token', ctaLabel: 'Accept invite and open documents' }) }))
  })
  it('creates a missing invite through the authorized canonical engine', async () => {
    mocks.get.mockResolvedValueOnce({ link: null })
    await autoSendSubscriptionReady(fakeDb(), 'fictional-investment', 'staff')
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith('staff', 'fictional-investment')
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('manual send emails both the invite and documents to the recorded person', async () => {
    expect(await sendSubscriptionSignNotice(fakeDb(), 'staff', { fundId: 'fictional-fund', onboardingId: 'fictional-investment' })).toEqual({ sent: true, invited: true })
    expect(mocks.invite).toHaveBeenCalledExactlyOnceWith('staff', 'fictional-investment')
    expect(mocks.send).toHaveBeenCalledWith('signing-reminder', 'casey@example.test', expect.objectContaining({ templateData: expect.objectContaining({ ctaUrl: 'https://onboard.harmonious.co/onboard/fictional-token' }) }))
  })
  it('retains account email and signing destination for claimed investments', async () => {
    await autoSendSubscriptionReady(fakeDb({ investor_user_id: 'fictional-user' }), 'fictional-investment')
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledWith('signing-reminder', 'account@example.test', expect.objectContaining({ templateData: expect.objectContaining({ ctaUrl: 'https://app.harmonious.co/investment/fictional-investment?step=sign' }) }))
  })
  it('never replaces disabled invitations automatically', async () => {
    mocks.get.mockResolvedValue({ link: { state: 'disabled', url: 'https://example.test/disabled' } })
    expect(await autoSendSubscriptionReady(fakeDb(), 'fictional-investment', 'staff')).toEqual({ sent: false })
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('does not claim delivery when the recipient is suppressed', async () => {
    mocks.send.mockResolvedValue({ sent: false, reason: 'recipient_suppressed' })
    expect(await autoSendSubscriptionReady(fakeDb(), 'fictional-investment', 'staff')).toEqual({ sent: false })
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('refuses pre-account automatic sends without an authorized actor', async () => {
    expect(await autoSendSubscriptionReady(fakeDb(), 'fictional-investment')).toEqual({ sent: false })
    expect(mocks.send).not.toHaveBeenCalled()
  })
})