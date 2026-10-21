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
