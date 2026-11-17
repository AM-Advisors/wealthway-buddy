/** Fund × role checkbox grid: what to add and remove compared with the saved scopes. */
export type ScopePair = { offeringId: string; role: string };
const k = (p: ScopePair) => `${p.offeringId}|${p.role}`;
export function scopeDiff(current: ScopePair[], ticked: ScopePair[]) {
  const cur = new Set(current.map(k)), next = new Set(ticked.map(k));
  return { add: ticked.filter((p) => !cur.has(k(p))), remove: current.filter((p) => !next.has(k(p))) };
}
/** "Select all funds" for one role. */
export function selectAllFunds(ticked: ScopePair[], fundIds: string[], role: string, on: boolean): ScopePair[] {
  const rest = ticked.filter((p) => p.role !== role);
  return on ? [...rest, ...fundIds.map((offeringId) => ({ offeringId, role }))] : rest;
}
