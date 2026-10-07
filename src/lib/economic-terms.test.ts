import { describe, expect, it } from "vitest";
import { allocateRun } from "@/lib/allocation-model";
import {
  computeFeeRun,
  investorFacingFee,
  reconcileFees,
  resolveFeeTerm,
  type FeePosition,
  type StructuredFeeTerm,
} from "@/lib/economic-terms";

// Walkthrough (DEMO) economics: fund default 2.0%, Class A 2.0%, Class B 1.5%,
// Northwind side letter 1.25%. Quarterly fee on commitments.
const Q1 = { start: "2026-01-01", end: "2026-03-31" };
const Q2 = { start: "2026-04-01", end: "2026-06-30" };
const t = (o: Partial<StructuredFeeTerm> & { id: string; rateBps: number }): StructuredFeeTerm => ({
  basis: "committed_capital",
  flatAmountCents: 0,
  frequency: "quarterly",
  startsOn: "2026-01-01",
  endsOn: null,
  classId: null,
  positionId: null,
  version: 1,
  approvalStatus: "approved",
  ...o,
});
const TERMS: StructuredFeeTerm[] = [
  t({ id: "fund", rateBps: 200 }),
  t({ id: "classA", classId: "A", rateBps: 200 }),
  t({ id: "classB", classId: "B", rateBps: 150 }),
  t({ id: "sl-northwind", positionId: "northwind", classId: "A", rateBps: 125, sourceDocument: "DEMO side letter v1" }),
];
const pos = (positionId: string, classId: string | null, commitment: number, funded = commitment): FeePosition => ({
  positionId,
  classId,
  commitmentCents: commitment * 100,
  contributedToDateCents: funded * 100,
  beginningCapitalCents: funded * 100,
});
const POSITIONS = [
  pos("northwind", "A", 5_000_000),
  pos("cedar", "A", 4_000_000),
  pos("harbor", "B", 2_000_000),
  pos("juniper", "A", 2_500_000, 1_000_000), // partially funded; committed basis still applies
  pos("unclassed", null, 100_000),
];

describe("economic term precedence", () => {
  it("side letter beats class beats fund", () => {
    const run = computeFeeRun(TERMS, POSITIONS, Q1);
    const by = Object.fromEntries(run.lines.map((l) => [l.positionId, l]));
    expect(by.northwind!.effectiveRateBps).toBe(125);
    expect(by.northwind!.appliedLevel).toBe("investor");
    expect(by.northwind!.netFeeCents).toBe(1_562_500); // $15,625
    expect(by.cedar!.netFeeCents).toBe(2_000_000); // $20,000 at 2.0%
    expect(by.harbor!.netFeeCents).toBe(750_000); // $7,500 at 1.5%
    expect(by.juniper!.netFeeCents).toBe(1_250_000);
    expect(by.unclassed!.appliedLevel).toBe("fund");
    expect(run.blocked).toBe(false);
  });

  it("exposes full lineage to staff", () => {
    const l = computeFeeRun(TERMS, POSITIONS, Q1).lines[0]!;
    expect(l).toMatchObject({ fundDefaultBps: 200, classBps: 200, investorOverrideBps: 125, sourceTermId: "sl-northwind", sourceDocument: "DEMO side letter v1", basis: "committed_capital" });
  });

  it("ignores unapproved terms and expired side letters fall back to class", () => {
    const terms = [
      ...TERMS.filter((x) => x.id !== "sl-northwind"),
      t({ id: "sl-old", positionId: "northwind", rateBps: 125, endsOn: "2026-03-31" }),
      t({ id: "sl-pending", positionId: "northwind", rateBps: 50, approvalStatus: "pending" }),
    ];
    const r = resolveFeeTerm(terms, { positionId: "northwind", classId: "A" }, Q2);
    expect(r.status === "ok" && r.term.id).toBe("classA");
  });

  it("prospective change: new version applies only from its start date", () => {
    const terms = [
      ...TERMS.filter((x) => x.id !== "classB"),
      t({ id: "classB-v1", classId: "B", rateBps: 150, endsOn: "2026-03-31" }),
      t({ id: "classB-v2", classId: "B", rateBps: 175, startsOn: "2026-04-01", version: 2 }),
    ];
    const p = { positionId: "harbor", classId: "B" };
    const q1 = resolveFeeTerm(terms, p, Q1);
    const q2 = resolveFeeTerm(terms, p, Q2);
    expect(q1.status === "ok" && q1.term.id).toBe("classB-v1");
    expect(q2.status === "ok" && q2.term.id).toBe("classB-v2");
  });

  it("two differing active terms at the same level block the run", () => {
    const terms = [...TERMS, t({ id: "classA-dup", classId: "A", rateBps: 180 })];
    const run = computeFeeRun(terms, POSITIONS, Q1);
    expect(run.blocked).toBe(true);
    const cedar = run.lines.find((l) => l.positionId === "cedar")!;
    expect(cedar.conflict).toEqual({ level: "class", termIds: ["classA", "classA-dup"] });
    expect(cedar.netFeeCents).toBe(0);
    // Northwind is unaffected: its investor-level term wins before the class conflict.
    expect(run.lines[0]!.conflict).toBeNull();
  });
});

describe("fee reconciliation and allocation", () => {
  it("investor fees tie to the fund-level accrual or the difference is shown", () => {
    const run = computeFeeRun(TERMS, POSITIONS, Q1);
    expect(reconcileFees(run, run.totalNetCents).ties).toBe(true);
    const off = reconcileFees(run, run.totalNetCents + 100);
    expect(off).toMatchObject({ ties: false, differenceCents: 100 });
  });

  it("differentiated fees flow into capital accounts (not a uniform share)", () => {
    const run = computeFeeRun(TERMS, POSITIONS, Q1);
    const perPositionFees = Object.fromEntries(run.lines.map((l) => [l.positionId, l.netFeeCents]));
    const result = allocateRun({
      positions: POSITIONS.map((p) => ({ ...p, contributionsCents: 0, distributionsCents: 0, units: null, cashFlows: [], ownershipPct: null })) as any,
      fundTotals: {
        investmentIncomeCents: 0, realizedGainCents: 0, unrealizedGainCents: 0,
        managementFeesCents: run.totalNetCents, fundExpensesCents: 0, carriedInterestCents: 0,
        contributionsCents: 0, distributionsCents: 0, endingNetAssetsCents: 0,
      },
      basis: "commitment" as any,
      period: Q1,
      timeWeighted: false,
      perPositionFees,
    });
    const n = result.lines.find((l) => l.positionId === "northwind")!;
    const c = result.lines.find((l) => l.positionId === "cedar")!;
    expect(n.managementFeesCents).toBe(1_562_500);
    expect(c.managementFeesCents).toBe(2_000_000);
    expect(n.endingCapitalCents).toBe(500_000_000 - 1_562_500);
    expect(result.allocatedTotals.managementFeesCents).toBe(run.totalNetCents);
  });

  it("investor-facing output hides other investors' terms and lineage", () => {
    const l = computeFeeRun(TERMS, POSITIONS, Q1).lines[0]!;
    expect(Object.keys(investorFacingFee(l)).sort()).toEqual(["effectiveRateBps", "feeCents", "period"]);
  });
});
