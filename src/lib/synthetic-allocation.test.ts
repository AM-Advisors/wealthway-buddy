import { describe, expect, it } from "vitest";
import { computeSyntheticAllocation, planPeriodLink, splitExact } from "./synthetic-allocation";
import { walkthroughQ1AllocationInput } from "./reference-fund/walkthrough-q1-allocation";

const base = () => walkthroughQ1AllocationInput({ sourceOnlyApproved: true });
const blockers = (i: ReturnType<typeof base>) => {
  const r = computeSyntheticAllocation(i);
  return r.ok ? [] : r.blockers;
};

describe("Walkthrough Q1 synthetic allocation", () => {
  it("ties 13 investors to the synthetic NAV to the cent with no GL entries", () => {
    const r = computeSyntheticAllocation(base());
    if (!r.ok) throw new Error(r.blockers.join("; "));
    expect(r.lines).toHaveLength(13);
    expect(r.totals).toMatchObject({
      openingCapitalCents: 995_000_000, contributionsCents: 410_000_000, interestCents: 210_000,
      unrealizedGainCents: 10_000_000, operatingExpenseCents: -10_675_000, managementFeeCents: -11_543_750,
      netPnlCents: -12_008_750, endingCapitalCents: 1_392_991_250, unpaidCallCents: 90_000_000,
    });
    expect(r.differenceCents).toBe(0);
    expect(r.journalEntriesCreated).toBe(0);
  });
  it("is deterministic across reruns and input order", () => {
    const a = computeSyntheticAllocation(base());
    const i = base(); i.participants.reverse();
    const b = computeSyntheticAllocation(i);
    if (!a.ok || !b.ok) throw new Error("blocked");
    const m = (r: typeof a) => Object.fromEntries(r.lines.map((l) => [l.positionId, l.endingCapitalCents]));
    expect(m(b)).toEqual(m(a));
    expect(b.residuals.map((x) => x.positionId + x.component).sort()).toEqual(a.residuals.map((x) => x.positionId + x.component).sort());
  });
  it("traces fees per investor without re-spreading (Northwind at approved 2.00%)", () => {
    const r = computeSyntheticAllocation(base());
    if (!r.ok) throw new Error("blocked");
    const nw = r.lines.find((l) => l.name.startsWith("Northwind"))!;
    expect(nw.managementFeeCents).toBe(-2_500_000);
    expect(nw.flags).toContain("SOURCE-ONLY / NOT FORMALLY ADMITTED");
  });
  it("splitExact breaks equal remainders by stable id and logs residuals", () => {
    const r = splitExact("x", 1, [{ id: "b", w: 1n }, { id: "a", w: 1n }]);
    expect(r.out.get("a")).toBe(1);
    expect(r.residuals).toEqual([{ component: "x", positionId: "a", cents: 1, remainderNumerator: "1" }]);
  });
});

describe("refusals", () => {
  it("missing opening capital", () => { const i = base(); i.participants[0]!.openingCapitalCents = null; expect(blockers(i).join()).toMatch(/missing opening/); });
  it("missing policy", () => { const i = base(); i.policy = null; expect(blockers(i).join()).toMatch(/No approved synthetic allocation policy/); });
  it("synthetic NAV into production capital accounts", () => { const i = base(); i.target = "production_capital_accounts"; expect(blockers(i).join()).toMatch(/production investor capital/); });
  it("publication", () => { const i = base(); i.target = "publication"; expect(blockers(i).join()).toMatch(/cannot be published/); });
  it("unapproved carry", () => { const i = base(); i.carryRequested = true; expect(blockers(i).join()).toMatch(/Carried interest/); });
  it("proposed side letter changing fees", () => { const i = base(); i.feeLines[0] = { ...i.feeLines[0]!, termStatus: "proposed", netFeeCents: 1_875_000 }; expect(blockers(i).join()).toMatch(/proposed/); });
  it("duplicate investor fee charges", () => { const i = base(); i.feeLines.push(i.feeLines[0]!); expect(blockers(i).join()).toMatch(/Duplicate management-fee/); });
  it("cross-fund", () => { const i = base(); i.participants[1]!.offeringId = "other"; i.nav.offeringId = "other"; const b = blockers(i).join(); expect(b).toMatch(/different fund/); });
  it("unapproved source-only participant", () => { expect(blockers(walkthroughQ1AllocationInput({ sourceOnlyApproved: false })).length).toBe(3); });
  it("real (non-demo) fund", () => { const i = base(); i.fundIsTestDemo = false; expect(blockers(i).join()).toMatch(/TEST\/DEMO/); });
  it("totals differing from NAV, with no plug", () => { const i = base(); i.nav.navCents += 1; expect(blockers(i).join()).toMatch(/differs from synthetic NAV by -1/); });
  it("unpaid calls are not contributed capital", () => { const r = computeSyntheticAllocation(base()); if (!r.ok) throw 0; const j = r.lines.find((l) => l.name.startsWith("Juniper"))!; expect(j.contributionsCents).toBe(0); expect(j.unpaidCallCents).toBe(50_000_000); });
});

describe("period link plan", () => {
  it("never rewrites dates or amounts and reports out-of-period journals", () => {
    const p = planPeriodLink([
      { id: "a", entryDate: "2026-02-10", status: "posted", periodId: null, amountCents: 1 },
      { id: "b", entryDate: "2025-12-31", status: "posted", periodId: null, amountCents: 1 },
      { id: "c", entryDate: "2026-03-31", status: "draft", periodId: null, amountCents: 1 },
      { id: "d", entryDate: "2026-03-01", status: "posted", periodId: "other", amountCents: 1 },
    ], { id: "q1", start: "2026-01-01", end: "2026-03-31" });
    expect(p).toMatchObject({ link: ["a"], outOfPeriod: ["b"], notPosted: ["c"], linkedElsewhere: ["d"], rewritesDatesOrAmounts: false });
  });
});
