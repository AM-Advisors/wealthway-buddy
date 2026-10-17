import { describe, expect, it } from 'vitest'
import { newlyCompletedSteps, progressDue, progressRecipientAllowed } from './investor-progress-email'

describe('investor progress updates', () => {
  it('only reports completed steps once', () => {
    expect(newlyCompletedSteps([
      { key: 'about', label: 'About You', state: 'complete', message: 'Done' },
      { key: 'verify', label: 'Verification', state: 'in_progress', message: 'Waiting' },
      { key: 'sign', label: 'Sign', state: 'complete', message: 'Signed' },
    ], ['about']).map((s) => s.key)).toEqual(['sign'])
  })
  it('supports immediate, 24-hour, 7-day and disabled frequency', () => {
    const at = '2026-10-17T22:21:00Z', start = Date.parse(at)
    expect(progressDue('immediate', at, start)).toBe(true)
    expect(progressDue('daily', at, start + 86400000 - 1)).toBe(false)
    expect(progressDue('daily', at, start + 86400000)).toBe(true)
    expect(progressDue('weekly', at, start + 604800000 - 1)).toBe(false)
    expect(progressDue('weekly', at, start + 604800000)).toBe(true)
    expect(progressDue('off', at, start + 604800000)).toBe(false)
  })
  it('investors receive only their own progress', () => {
    expect(progressRecipientAllowed('investor', 'alice', 'bob', ['alice'])).toBe(false)
    expect(progressRecipientAllowed('investor', 'bob', 'bob', [])).toBe(true)
  })
  it('managers must still belong to the exact fund', () => {
    expect(progressRecipientAllowed('manager', 'alice', 'bob', ['other'])).toBe(false)
    expect(progressRecipientAllowed('manager', 'alice', 'bob', ['alice'])).toBe(true)
  })
})