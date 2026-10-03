/** Pure investor "My Share" projection over approved capital accounts and final K-1s. */

export type CapitalPeriod = {
  periodStart: string;
  periodEnd: string;
  beginning: number;
  contributions: number;
  income: number; // allocated income + realized/unrealized gains
  losses: number; // allocated losses + expenses + fees + carry (positive number)
  distributions: number;
  other: number;
  ending: number;
  ownershipPct: number | null;
};

export type YearRoll = {
  year: number;
  beginning: number;
  contributions: number;
  income: number;
  losses: number;
  distributions: number;
  other: number;
  ending: number;
};

export type K1Lite = { year: number; boxes: Record<string, number>; taxCapital: Record<string, unknown> | null };

export type TieLine = { label: string; statement: number; k1: number; diff: number };
export type YearTie = { year: number; status: "matches" | "differs" | "no_k1"; lines: TieLine[] };

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v ?? 0) || 0);

export function toPeriod(r: any): CapitalPeriod {
  return {
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    beginning: n(r.beginning_capital_cents),
    contributions: n(r.contributions_cents),
    income: n(r.allocated_income_cents) + n(r.realized_gain_cents) + n(r.unrealized_gain_cents),
    losses: Math.abs(n(r.allocated_loss_cents)) + Math.abs(n(r.fund_expenses_cents)) + Math.abs(n(r.management_fees_cents)) + Math.abs(n(r.carried_interest_cents)),
    distributions: Math.abs(n(r.distributions_cents)),
    other: n(r.other_adjustments_cents),
    ending: n(r.ending_capital_cents),
    ownershipPct: r.ownership_pct == null ? null : Number(r.ownership_pct),
  };
}

/** Roll periods up into calendar years (by period end). */
export function rollByYear(periods: CapitalPeriod[]): YearRoll[] {
  const sorted = [...periods].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const out = new Map<number, YearRoll>();
  for (const p of sorted) {
    const year = Number(p.periodEnd.slice(0, 4));
    const y = out.get(year);
    if (!y) {
      out.set(year, { year, beginning: p.beginning, contributions: p.contributions, income: p.income, losses: p.losses, distributions: p.distributions, other: p.other, ending: p.ending });
    } else {
      y.contributions += p.contributions;
      y.income += p.income;
      y.losses += p.losses;
      y.distributions += p.distributions;
      y.other += p.other;
      y.ending = p.ending;
    }
  }
  return [...out.values()].sort((a, b) => a.year - b.year);
}

const INCOME_BOXES = ["1", "5", "6a", "8", "9a", "10"];

/** Compare a year's statement to the final K-1 (tax capital item L when present, else boxes). Cent tolerance. */
export function tieToK1(roll: YearRoll, k1: K1Lite | undefined, tolerance = 1): YearTie {
  if (!k1) return { year: roll.year, status: "no_k1", lines: [] };
  const tc = k1.taxCapital ?? {};
  const k1Income = INCOME_BOXES.reduce((s, b) => s + n(k1.boxes[b]), 0) - Math.abs(n(k1.boxes["13"]));
  const lines: TieLine[] = [];
  const add = (label: string, statement: number, k1v: number) => lines.push({ label, statement, k1: k1v, diff: statement - k1v });
  if (typeof tc["beginning_cents"] === "number") add("Beginning capital", roll.beginning, n(tc["beginning_cents"]));
  if (typeof tc["contributed_cents"] === "number") add("Capital contributed", roll.contributions, n(tc["contributed_cents"]));
  add("Net income (loss)", roll.income - roll.losses, typeof tc["current_year_cents"] === "number" ? n(tc["current_year_cents"]) : k1Income);
  add("Distributions", roll.distributions, typeof tc["withdrawals_cents"] === "number" ? Math.abs(n(tc["withdrawals_cents"])) : Math.abs(n(k1.boxes["19"])));
  if (typeof tc["ending_cents"] === "number") add("Ending capital", roll.ending, n(tc["ending_cents"]));
  return { year: roll.year, status: lines.every((l) => Math.abs(l.diff) <= tolerance) ? "matches" : "differs", lines };
}

export function summarize(periods: CapitalPeriod[]) {
  const sorted = [...periods].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const last = sorted[sorted.length - 1];
  return {
    contributed: sorted.reduce((s, p) => s + p.contributions, 0),
    netIncome: sorted.reduce((s, p) => s + p.income - p.losses, 0),
    distributions: sorted.reduce((s, p) => s + p.distributions, 0),
    balance: last?.ending ?? 0,
    ownershipPct: last?.ownershipPct ?? null,
    asOf: last?.periodEnd ?? null,
  };
}
