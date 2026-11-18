import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { render } from '@react-email/render'
import { TEMPLATES } from './registry'

// Rule: investor and client emails say "Harmonious", never the employee who triggered the send.
const STAFF = 'Pat Employee'
const cases: [string, Record<string, any>][] = [
  ['client-invitation', { contactName: 'Jo', clientName: 'Acme', invitedByName: STAFF, note: 'Welcome' }],
  ['fund-invitation', { inviteeName: 'Jo', offeringName: 'Fund I', invitedByName: STAFF }],
  ['fund-invitation', { inviteeName: 'Jo', offeringName: 'Fund I', invitedByName: STAFF, role: 'fund_manager' }],
  ['signing-reminder', { recipientName: 'Jo', fundName: 'Fund I', requestedBy: STAFF }],
  ['documents-sent', { investorName: 'Jo', fundName: 'Fund I', senderName: STAFF, documents: ['OA'] }],
  ['investor-welcome', { investorName: 'Jo', offeringName: 'Fund I', reviewerName: STAFF }],
  ['investment-onboarding', { investorName: 'Jo', fundName: 'Fund I', managerName: STAFF }],
]

describe('investor and client emails name Harmonious as sender', () => {
  for (const [name, data] of cases) {
    it(`${name} ${data['role'] ?? ''} omits the triggering employee`, async () => {
      const t = TEMPLATES[name]!
      const text = await render(React.createElement(t.component, data), { plainText: true })
      expect(text).not.toContain(STAFF)
      expect(text).toContain('Harmonious')
    })
  }
})
