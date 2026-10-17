import type { JourneyStepView } from './investor-journey-model'

export const PROGRESS_FREQUENCIES = ['immediate', 'daily', 'weekly', 'off'] as const
export type ProgressFrequency = (typeof PROGRESS_FREQUENCIES)[number]
export const PROGRESS_FREQUENCY_LABELS: Record<ProgressFrequency, string> = {
  immediate: 'As each step completes', daily: 'Daily summary', weekly: 'Weekly summary', off: 'Off',
}
export function progressFrequency(value: unknown): ProgressFrequency {
  return PROGRESS_FREQUENCIES.find((v) => v === value) ?? 'off'
}
export function progressDue(frequency: ProgressFrequency, firstEventAt: string, now = Date.now()) {
  if (frequency === 'off') return false
  const delay = frequency === 'daily' ? 86400000 : frequency === 'weekly' ? 604800000 : 0
  return now >= Date.parse(firstEventAt) + delay
}
export function newlyCompletedSteps(steps: JourneyStepView[], recorded: string[]) {
  return steps.filter((step) => step.state === 'complete' && !recorded.includes(step.key))
}
export function progressRecipientAllowed(audience: 'investor' | 'manager', userId: string, investorId: string | null, managerIds: string[]) {
  return audience === 'investor' ? userId === investorId : managerIds.includes(userId)
}