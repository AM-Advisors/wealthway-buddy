import { describe, it, expect } from 'vitest';
import { isExactMatch, pickSurvivor, planEmailGroup } from './person-merge-model';
const p = (id: string, o: any = {}) => ({ id, email: 'a@x.com', legal_first_name: 'Calvin', legal_last_name: 'Jung', date_of_birth: null, user_id: null, created_at: `2026-0${id}-01`, ...o });
describe('person merge rules', () => {
  it('merges same email + name automatically', () => { expect(isExactMatch(p('1'), p('2', { email: 'A@X.com ' }))).toBe(true); });
  it('flags same email with a different name (e.g. shared inbox)', () => { expect(planEmailGroup([p('1'), p('2', { legal_first_name: 'Jane' })])).toEqual({ merges: [], flags: [['1', '2']] }); });
  it('never merges different dates of birth or different accounts', () => {
    expect(isExactMatch(p('1', { date_of_birth: '1980-01-01' }), p('2', { date_of_birth: '1981-01-01' }))).toBe(false);
    expect(isExactMatch(p('1', { user_id: 'u1' }), p('2', { user_id: 'u2' }))).toBe(false);
  });
  it('keeps the record with an account, else the oldest', () => {
    expect(pickSurvivor(p('1'), p('2', { user_id: 'u' }))[0].id).toBe('2');
    expect(pickSurvivor(p('3'), p('1'))[0].id).toBe('1');
  });
  it('never merges an already merged record', () => { expect(isExactMatch(p('1', { merged_into_person_id: 'z' }), p('2'))).toBe(false); });
});
