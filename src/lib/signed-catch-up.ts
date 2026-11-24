/**
 * Investments whose investor signatures were recorded after the investment was last rechecked
 * (for example a signature fixed by staff or a missed signing-service notice). Rechecking them runs
 * the normal readiness engine, which submits the subscription only when the usual rules allow.
 * Nothing here marks anything signed.
 */
export type CatchUpRow = { id: string; stage: string; removed: boolean; executed: boolean; latestSignedAt: string | null; lastRecheckAt: string | null };

const CLOSED = new Set(["declined", "cancelled", "closed", "funded"]);

export function needsSignedRecheck(r: CatchUpRow): boolean {
  if (r.removed || r.executed || CLOSED.has(r.stage) || !r.latestSignedAt) return false;
  const signed = Date.parse(r.latestSignedAt);
  if (!Number.isFinite(signed)) return false;
  const checked = r.lastRecheckAt ? Date.parse(r.lastRecheckAt) : NaN;
  return !Number.isFinite(checked) || signed > checked;
}

export function pickSignedRechecks(rows: CatchUpRow[], limit = 25): string[] {
  return rows.filter(needsSignedRecheck)
    .sort((a, b) => Date.parse(a.latestSignedAt!) - Date.parse(b.latestSignedAt!))
    .slice(0, limit).map((r) => r.id);
}
