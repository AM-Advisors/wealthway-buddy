import { beforeEach, describe, expect, it, vi } from 'vitest'
const managedSend = vi.hoisted(() => vi.fn(async (_payload: any, _options: any): Promise<any> => ({ success: true, message_id: 'managed-message' })))
vi.mock('@lovable.dev/email-js', () => ({ sendLovableEmail: managedSend }))
vi.mock('@/lib/client-inbox.server', () => ({ recordClientInboxCopy: async () => null }))
import { sendTemplateEmail } from './email-templates/send-email'

beforeEach(() => { vi.stubEnv('LOVABLE_API_KEY', 'synthetic-test-key'); vi.stubEnv('BREVO_API_KEY', ''); managedSend.mockReset(); managedSend.mockResolvedValue({ success: true, message_id: 'managed-message' }) })
describe('managed single-recipient approval delivery', () => {
  it('uses managed delivery and a stable event key without a legacy provider credential', async () => {
    const result = await sendTemplateEmail('investment-approval', 'synthetic@example.com', { managed: true, idempotencyKey: 'event-one', templateData: { action: 'fund', fundName: 'Synthetic Fund', instructionsAvailable: true } })
    expect(result.sent).toBe(true)
    expect(managedSend).toHaveBeenCalledTimes(1)
    expect(managedSend.mock.calls[0]?.[0]).toMatchObject({ to: 'synthetic@example.com', sender_domain: 'notify.harmonious.co', label: 'investment-approval' })
    expect(managedSend.mock.calls[0]?.[1]?.idempotencyKey).toBe('event-one')
  })
  it('respects suppressed recipients without retrying', async () => {
    managedSend.mockRejectedValueOnce({ code: 'recipient_suppressed' })
    expect(await sendTemplateEmail('investment-approval', 'synthetic@example.com', { managed: true })).toEqual({ sent: false, reason: 'recipient_suppressed' })
    expect(managedSend).toHaveBeenCalledTimes(1)
  })
  it('does not treat a failed managed send as successful', async () => {
    managedSend.mockResolvedValueOnce({ success: false, status: 'rejected' })
    await expect(sendTemplateEmail('investment-approval', 'synthetic@example.com', { managed: true })).rejects.toThrow('could not be sent')
  })
})