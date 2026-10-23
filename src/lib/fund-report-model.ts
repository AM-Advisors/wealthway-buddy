/** Pure builders for the automated NAV and financial review drafts. All money in cents. */
export const REPORT_FIELDS = [
  { key: "cash", label: "Cash" },
  { key: "investments_fv", label: "Investments at fair value" },
  { key: "investments_cost", label: "Investments at cost" },
  { key: "receivables", label: "Receivables" },
  { key: "other_assets", label: "Other assets" },
  { key: "liabilities", label: "Liabilities (incl. accrued expenses)" },
  { key: "contributions", label: "Contributions this period" },
  { key: "distributions", label: "Distributions this period" },
  { key: "income", label: "Investment income this period" },
  { key: "management_fee", label: "Management fee this period" },
  { key: "fund_expenses", label: "Other fund expenses this period" },
] as const;
export type ReportInputs = Partial<Record<(typeof REPORT_FIELDS)[number]["key"], number>> & { units?: number | null; notes?: string };

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function computeNav(i: any, priorNavCents: number | null) {
  const gross = n(i.cash) + n(i.investments_fv) + n(i.receivables) + n(i.other_assets);
  const nav = gross - n(i.liabilities);
  const units = i.units && i.units > 0 ? i.units : null;
  const unrealized = n(i.investments_fv) - n(i.investments_cost);
  const change = priorNavCents == null ? null : nav - priorNavCents;
  return {
    grossAssetsCents: gross, liabilitiesCents: n(i.liabilities), navCents: nav,
    navPerUnitCents: units ? Math.round(nav / units) : null, unrealizedGainCents: unrealized,
    priorNavCents, changeCents: change,
    changePct: change != null && priorNavCents ? Math.round((change / priorNavCents) * 10000) / 100 : null,
  };
}

export function computeReview(i: any, priorNavCents: number | null, feePct: number | null, committedCents: number | null, months: number) {
  const nav = computeNav(i, priorNavCents);
  const expenses = n(i.management_fee) + n(i.fund_expenses);
  const flags: string[] = [];
  if (n(i.cash) < 0) flags.push("Cash is negative.");
  if (nav.navCents < 0) flags.push("NAV is negative.");
  if (nav.grossAssetsCents > 0 && n(i.liabilities) / nav.grossAssetsCents > 0.1) flags.push("Liabilities exceed 10% of gross assets.");
  if (nav.changePct != null && Math.abs(nav.changePct) > 20) flags.push(`NAV moved ${nav.changePct}% since the prior approved NAV.`);
  if (feePct != null && committedCents) {
    const expected = Math.round(committedCents * (feePct / 100) * (months / 12));
    const diff = n(i.management_fee) - expected;
    if (expected > 0 && Math.abs(diff) / expected > 0.05) flags.push(`Management fee differs from the expected ${(expected / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} (${feePct}% of commitments).`);
  }
  if (priorNavCents != null) {
    const roll = priorNavCents + n(i.contributions) - n(i.distributions) + n(i.income) - expenses;
    const gap = nav.navCents - roll;
    if (Math.abs(gap) > Math.max(100_00, Math.abs(nav.navCents) * 0.02)) flags.push("NAV doesn't roll forward from the prior NAV after contributions, distributions, income and expenses - check unrealized changes.");
  }
  return { ...nav, expensesCents: expenses, expenseRatioPct: nav.navCents > 0 ? Math.round((expenses / nav.navCents) * 10000) / 100 : null, flags };
}

export function monthsBetween(start: string, end: string) {
  const a = new Date(start), b = new Date(end);
  return Math.max(1, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() + 1);
}
