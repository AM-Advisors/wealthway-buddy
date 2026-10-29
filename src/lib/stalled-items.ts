/**
 * Display-only stall rule for manager-owned fund work. Harmonious sees where
 * a fund is stuck; it never assigns, approves or changes the record.
 */
export const STALL_DAYS = { setupDraft: 3, launchReady: 3, signerCheck: 7 } as const;

export function daysWaiting(since: string | null | undefined, now: Date): number | null {
  if (!since) return null;
  const t = Date.parse(since);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function isStalled(since: string | null | undefined, now: Date, limitDays: number): boolean {
  const d = daysWaiting(since, now);
  return d !== null && d >= limitDays;
}

export function waitingLabel(since: string | null | undefined, now: Date): string {
  const d = daysWaiting(since, now);
  if (d === null) return "Waiting on the fund manager";
  return d === 0 ? "Waiting on the fund manager since today" : `Waiting on the fund manager for ${d} day${d === 1 ? "" : "s"}`;
}
