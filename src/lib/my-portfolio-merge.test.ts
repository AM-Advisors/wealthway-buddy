import { describe, expect, it } from "vitest";

import {
  aggregateOnboardingHoldings,
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
  stage: "funding",
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
    expect(rows[0].commitment_cents).toBe(75000000);
    expect(rows[0].funded_cents).toBe(10000000);
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
    expect(rows[0].commitment_cents).toBe(0);
    expect(rows[0].equity_value_cents).toBe(0);
    expect(rows[0].pct_of_committed).toBe(0);
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
