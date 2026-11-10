import { describe, expect, it } from "vitest";
import { canInvestorFund, canCloseInvestment } from "@/lib/investor-onboarding-model";
import { countersignNoticeMoment, parseCountersignTiming } from "@/lib/countersign-timing";
import { classCountError, multipleClassesFromAnswer, classDifferences } from "@/lib/fund-setup-canonical";

const signedNotApproved = { stage: "harmonious_review" as const, requirements: [], approvedToFundAt: null, openBlockingExceptions: 0 };

describe("countersign timing", () => {
  it("A pause: wire step stays locked until countersign", () => {
    expect(canInvestorFund({ ...signedNotApproved, countersignTiming: "pause" }).allowed).toBe(false);
  });
  it("B parallel: wire step opens right after signing", () => {
    expect(canInvestorFund({ ...signedNotApproved, countersignTiming: "parallel" }).allowed).toBe(true);
    expect(countersignNoticeMoment("parallel")).toBe("on_investor_signature");
  });
  it("C after completion: wire step opens; manager asked at the funding step", () => {
    expect(canInvestorFund({ ...signedNotApproved, countersignTiming: "after_completion" }).allowed).toBe(true);
    expect(countersignNoticeMoment("after_completion")).toBe("on_funding_step");
  });
  it("early funding never skips blocking issues or a declined investment", () => {
    expect(canInvestorFund({ ...signedNotApproved, countersignTiming: "parallel", openBlockingExceptions: 1 }).allowed).toBe(false);
    expect(canInvestorFund({ ...signedNotApproved, stage: "declined", countersignTiming: "parallel" }).allowed).toBe(false);
  });
  it("admission still requires countersign in every mode", () => {
    const r = canCloseInvestment({ ...signedNotApproved, countersignTiming: "parallel", fundingStatus: "funded" as any, fundingReconciled: true });
    expect(r.reasons).toContain("The fund manager has not yet approved this subscription.");
  });
  it("unknown values fall back to pause", () => expect(parseCountersignTiming("x")).toBe("pause"));
});

describe("multiple classes", () => {
  it("No or 1 class keeps a single-class fund", () => {
    expect(multipleClassesFromAnswer({ yes: false, count: null }).hasMultipleClasses).toBe(false);
    expect(multipleClassesFromAnswer({ yes: true, count: 1 }).hasMultipleClasses).toBe(false);
  });
  it("Yes with 3 requires exactly 3 classes", () => {
    expect(multipleClassesFromAnswer({ yes: true, count: 3 })).toEqual({ hasMultipleClasses: true, plannedClassCount: 3 });
    expect(classCountError(3, [{ key: "a", name: "A" }, { key: "b", name: "B" }])).toMatch(/3 classes/);
    expect(classCountError(2, [{ key: "a", name: "A" }, { key: "b", name: "B" }])).toBeNull();
  });
  it("differences table flags a class fee different from the default", () => {
    const rows = classDifferences({ managementFee: { ratePercent: 2, basis: null, frequency: null } as any, carry: { ratePercent: 20 } }, [{ key: "a", name: "A", carry: { ratePercent: 10 } }]);
    expect(rows.find((r) => r.term === "Carried interest")!.perClass[0]).toMatchObject({ value: "10%", differs: true });
    expect(rows.find((r) => r.term === "Management fee")!.perClass[0]).toMatchObject({ value: "Same as fund default", differs: false });
  });
  it("shows which document holds each class's terms", () => {
    const rows = classDifferences({ carry: { ratePercent: 20 }, documentedIn: ["operating_agreement"] } as any, [
      { key: "a", name: "Class A" },
      { key: "b", name: "Class B", documentedIn: ["side_letter"] },
    ] as any);
    const written = rows.find((r) => r.term === "Written in")!;
    expect(written.fundDefault).toBe("Operating Agreement");
    expect(written.perClass[0]).toMatchObject({ value: "Same as fund default", differs: false });
    expect(written.perClass[1]).toMatchObject({ value: "Investor side letter", differs: true });
  });
  it("wording that restates the default is not flagged as a class difference", () => {
    const rows = classDifferences({ carry: { ratePercent: 20 } } as any, [
      { key: "a", name: "Class A", assetScope: "all", otherDifferences: "Fund default terms" },
      { key: "b", name: "Class B", assetScope: "all", otherDifferences: "0% management fee and 0% carried interest; documented by side letter" },
    ] as any);
    const assets = rows.find((r) => r.term === "Assets / allocation")!.perClass;
    expect(assets[0]).toMatchObject({ value: "Same as fund default", differs: false });
    expect(assets[1]).toMatchObject({ value: "Same as fund default", differs: false });
    const other = rows.find((r) => r.term === "Other differences")!.perClass;
    expect(other[0]).toMatchObject({ value: "Same as fund default", differs: false });
    expect(other[1]?.differs).toBe(true);
  });
});
