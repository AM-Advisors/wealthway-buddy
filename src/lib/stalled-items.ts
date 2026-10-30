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

/** Exact next action and who owns it for an investor stuck at a stage. */
export const STAGE_ACTION: Record<string, { action: string; owner: "Investor" | "Fund manager" }> = {
  profile_selected: { action: "Investor needs to finish About You", owner: "Investor" },
  eligibility: { action: "Investor needs to answer the eligibility questions", owner: "Investor" },
  verification: { action: "Investor needs to finish the ID check", owner: "Investor" },
  tax: { action: "Investor needs to complete the tax form", owner: "Investor" },
  signature: { action: "Investor needs to sign the subscription documents", owner: "Investor" },
  harmonious_review: { action: "Fund manager needs to approve the investor to send funds", owner: "Fund manager" },
  approved_to_fund: { action: "Investor needs to send the wire", owner: "Investor" },
  awaiting_funds: { action: "Harmonious needs to match the received wire", owner: "Harmonious" },
};
export const INVESTOR_STALL_DAYS = 7;
export function investorStageAction(stage: string | null | undefined) {
  return STAGE_ACTION[String(stage ?? "")] ?? null;
}
