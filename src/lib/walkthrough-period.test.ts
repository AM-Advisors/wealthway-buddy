import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_EXPENSE, CALL_TOTAL, DEMO_BANK, FEE_TERMS, PEOPLE, PERIOD, POSITIONS, VALUATIONS,
  allocationSegregationError, capitalCall, classifyExpense, closeBlockers, journalError, navSegregationError,
  runPeriod, valuationError, type Journal,
} from "@/lib/reference-fund/walkthrough-period";
import { computeFeeRun } from "@/lib/economic-terms";

// DEMO / SYNTHETIC Walkthrough Q1 2026. Permanent regression for the first operating period.
// VERSION 1 - HISTORICAL. Its Northwind 1.25% input (and the $106,062.50 fee) is UNSUPPORTED by any
// source record (live side letter: 1.50%, proposed). Kept unchanged as audit evidence of the engine;
// the contractual benchmark is v2 in fund-accounting-model.test.ts.
const r = runPeriod();
const $ = (d: number) => Math.round(d * 100);
const line = (id: string) => r.feeRun.lines.find((l) => l.positionId === id)!;
const acct = (id: string) => r.capitalAccounts.find((a) => a.positionId === id)!;

describe("Walkthrough Phase 2B - first operating period", () => {
  it("opening books reconcile to the approved $9,950,000 before new activity", () => {
    const o = r.opening[0]!;
    expect(journalError(o)).toBeNull();
    expect(o.lines.find((l) => l.account === "H-3000")!.credit).toBe($(9_950_000));
    expect(POSITIONS.reduce((s, p) => s + p.openingCapitalCents, 0)).toBe($(9_950_000));
  });

  it("demo bank can never move money", () => {
    expect(DEMO_BANK).toMatchObject({ liveConnection: false, canInitiateAch: false, canInitiateWire: false, canMoveMoney: false });
  });

  it("capital call #1 allocates $5M fund-wide to the cent, nobody above remaining commitment", () => {
    expect(r.call.sumCents).toBe(CALL_TOTAL);
    expect(r.call.overCalled).toEqual([]);
    expect(r.call.lines.find((l) => l.positionId === "northwind")).toMatchObject({ calledCents: $(1_000_000), remainingAfterCents: $(2_000_000) });
    expect(capitalCall($(16_000_000)).error).toMatch(/above remaining commitment/);
  });

  it("investor funding behaviours are real, not all perfect", () => {
    const f = Object.fromEntries(r.match.funding.map((x) => [x.positionId, x]));
    expect(f["northwind"]!.status).toBe("satisfied");
    expect(f["cedar"]!.deposits).toBe(2);
    expect(f["atlas"]).toMatchObject({ status: "partially_funded", outstandingCents: $(200_000) });
    expect(f["kestrel"]!.late).toBe(true);
    expect(f["juniper"]!.status).toBe("outstanding");
    expect(f["erik"]!.status).toBe("outstanding");
    expect(f["ada"]).toMatchObject({ contributionCents: $(300_000), overpaymentCents: $(50) });
    expect(r.nav.overpaymentsHeldCents).toBe($(50));
  });

  it("an unreferenced deposit stays unmatched until a person matches it", async () => {
    const { matchDeposits, DEPOSITS } = await import("@/lib/reference-fund/walkthrough-period");
    expect(matchDeposits(DEPOSITS, r.call).unmatched.map((u) => u.bankLineId)).toEqual(["dep-casey"]);
    expect(r.match.decisions.find((d) => d.bankLineId === "dep-casey")).toMatchObject({ how: "manual", matchedBy: PEOPLE.preparer });
  });

  it("every contribution traces investor -> call -> bank line -> journal -> capital account", () => {
    for (const a of r.capitalAccounts) {
      const js = r.journals.filter((j) => j.source === "capital_call" && j.lines.some((l) => l.positionId === a.positionId));
      expect(js.reduce((s, j) => s + (j.lines.find((l) => l.account === "H-3100")?.credit ?? 0), 0)).toBe(a.contributionsCents);
      js.forEach((j) => expect(j.sourceRef).toMatch(new RegExp(`^cc1/${a.positionId}/dep-`)));
    }
    expect(r.capitalAccounts.reduce((s, a) => s + a.contributionsCents, 0)).toBe($(4_150_000));
  });

  it("self-posting is refused; unbalanced, plugged and locked-period journals are refused", () => {
    const base: Journal = { id: "x", date: "2026-03-31", memo: "", source: "manual", sourceRef: "t", preparedBy: "a", postedBy: "a", lines: [{ account: "H-1000", debit: 1 }, { account: "H-3100", credit: 1 }] };
    expect(journalError(base)).toMatch(/other than the preparer/);
    expect(journalError({ ...base, postedBy: "b", lines: [{ account: "H-1000", debit: 2 }, { account: "H-3100", credit: 1 }] })).toMatch(/balance/);
    expect(journalError({ ...base, postedBy: "b", lines: [{ account: "H-1000", debit: 1 }, { account: "H-9999", credit: 1 }] })).toMatch(/unknown account|plug/);
    expect(journalError({ ...base, postedBy: "b" }, { lockedThrough: PERIOD.end })).toMatch(/locked/);
    expect(r.journalErrors).toEqual([]);
  });

  it("investments: new preferred, SAFE and a follow-on all hit cost and cash", () => {
    const ji = r.journals.filter((j) => j.source === "investment");
    expect(ji.map((j) => j.lines[0]!.debit)).toEqual([$(2_000_000), $(1_000_000), $(250_000)]);
    expect(r.nav.investmentsAtCostCents).toBe($(7_500_000 + 3_250_000));
  });

  it("expenses map to their own accounts; ambiguous ones need review, never 'Other'", () => {
    expect(classifyExpense({ ...AMBIGUOUS_EXPENSE })).toMatchObject({ review: "REVIEW REQUIRED" });
    expect(classifyExpense({ ...AMBIGUOUS_EXPENSE, category: null })).toMatchObject({ review: "REVIEW REQUIRED" });
    const rows = Object.fromEntries(r.tb.rows.map((x) => [x.code, x.balanceCents]));
    expect(rows).toMatchObject({ "H-5100": $(45_000), "H-5200": $(15_000), "H-5300": $(250), "H-5400": $(30_000), "H-5500": $(12_500) });
  });

  it("management fee: Class A, Class B and side letter with full lineage", () => {
    expect(line("cedar")).toMatchObject({ appliedLevel: "class", effectiveRateBps: 200, basisAmountCents: $(4_000_000), netFeeCents: $(20_000), sourceTermId: "class-a" });
    expect(line("harbor")).toMatchObject({ appliedLevel: "class", effectiveRateBps: 150, netFeeCents: $(7_500), sourceTermId: "class-b" });
    expect(line("northwind")).toMatchObject({ appliedLevel: "investor", fundDefaultBps: 200, classBps: 200, investorOverrideBps: 125, netFeeCents: $(15_625), sourceDocument: "DEMO Northwind side letter v1" });
  });

  it("fees reconcile investor -> fund -> GL -> capital accounts with no unexplained variance", () => {
    expect(r.feeRec).toMatchObject({ ties: true, unexplainedCents: 0, investorTotalCents: $(106_062.5), allocatedToInvestorsCents: $(106_062.5) });
    expect(r.journals.find((j) => j.source === "fee_accrual")!.sourceRef).toBe("fee-run-2026Q1");
  });

  it("prospective Class B change from 2026-04-01 does not touch Q1", () => {
    expect(line("harbor").sourceTermId).toBe("class-b");
    const q2 = computeFeeRun(FEE_TERMS.filter((t) => t.id !== "class-b"), [{ positionId: "harbor", classId: "B", commitmentCents: $(2_000_000), contributedToDateCents: 0, beginningCapitalCents: 0 }], { start: "2026-04-01", end: "2026-06-30" });
    expect(q2.lines[0]).toMatchObject({ sourceTermId: "class-b-v2", netFeeCents: $(6_250) });
  });

  it("valuations book only the delta; bad valuations are refused", () => {
    expect(r.valuationResults.map((v) => [v.error, v.deltaCents])).toEqual([[null, $(500_000)], [null, $(-400_000)]]);
    expect(r.nav.unrealizedCents).toBe($(750_000 + 100_000));
    const v = VALUATIONS[0]!;
    expect(valuationError({ ...v, evidenceCount: 0 })).toMatch(/evidence/);
    expect(valuationError({ ...v, reviewedBy: v.preparedBy })).toMatch(/own valuation/);
    expect(valuationError({ ...v, date: "2026-05-01" })).toMatch(/outside/);
    expect(valuationError(v, PERIOD.end)).toMatch(/locked/);
  });

  it("bank reconciles to $0 with a deposit in transit and an outstanding payment", () => {
    expect(r.bankRec).toMatchObject({ depositsInTransitCents: $(50_000), outstandingPaymentsCents: $(-12_500), differenceCents: 0 });
  });

  it("trial balance ties and NAV is calculated, never entered", () => {
    expect(r.tb.ties).toBe(true);
    expect(r.nav.navCents).toBe($(13_993_287.5));
    expect(r.nav.navCents).toBe(r.allocationRec.equityCents);
    expect(r.navLineage.every((x) => x.ok)).toBe(true);
  });

  it("capital accounts sum to NAV to the cent; class and side-letter economics flow through", () => {
    expect(r.allocationRec.differenceCents).toBe(0);
    const nw = acct("northwind"), cd = acct("cedar");
    expect(nw.endingCents).toBe(nw.openingCents + nw.contributionsCents + nw.managementFeeCents + nw.otherPnlCents);
    expect(nw.managementFeeCents / nw.openingCents).toBeGreaterThan(cd.managementFeeCents / cd.openingCents);
  });

  it("NAV and allocation segregation is enforced", () => {
    expect(navSegregationError({ preparedBy: "a" }, "a", "approve")).toMatch(/other than/);
    expect(allocationSegregationError({ preparedBy: "a" }, "a", "review")).toMatch(/other than/);
    expect(allocationSegregationError({ preparedBy: "a", reviewedBy: "b" }, "b", "approve")).toMatch(/other than/);
  });

  it("statements show each investor only their own figures", () => {
    const s = r.statements.find((x) => x.positionId === "harbor")!;
    expect(Object.keys(s.fee).sort()).toEqual(["effectiveRateBps", "feeCents", "period"]);
    expect(JSON.stringify(s)).not.toMatch(/northwind|side letter|class-a/i);
  });

  it("close needs approvals and a different closer; lock blocks further posting", () => {
    const ok = { navPeople: { preparedBy: PEOPLE.preparer, reviewedBy: PEOPLE.reviewer, approvedBy: PEOPLE.approver, publishedBy: PEOPLE.approver }, allocationPeople: { preparedBy: PEOPLE.preparer, reviewedBy: PEOPLE.reviewer, approvedBy: PEOPLE.approver }, lockedThrough: null };
    expect(closeBlockers(r, ok, PEOPLE.closer)).toEqual([]);
    expect(closeBlockers(r, ok, PEOPLE.preparer)).toContain("The preparer cannot close the period.");
    expect(closeBlockers(r, { ...ok, navPeople: { ...ok.navPeople, approvedBy: null } }, PEOPLE.closer)).toContain("NAV not approved.");
    expect(journalError({ ...r.journals[0]!, date: "2026-03-15" }, { lockedThrough: PERIOD.end })).toMatch(/locked/);
  });
});
