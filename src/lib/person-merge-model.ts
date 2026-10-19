import { normEmail, normName } from './person-resolution';
export type MergePerson = { id: string; email: string | null; legal_first_name: string | null; legal_last_name: string | null; date_of_birth: string | null; user_id: string | null; created_at: string; merged_into_person_id?: string | null };

/** Exact match: same email + same legal first/last name, and DOB equal when both have one; never two different accounts. */
export function isExactMatch(a: MergePerson, b: MergePerson) {
  if (a.id === b.id || a.merged_into_person_id || b.merged_into_person_id) return false;
  const e = normEmail(a.email); if (!e || e !== normEmail(b.email)) return false;
  if (!normName(a.legal_first_name) || normName(a.legal_first_name) !== normName(b.legal_first_name)) return false;
  if (!normName(a.legal_last_name) || normName(a.legal_last_name) !== normName(b.legal_last_name)) return false;
  if (a.date_of_birth && b.date_of_birth && a.date_of_birth !== b.date_of_birth) return false;
  if (a.user_id && b.user_id && a.user_id !== b.user_id) return false;
  return true;
}
/** Keep the record with an account, else the oldest. */
export function pickSurvivor(a: MergePerson, b: MergePerson): [MergePerson, MergePerson] {
  if (a.user_id && !b.user_id) return [a, b];
  if (b.user_id && !a.user_id) return [b, a];
  return a.created_at <= b.created_at ? [a, b] : [b, a];
}
/** Pairs in one email group: exact ones merge, the rest are flagged for staff. */
export function planEmailGroup(group: MergePerson[]) {
  const merges: [string, string][] = [], flags: [string, string][] = [];
  const live = group.filter((p) => !p.merged_into_person_id);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i]!, b = live[j]!;
    if (isExactMatch(a, b)) { const [k, d] = pickSurvivor(a, b); merges.push([k.id, d.id]); }
    else flags.push(a.id < b.id ? [a.id, b.id] : [b.id, a.id]);
  }
  return { merges, flags };
}
