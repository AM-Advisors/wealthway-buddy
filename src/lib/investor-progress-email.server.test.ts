import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ audit: [] as any[], events: [] as any[], sent: [] as any[], investor: 'investor-a', managers: ['manager-a'] }))
function query(table: string) {
  let action = 'select', payload: any, single = false
  const filters: ((row: any) => boolean)[] = []
  const q: any = {
    select: () => q,
    eq: (key: string, value: unknown) => { filters.push((r) => r[key] === value); return q },
    is: (key: string, value: unknown) => { filters.push((r) => (r[key] ?? null) === value); return q },
    in: (key: string, values: unknown[]) => { filters.push((r) => values.includes(r[key])); return q },
    or: () => q, order: () => q, limit: () => q,
    maybeSingle: () => { single = true; return q },
    update: (data: any) => { action = 'update'; payload = data; return q },
    insert: (data: any) => { action = 'insert'; payload = data; return q },
    then: (resolve: any) => {
      let rows: any[] = []
      if (table === 'offering_audit_events') {
        if (action === 'insert') state.audit.unshift({ ...payload, created_at: new Date().toISOString() })
        rows = state.audit
      } else if (table === 'notification_events') rows = state.events
      else if (table === 'investor_onboardings') rows = [{ id: 'investment-a', offering_id: 'fund-a', investor_user_id: state.investor, removed_at: null }]
      else if (table === 'fund_managers') rows = state.managers.map((user_id) => ({ user_id, offering_id: 'fund-a' }))
      else if (table === 'profiles') rows = [{ user_id: 'manager-a', email: 'manager@example.test', legal_name: 'Manager' }, { user_id: 'investor-a', email: 'investor@example.test', legal_name: 'Investor' }]
      else if (table === 'offerings') rows = [{ id: 'fund-a', name: 'Synthetic Fund' }]
      rows = rows.filter((row) => filters.every((f) => f(row)))
      if (action === 'update') rows.forEach((r) => Object.assign(r, payload))
      return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve)
    },
  }
  return q
}
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: query } }))
vi.mock('./email-templates/send-email', () => ({ sendTemplateEmail: vi.fn(async (...args: any[]) => { state.sent.push(args); return { sent: true } }) }))
import { drainProgressEmails, getProgressSettings, saveProgressSettings } from './investor-progress-email.server'

const event = (audience = 'investor', recipient = 'investor-a') => ({ id: 'event-a', offering_id: 'fund-a', investor_user_id: 'investor-a', event_kind: 'investor_step_progress', sent_at: null, claimed_at: null, created_at: '2026-01-01T00:00:00Z', metadata: { audience, recipient_user_id: recipient, onboarding_id: 'investment-a', step_label: 'About You' } })
describe('progress settings and delivery', () => {
  beforeEach(() => { state.audit = []; state.events = []; state.sent = []; state.investor = 'investor-a'; state.managers = ['manager-a'] })
  it('reads back independently saved investor and manager frequencies', async () => {
    await saveProgressSettings({ from: query }, 'fund-a', 'manager-a', { investor: 'immediate', manager: 'weekly' })
    expect(await getProgressSettings({ from: query }, 'fund-a')).toEqual({ investor: 'immediate', manager: 'weekly' })
  })
  it('delivers only the investment owner and acknowledges the completion', async () => {
    await saveProgressSettings({ from: query }, 'fund-a', 'manager-a', { investor: 'immediate', manager: 'off' })
    state.events = [event()]
    await drainProgressEmails()
    expect(state.sent[0]?.[1]).toBe('investor@example.test')
    expect(state.sent[0]?.[2].templateData.completedSteps).toEqual(['About You'])
    expect(state.events[0].sent_at).not.toBeNull()
    await drainProgressEmails()
    expect(state.sent).toHaveLength(1)
  })
  it('refuses a manager who no longer belongs to the fund', async () => {
    await saveProgressSettings({ from: query }, 'fund-a', 'manager-a', { investor: 'off', manager: 'immediate' })
    state.events = [event('manager', 'manager-a')]
    state.managers = []
    await drainProgressEmails()
    expect(state.sent).toHaveLength(0)
  })
})