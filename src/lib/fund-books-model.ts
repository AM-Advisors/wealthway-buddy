// Pure helpers for statement ingestion, books-derived K-1 totals, NAV pre-fill and simple statements. No I/O.
import { LEDGER_CATEGORIES } from "@/lib/fund-doc-templates";

export const EXTRA_CATEGORIES = ["Dividend income", "Investment sale", "Short-term gain", "Long-term gain", "Section 1231 gain", "Transfer (not income)"] as const;
export const STATEMENT_CATEGORIES = [...LEDGER_CATEGORIES, ...EXTRA_CATEGORIES] as string[];

const EXPENSES = new Set(["Management fee", "Legal fees", "Accounting & tax", "Bank fees", "Formation & filing", "Broker/Dealer fee", "Other expense"]);
const NOT_PNL = new Set(["Capital contribution", "Investment purchase", "Investment sale", "Distribution", "Transfer (not income)"]);

export type Entry = { entry_date: string; category: string; direction: "in" | "out"; amount_cents: number; onboarding_id?: string | null };

export const normDesc = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 40);
export const dedupeKey = (date: string, cents: number, dir: string, desc: string) => `${date}|${cents}|${dir}|${normDesc(desc)}`;

/** Simple rules first; the AI suggestion fills in when no rule fires. */
export function ruleCategory(desc: string, dir: "in" | "out"): string | null {
  const d = desc.toLowerCase();
  if (/interest/.test(d)) return dir === "in" ? "Interest income" : "Bank fees";
  if (/dividend/.test(d)) return "Dividend income";
  if (/(service|wire|monthly|account) fee/.test(d)) return "Bank fees";
  if (/management fee/.test(d)) return "Management fee";
  if (/distribution/.test(d)) return "Distribution";
  return null;
}

/** Statement must tie: opening + in - out = closing (when both balances known). */
export function balanceTie(opening: number | null, closing: number | null, lines: { amount_cents: number; direction: string; skip?: boolean }[]) {
  if (opening == null || closing == null) return { known: false, ties: true, gapCents: 0 };
  const net = lines.filter((l) => !l.skip).reduce((t, l) => t + (l.direction === "in" ? l.amount_cents : -l.amount_cents), 0);
  const gap = closing - (opening + net);
  return { known: true, ties: gap === 0, gapCents: gap };
}

const inYear = (e: Entry, y: number) => e.entry_date >= `${y}-01-01` && e.entry_date <= `${y}-12-31`;
const signed = (e: Entry, positiveDir: "in" | "out") => (e.direction === positiveDir ? e.amount_cents : -e.amount_cents);

/** Fund-level K-1 totals for a tax year from books entries. */
export function deriveK1Totals(entries: Entry[], year: number) {
  const t = { ordinary_income: 0, interest: 0, dividends: 0, st_gain: 0, lt_gain: 0, sec1231: 0, deductions: 0, distributions: 0 };
  for (const e of entries.filter((x) => inYear(x, year))) {
    switch (e.category) {
      case "Interest income": t.interest += signed(e, "in"); break;
      case "Dividend income": t.dividends += signed(e, "in"); break;
      case "Short-term gain": t.st_gain += signed(e, "in"); break;
      case "Long-term gain": t.lt_gain += signed(e, "in"); break;
      case "Section 1231 gain": t.sec1231 += signed(e, "in"); break;
      case "Other income": t.ordinary_income += signed(e, "in"); break;
      case "Distribution": t.distributions += signed(e, "out"); break;
      default: if (EXPENSES.has(e.category)) t.deductions += signed(e, "out");
    }
  }
  return t;
}

/** Each investor's money in (contributions tagged to them) through year end, net of nothing else. */
export function investorBasis(entries: Entry[], year: number) {
  const m = new Map<string, number>();
  for (const e of entries) if (e.category === "Capital contribution" && e.onboarding_id && e.entry_date <= `${year}-12-31`) m.set(e.onboarding_id, (m.get(e.onboarding_id) ?? 0) + signed(e, "in"));
  return m;
}

/** Distributions paid to each investor in the year (box 19 directly, not pro rata). */
export function investorDistributions(entries: Entry[], year: number) {
  const m = new Map<string, number>();
  for (const e of entries) if (e.category === "Distribution" && e.onboarding_id && inYear(e, year)) m.set(e.onboarding_id, (m.get(e.onboarding_id) ?? 0) + signed(e, "out"));
  return m;
}

export function cashThrough(entries: Entry[], date: string) {
  return entries.filter((e) => e.entry_date <= date && e.category !== "Transfer (not income)").reduce((t, e) => t + (e.direction === "in" ? e.amount_cents : -e.amount_cents), 0);
}

/** Simple statements for a period from books entries plus the asset marks. */
export function buildStatements(entries: Entry[], start: string, end: string, assets: { costCents: number; valueCents: number }[]) {
  const period = entries.filter((e) => e.entry_date >= start && e.entry_date <= end);
  const prior = entries.filter((e) => e.entry_date < start);
  const sum = (es: Entry[], cat: (c: string) => boolean, dir: "in" | "out") => es.filter((e) => cat(e.category)).reduce((t, e) => t + signed(e, dir), 0);
  const income = sum(period, (c) => !NOT_PNL.has(c) && !EXPENSES.has(c), "in");
  const expenses = sum(period, (c) => EXPENSES.has(c), "out");
  const investmentsCost = assets.reduce((t, a) => t + a.costCents, 0);
  const investmentsValue = assets.reduce((t, a) => t + a.valueCents, 0);
  const unrealized = investmentsValue - investmentsCost;
  const cash = cashThrough(entries, end);
  const contributions = sum(period, (c) => c === "Capital contribution", "in");
  const distributions = sum(period, (c) => c === "Distribution", "out");
  const openingCapital = sum(prior, (c) => c === "Capital contribution", "in") - sum(prior, (c) => c === "Distribution", "out")
    + sum(prior, (c) => !NOT_PNL.has(c) && !EXPENSES.has(c), "in") - sum(prior, (c) => EXPENSES.has(c), "out");
  const netIncome = income - expenses;
  return {
    balanceSheet: { cashCents: cash, investmentsCents: investmentsValue, totalAssetsCents: cash + investmentsValue, liabilitiesCents: 0, partnersCapitalCents: cash + investmentsValue },
    incomeStatement: { incomeCents: income, expensesCents: expenses, netIncomeCents: netIncome, unrealizedGainCents: unrealized, totalReturnCents: netIncome + unrealized },
    changesInCapital: { openingCents: openingCapital, contributionsCents: contributions, distributionsCents: distributions, netIncomeCents: netIncome, unrealizedCents: unrealized, closingCents: openingCapital + contributions - distributions + netIncome + unrealized },
  };
}
