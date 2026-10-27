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
  k1SetCents: 250000,
  k1FirstYear: 2026,
} as const;

export function roasAnnualK1Charges(year: number) {
  if (!Number.isInteger(year) || year < ROAS_BILLING_TERMS.k1FirstYear || year > 9999) throw new Error("Choose a tax year starting in 2026.");
  return ["LP entity", "Management company"].map(entity => ({ entity, amountCents: ROAS_BILLING_TERMS.k1SetCents, dueOn: `${year}-12-31` }));
}

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