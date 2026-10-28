/** ROAS-specific confirmed terms; planning only, never a payment or activation. */
export const ROAS_BILLING_TERMS = {
  setupCents: 750000,
  includedInvestorCount: 100,
  lpFinancialsQuarterlyCents: 750000,
  managementAnnualCents: 250000,
  managementAnnualPaidCents: 100000,
  lpAnnualCents: 250000,
  lpAnnualPaidCents: 250000,
  managementFinancialsAnnualCents: 750000,
  managementFinancialsStart: "2026-10-01",
  whiteGloveQuarterlyCents: 1200000,
  whiteGloveStart: "2026-08-24",
  whiteGloveInitialProratedCents: 495652,
  k1SetCents: 250000,
  k1FirstYear: 2026,
} as const;

export const ROAS_ENTITIES = {
  lp: { name: "ROAS Hedge LP", id: "a2c62dbe-1f52-4dfb-91e1-8345be7eab8e", offeringId: "acb8193f-35fc-41cc-9ee5-629bde3e11b2" },
  management: { name: "ROAS Capital Management L.L.C.", id: "299b3c67-ec95-4e0a-8b49-621d9462f4ee", offeringId: null },
} as const;

export type RoasCharge = {
  key: string; entity: keyof typeof ROAS_ENTITIES; service: string; cadence: "Quarterly" | "Annual";
  year: number; period: string; dueOn: string; amountCents: number; reportedPaidCents: number;
};

/** 2027 is explicitly included now; later years open January 1, never a rolling extra year. */
export function roasVisibleYears(asOf: string) {
  const year = Number(asOf.slice(0, 4));
  if (!Number.isInteger(year) || year < 2026 || year > 9999) throw new Error("Choose a date starting in 2026.");
  return Array.from({ length: Math.max(2027, year) - 2026 + 1 }, (_, i) => 2026 + i);
}

/** Confirmed billing instructions, not invoices or a receipt ledger. */
export function roasChargesForYear(year: number): RoasCharge[] {
  roasAnnualK1Charges(year);
  const rows: RoasCharge[] = [];
  const add = (entity: RoasCharge["entity"], service: string, cadence: RoasCharge["cadence"], period: string, dueOn: string, amountCents: number, reportedPaidCents = 0) => {
    rows.push({ key: `${year}:${entity}:${service}:${period}`, entity, service, cadence, year, period, dueOn, amountCents, reportedPaidCents });
  };
  if (year === 2026) {
    // Agreed Q3 initial amount: 38 of 92 quarter days at $12,000, due now.
    add("lp", "White Glove Services, prorated", "Quarterly", "Aug 24 to Sep 30, 2026", ROAS_BILLING_TERMS.whiteGloveStart, ROAS_BILLING_TERMS.whiteGloveInitialProratedCents);
  }
  for (let quarter = year === 2026 ? 3 : 1; quarter <= 4; quarter++) {
    const end = new Date(Date.UTC(year, quarter * 3, 0)).toISOString().slice(0, 10);
    add("lp", "Hedge fund financials", "Quarterly", `Q${quarter} ${year}`, end, 750000, year === 2026 && quarter === 3 ? 750000 : 0);
    if (year > 2026 || quarter === 4) {
      const start = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
      add("lp", "White Glove Services", "Quarterly", `Q${quarter} ${year}`, start, 1200000);
    }
  }
  add("management", "Annual entity fee", "Annual", String(year), `${year}-08-31`, 250000, year === 2026 ? 100000 : 0);
  add("lp", "Annual entity fee", "Annual", String(year), `${year}-08-31`, 250000, year === 2026 ? 250000 : 0);
  add("lp", "K-1 set", "Annual", String(year), `${year}-12-31`, 250000);
  add("management", "K-1 set", "Annual", String(year), `${year}-12-31`, 250000);
  add("management", "Management company financials", "Annual", String(year), `${year}-12-31`, 750000);
  return rows.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.entity.localeCompare(b.entity));
}

export function roasChargeSummary(charges: RoasCharge[], asOf: string) {
  return charges.reduce((sum, charge) => {
    const balance = charge.amountCents - charge.reportedPaidCents;
    return { totalCents: sum.totalCents + charge.amountCents, reportedPaidCents: sum.reportedPaidCents + charge.reportedPaidCents,
      dueNowCents: sum.dueNowCents + (charge.dueOn <= asOf ? balance : 0), futureCents: sum.futureCents + (charge.dueOn > asOf ? balance : 0) };
  }, { totalCents: 0, reportedPaidCents: 0, dueNowCents: 0, futureCents: 0 });
}

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