import { describe, expect, it } from "vitest";
import { buildInvestorTodos } from "./manager-investor-todos-model";

const inv = (over: Partial<Parameters<typeof buildInvestorTodos>[0]["investors"][number]> = {}) => ({
  onboardingId: "ob1",
  investorName: "Doug Mangrum",
  applicationId: null as string | null,
  started: true,
  kyc: "approved" as string | null,
  aml: "approved" as string | null,
  questionnaireSubmitted: true,
  ...over,
});

describe("buildInvestorTodos", () => {
  it("surfaces an uploaded document copy and an accreditation proof", () => {
    const items = buildInvestorTodos({
      investors: [inv()],
      newDocs: [
        { onboardingId: "ob1", docKind: "tax_form" },
        { onboardingId: "ob1", docKind: "accreditation_proof" },
      ],
      accreditationPendingApplicationIds: new Set<string>(),
      signaturePending: [],
    });
    expect(items.map((i) => i.label)).toEqual(["Review accreditation proof", "Review uploaded tax form copy"]);
    expect(items.every((i) => i.onboardingId === "ob1")).toBe(true);
  });

  it("shows one approval after the investor signs, and countersign takes precedence", () => {
    const base = {
      investors: [inv()],
      newDocs: [],
      accreditationPendingApplicationIds: new Set<string>(),
    };
    const approve = buildInvestorTodos({ ...base, signaturePending: [{ onboardingId: "ob1", countersign: false }] });
    expect(approve.map((i) => i.label)).toEqual(["Approve the signed subscription"]);
    const counter = buildInvestorTodos({ ...base, signaturePending: [{ onboardingId: "ob1", countersign: true }] });
    expect(counter.map((i) => i.label)).toEqual(["Countersign the signed subscription"]);
  });

  it("summarizes verification in one plain line and skips investors who never started", () => {
    const items = buildInvestorTodos({
      investors: [inv({ kyc: "approved", aml: "in_review", onboardingId: "ob1", investorName: "A" }), inv({ started: false, kyc: "not_started", aml: "not_started", onboardingId: "ob2", investorName: "B" })],
      newDocs: [],
      accreditationPendingApplicationIds: new Set<string>(),
      signaturePending: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe("ID approved · screening under review");
    expect(items[0]!.investorName).toBe("A");
  });

  it("never leaks screening detail into labels", () => {
    const items = buildInvestorTodos({
      investors: [inv({ kyc: "declined", aml: "hit" })],
      newDocs: [],
      accreditationPendingApplicationIds: new Set<string>(),
      signaturePending: [],
    });
    expect(items[0]!.label).toBe("Check needs review");
    expect(JSON.stringify(items)).not.toContain("hit");
  });

  it("deduplicates two uploads of the same kind", () => {
    const items = buildInvestorTodos({
      investors: [inv()],
      newDocs: [
        { onboardingId: "ob1", docKind: "tax_form" },
        { onboardingId: "ob1", docKind: "tax_form" },
      ],
      accreditationPendingApplicationIds: new Set<string>(),
      signaturePending: [],
    });
    expect(items).toHaveLength(1);
  });
});
