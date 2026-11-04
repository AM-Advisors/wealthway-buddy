import { describe, expect, it } from "vitest";
import { accreditationSetGuard, basisFromAnswer } from "./accreditation-step";

const OPTIONS = [
  "Net worth over $1 million, excluding primary residence (individually or with spouse or partner)",
  "Income over $200,000 (individually) or $300,000 (with spouse or partner) in each of the prior two years, and reasonably expects the same for the current year",
  "Investment professionals in good standing holding the general securities representative license (Series 7), the investment adviser representative license (Series 65), or the private securities offerings representative license (Series 82)",
  "Directors, executive officers, or general partners (GP) of the company selling the securities (or of a GP of that company)",
  "Any \u201cfamily client\u201d of a \u201cfamily office\u201d that qualifies as an accredited investor",
];

describe("accreditationSetGuard", () => {
  it("allows setting a verified status over anything", () => {
    expect(accreditationSetGuard({ currentApproved: false, decision: "approved" })).toBeNull();
    expect(accreditationSetGuard({ currentApproved: true, decision: "approved" })).toBeNull();
  });

  it("never moves a verified status back to review", () => {
    expect(accreditationSetGuard({ currentApproved: true, decision: "review" })).toMatch(/already verified/);
    expect(accreditationSetGuard({ currentApproved: false, decision: "review" })).toBeNull();
  });
});

describe("basisFromAnswer for staff-picked categories", () => {
  it("maps the standard categories to a basis", () => {
    expect(basisFromAnswer(OPTIONS[0])).toBe("net_worth");
    expect(basisFromAnswer(OPTIONS[1])).toBe("income");
    expect(basisFromAnswer(OPTIONS[2])).toBe("professional_certification");
    expect(basisFromAnswer(OPTIONS[3])).toBe("knowledgeable_employee");
    expect(basisFromAnswer(OPTIONS[4])).toBe("entity_assets");
  });
});
