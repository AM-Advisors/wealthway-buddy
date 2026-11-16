/**
 * Canonical onboarding investments without a legacy application row still
 * count as portfolio holdings. This helper aggregates them per offering and
 * values each holding at the capital the fund has actually received.
 *
 * Only committed stages count: the investment appears in the portfolio once
 * the investor has signed (subscription stage) or moved on to funding.
 */
export const ONBOARDING_HOLDING_STAGES = new Set([
  "signature",
  "awaiting_funds",
  "approved_to_fund",
  "complete",
  "closed",
]);
export type OnboardingHolding = {
  id: string;
  offering_id: string;
  stage: string;
  commitment_amount_cents: number | null;
  funded_amount_cents: number | null;
  application_id: string | null;
};

export type PortfolioOffering = {
  id: string;
  name: string;
  reg_type: string | null;
  share_price_cents: number | null;
};

export type OnboardingValueRow = {
  offering_id: string;
  offering_name: string;
  reg_type: string | null;
  share_price_cents: number | null;
  shares: null;
  share_class: string;
  commitment_cents: number;
  funded_cents: number;
  pct_of_committed: number;
  equity_value_cents: number;
  valued_by: "capital";
};

export function aggregateOnboardingHoldings(
  onboardings: OnboardingHolding[],
  offeringById: Map<string, PortfolioOffering>,
): OnboardingValueRow[] {
  const totals = new Map<string, { commitment: number; funded: number }>();
  for (const o of onboardings) {
    if (!ONBOARDING_HOLDING_STAGES.has(o.stage)) continue;
    const cur = totals.get(o.offering_id) ?? { commitment: 0, funded: 0 };
    cur.commitment += Number(o.commitment_amount_cents ?? 0);
    cur.funded += Number(o.funded_amount_cents ?? 0);
    totals.set(o.offering_id, cur);
  }

  const rows: OnboardingValueRow[] = [];
  for (const [offeringId, t] of totals) {
    const offering = offeringById.get(offeringId);
    if (!offering) continue;
    rows.push({
      offering_id: offering.id,
      offering_name: offering.name,
      reg_type: offering.reg_type ?? null,
      share_price_cents:
        offering.share_price_cents != null ? Number(offering.share_price_cents) : null,
      shares: null,
      share_class: "LP interest",
      commitment_cents: t.commitment,
      funded_cents: t.funded,
      pct_of_committed:
        t.commitment > 0 ? Math.min(100, (t.funded / t.commitment) * 100) : 0,
      equity_value_cents: t.funded,
      valued_by: "capital",
    });
  }
  return rows;
}

/**
 * The server function returns a plain array; older consumers read `data.funds`.
 * Accept both shapes so a populated response is never rendered as empty.
 */
export function portfolioRowsFromResponse<T = any>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const funds = (data as { funds?: unknown } | null)?.funds;
  return Array.isArray(funds) ? (funds as T[]) : [];
}

/** One of the signed-in investor's own rows in a fund's cap table. */
export type OwnCapTableHolding = {
  application_id: string;
  onboarding_id: string | null;
  commitment_cents: number;
  funded_cents: number;
  shares: number | null;
  share_class: string;
  pct_of_committed: number;
};

export type PortfolioValueRow = Omit<OnboardingValueRow, "shares" | "valued_by"> & {
  shares: number | null;
  valued_by: "share_price" | "capital";
};

/**
 * One portfolio row per fund from every cap-table row that belongs to the investor. An older
 * application and the current investment that replaced it are already joined by the cap table,
 * so each investment is counted once.
 */
export function portfolioRowForOffering(
  offering: PortfolioOffering,
  holdings: OwnCapTableHolding[],
): PortfolioValueRow | null {
  if (!holdings.length) return null;
  const price = offering.share_price_cents != null ? Number(offering.share_price_cents) : null;
  let commitment = 0;
  let funded = 0;
  let pctCommitted = 0;
  let equity = 0;
  let shares: number | null = 0;
  let allByPrice = true;
  for (const h of holdings) {
    commitment += h.commitment_cents;
    funded += h.funded_cents;
    pctCommitted += h.pct_of_committed;
    const byPrice = h.shares != null && price != null && price > 0;
    if (!byPrice) allByPrice = false;
    equity += byPrice ? Math.round(h.shares! * price!) : h.funded_cents;
    shares = shares != null && h.shares != null ? shares + h.shares : null;
  }
  return {
    offering_id: offering.id,
    offering_name: offering.name,
    reg_type: offering.reg_type ?? null,
    share_price_cents: price,
    shares,
    share_class: holdings[0]!.share_class,
    commitment_cents: commitment,
    funded_cents: funded,
    pct_of_committed: pctCommitted,
    equity_value_cents: equity,
    valued_by: allByPrice ? "share_price" : "capital",
  };
}

/**
 * Current investments the cap table did not already count: not linked to one of the investor's
 * applications and not shown as one of their cap-table rows.
 */
export function onboardingsOutsideCapTable<T extends OnboardingHolding>(
  onboardings: T[],
  applicationIds: Set<string>,
  countedOnboardingIds: Set<string>,
): T[] {
  return onboardings.filter(
    (o) => !countedOnboardingIds.has(o.id) && !(o.application_id && applicationIds.has(o.application_id)),
  );
}

/** A fund appears once: rows for the same fund are added together. */
export function mergePortfolioRowsByFund(rows: PortfolioValueRow[]): PortfolioValueRow[] {
  const byFund = new Map<string, PortfolioValueRow>();
  for (const r of rows) {
    const cur = byFund.get(r.offering_id);
    if (!cur) {
      byFund.set(r.offering_id, { ...r });
      continue;
    }
    cur.commitment_cents += r.commitment_cents;
    cur.funded_cents += r.funded_cents;
    cur.pct_of_committed += r.pct_of_committed;
    cur.equity_value_cents += r.equity_value_cents;
    cur.shares = cur.shares != null && r.shares != null ? cur.shares + r.shares : null;
    cur.valued_by = cur.valued_by === "share_price" && r.valued_by === "share_price" ? "share_price" : "capital";
  }
  return [...byFund.values()];
}
