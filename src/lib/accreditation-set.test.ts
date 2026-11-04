import { describe, expect, it } from "vitest";
import { accreditationSetGuard, basisFromAnswer } from "./accreditation-step";

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
    expect(basisFromAnswer("Over $1M net worth, not counting my primary residence")).toBe("net_worth");
    expect(basisFromAnswer("Over $200,000 income")).toBe("income");
    expect(basisFromAnswer("Series 7 license holder")).toBe("professional_certification");
    expect(basisFromAnswer("An entity with over $5M in assets")).toBe("entity_assets");
  });
});
