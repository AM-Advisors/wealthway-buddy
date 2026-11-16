import { describe, expect, it } from "vitest";

import {
  aggregateOnboardingHoldings,
  mergePortfolioRowsByFund,
  onboardingsOutsideCapTable,
  portfolioRowForOffering,
  portfolioRowsFromResponse,
  type OnboardingHolding,
  type PortfolioOffering,
} from "./my-portfolio-merge";

const offering: PortfolioOffering = {
  id: "fund-1",
  name: "CORPS Erebor",
  reg_type: "506(c)",
  share_price_cents: 10000,
};

const onboarding = (over: Partial<OnboardingHolding> = {}): OnboardingHolding => ({
  id: "onb-1",
  offering_id: "fund-1",
  stage: "awaiting_funds",
  commitment_amount_cents: 50000000,
  funded_amount_cents: 10000000,
  application_id: null,
  ...over,
});

describe("aggregateOnboardingHoldings", () => {
  it("shows an onboarding-only investment as a holding valued at received capital", () => {
    const rows = aggregateOnboardingHoldings([onboarding()], new Map([["fund-1", offering]]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      offering_id: "fund-1",
      offering_name: "CORPS Erebor",
      commitment_cents: 50000000,
      funded_cents: 10000000,
      equity_value_cents: 10000000,
      valued_by: "capital",
      pct_of_committed: 20,
    });
  });

  it("aggregates multiple onboardings for the same fund into one row", () => {
    const rows = aggregateOnboardingHoldings(
      [onboarding(), onboarding({ id: "onb-2", commitment_amount_cents: 25000000, funded_amount_cents: 0 })],
      new Map([["fund-1", offering]]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.commitment_cents).toBe(75000000);
    expect(rows[0]!.funded_cents).toBe(10000000);
  });

  it("skips onboarding rows whose fund is unknown", () => {
    const rows = aggregateOnboardingHoldings([onboarding({ offering_id: "other" })], new Map([["fund-1", offering]]));
    expect(rows).toHaveLength(0);
  });

  it("treats missing amounts as zero rather than throwing", () => {
    const rows = aggregateOnboardingHoldings(
      [onboarding({ commitment_amount_cents: null, funded_amount_cents: null })],
      new Map([["fund-1", offering]]),
    );
    expect(rows[0]!.commitment_cents).toBe(0);
    expect(rows[0]!.equity_value_cents).toBe(0);
    expect(rows[0]!.pct_of_committed).toBe(0);
  });

  it("does not show investments that have not reached the signature stage", () => {
    for (const stage of ["profile_selected", "eligibility", "verification", "tax", "harmonious_review"]) {
      expect(aggregateOnboardingHoldings([onboarding({ stage })], new Map([["fund-1", offering]]))).toHaveLength(0);
    }
  });

  it("shows signed and later-stage investments as holdings", () => {
    for (const stage of ["signature", "awaiting_funds", "approved_to_fund", "complete", "closed"]) {
      expect(aggregateOnboardingHoldings([onboarding({ stage })], new Map([["fund-1", offering]]))).toHaveLength(1);
    }
  });
});

describe("portfolioRowsFromResponse", () => {
  const rows = [{ offering_id: "fund-1" }];

  it("accepts the server function's plain array response", () => {
    expect(portfolioRowsFromResponse(rows)).toEqual(rows);
  });

  it("still accepts the legacy { funds } shape so old consumers keep working", () => {
    expect(portfolioRowsFromResponse({ funds: rows })).toEqual(rows);
  });

  it("never hands consumers a broken shape when data is empty", () => {
    expect(portfolioRowsFromResponse(null)).toEqual([]);
    expect(portfolioRowsFromResponse(undefined)).toEqual([]);
    expect(portfolioRowsFromResponse({})).toEqual([]);
  });
});

describe("portfolio counts each investment once", () => {
  const roas = { id: "roas", name: "Roas Hedge LP", reg_type: "506(c)", share_price_cents: null };
  const closed = { id: "onb-closed", offering_id: "roas", stage: "closed", commitment_amount_cents: 5_000_000, funded_amount_cents: 5_000_000, application_id: null };

  it("a closed $50,000 investment that replaced an empty older application totals $50,000, not $100,000", () => {
    // The cap table already joined the empty application to the closed investment.
    const fromCapTable = portfolioRowForOffering(roas, [
      { application_id: "onb-closed", onboarding_id: "onb-closed", commitment_cents: 5_000_000, funded_cents: 5_000_000, shares: null, share_class: "LP interest", pct_of_committed: 4 },
    ])!;
    const extra = onboardingsOutsideCapTable([closed], new Set(["app-empty"]), new Set(["onb-closed"]));
    expect(extra).toHaveLength(0);
    const rows = mergePortfolioRowsByFund([fromCapTable, ...aggregateOnboardingHoldings(extra, new Map([["roas", roas]]))]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.equity_value_cents).toBe(5_000_000);
    expect(rows[0]!.commitment_cents).toBe(5_000_000);
  });

  it("an investment linked to an older application is not added again", () => {
    expect(onboardingsOutsideCapTable([{ ...closed, application_id: "app-1" }], new Set(["app-1"]), new Set())).toHaveLength(0);
  });

  it("an investment the cap table did not count still appears", () => {
    expect(onboardingsOutsideCapTable([closed], new Set(), new Set())).toHaveLength(1);
  });

  it("two of the investor's own rows in one fund are added into one fund row", () => {
    const row = portfolioRowForOffering(roas, [
      { application_id: "a", onboarding_id: null, commitment_cents: 100, funded_cents: 60, shares: null, share_class: "LP interest", pct_of_committed: 1 },
      { application_id: "b", onboarding_id: "b", commitment_cents: 200, funded_cents: 200, shares: null, share_class: "LP interest", pct_of_committed: 2 },
    ])!;
    expect(row.commitment_cents).toBe(300);
    expect(row.equity_value_cents).toBe(260);
  });

  it("rows for the same fund merge so the fund is listed once", () => {
    const a = portfolioRowForOffering(roas, [{ application_id: "a", onboarding_id: null, commitment_cents: 100, funded_cents: 100, shares: null, share_class: "LP interest", pct_of_committed: 1 }])!;
    expect(mergePortfolioRowsByFund([a, { ...a }])).toHaveLength(1);
  });
});
