/** ROAS-specific confirmed terms; planning only, never a payment or activation. */
export const ROAS_BILLING_TERMS = {
  setupCents: 750000,
  includedInvestorCount: 100,
  lpFinancialsQuarterlyCents: 750000,
  managementAnnualCents: 200000,
  lpAnnualCents: 250000,
  lpAnnualPaidCents: 150000,
  managementFinancialsQuarterlyCents: 750000,
  managementFinancialsStart: "2026-10-01",
  whiteGloveQuarterlyCents: 1200000,
  whiteGloveStart: "2026-08-24",
} as const;

export function quarterCharge(startOn: string, fullQuarterCents: number, timing: "advance" | "arrears") {
  const date = new Date(`${startOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startOn) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== startOn) throw new Error("Provide a valid service date.");
  if (!Number.isSafeInteger(fullQuarterCents) || fullQuarterCents < 0) throw new Error("Provide a valid amount.");
  const quarterStart = Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1);
  const nextQuarter = Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3 + 3, 1);
  const day = 86400000;
  const quarterDays = (nextQuarter - quarterStart) / day;
  const serviceDays = (nextQuarter - date.getTime()) / day;
  const periodEnd = new Date(nextQuarter - day).toISOString().slice(0, 10);
  return {
    periodStart: startOn, periodEnd, quarterDays, serviceDays,
    // Service begins on the enrollment date, inclusive; round once to cents.
    amountCents: Math.round(fullQuarterCents * serviceDays / quarterDays),
    dueOn: timing === "advance" ? startOn : periodEnd,
  };
}