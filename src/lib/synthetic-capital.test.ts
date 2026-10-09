import { describe, expect, it } from "vitest";
import { computeSyntheticAllocation, planPeriodLink } from "./synthetic-allocation";
import { walkthroughQ1AllocationInput } from "./reference-fund/walkthrough-q1-allocation";
import { WALKTHROUGH_JOURNALS_SNAPSHOT } from "./reference-fund/walkthrough-journals";

const r = computeSyntheticAllocation(walkthroughQ1AllocationInput({ sourceOnlyApproved: true }));
if (!r.ok) throw new Error("blocked");

describe("synthetic capital rollforward", () => {
  it("each account rolls forward to its preview ending capital", () => {
    for (const l of r.lines)
      expect(l.openingCapitalCents + l.contributionsCents + l.interestCents + l.unrealizedGainCents + l.operatingExpenseCents + l.managementFeeCents).toBe(l.endingCapitalCents);
  });
  it("credits and unpaid calls never become capital", () => {
    const ada = r.lines.find((l) => l.name.startsWith("Ada"))!;
    expect(ada.contributionsCents).toBe(30_000_000);
    expect(ada.creditsCents).toBe(5_000);
    for (const n of ["Juniper", "Erik", "Blake"]) expect(r.lines.find((l) => l.name.startsWith(n))!.contributionsCents).toBe(0);
    expect(r.totals.contributionsCents).toBe(410_000_000);
  });
  it("19 residual cents are preserved", () => expect(r.residuals).toHaveLength(19));
});

describe("Q1 period-link audit on the real Walkthrough journal set", () => {
  const plan = planPeriodLink(
    WALKTHROUGH_JOURNALS_SNAPSHOT.map(([id, entryDate, status]) => ({ id, entryDate, status, periodId: null, amountCents: 0 })),
    { id: "q1", start: "2026-01-01", end: "2026-03-31" },
  );
  it("proposes only posted in-quarter journals", () => {
    expect(WALKTHROUGH_JOURNALS_SNAPSHOT).toHaveLength(27);
    expect(plan.link).toHaveLength(25);
    expect(plan.voided).toEqual(["1f44e862-23bc-4592-9daa-fa991c019f2f"]);
    expect(plan.outOfPeriod).toEqual(["503ad832-e33d-44d8-8d0b-5b20dbd51cb3"]);
    expect(plan.notPosted).toEqual([]);
  });
});
