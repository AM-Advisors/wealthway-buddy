import { describe, it, expect } from 'vitest';
import { canReadFundHistory, normaliseSteps } from './investor-step-history-model';
const ctx = (viewerIsStaff: boolean) => ({ viewerIsStaff, staffIds: new Set(['s']), investorIds: new Set(['i']), names: new Map([['s', 'Alyssa'], ['m', 'Dustin'], ['i', 'Calvin']]) });
describe('investor step history', () => {
  it('managers only read funds they manage', () => {
    expect(canReadFundHistory({ isStaff: false, managedOfferingIds: ['a'] }, 'b')).toBe(false);
    expect(canReadFundHistory({ isStaff: false, managedOfferingIds: ['a'] }, 'a')).toBe(true);
  });
  it('masks staff names for managers and labels actors', () => {
    const raw = [{ id: '1', at: '2026-10-01', onboardingId: 'o', kind: 'step' as const, event: 'approved_to_fund', actorId: 's' }, { id: '2', at: '2026-10-02', onboardingId: 'o', kind: 'change' as const, event: 'amount', actorId: 'm', before: 100, after: 500000 }];
    const m = normaliseSteps(raw, ctx(false));
    expect(m.find((e) => e.id === '1')!.who).toBe('Harmonious team');
    expect(m.find((e) => e.id === '2')!.who).toBe('Dustin (fund manager)');
    expect(normaliseSteps(raw, ctx(true)).find((e) => e.id === '1')!.who).toBe('Alyssa (Harmonious)');
  });
  it('never guesses a missing actor', () => {
    expect(normaliseSteps([{ id: '1', at: 'x', onboardingId: null, kind: 'step', event: 'accepted', actorId: null }], ctx(false))[0]!.who).toBe('Not recorded');
  });
});
