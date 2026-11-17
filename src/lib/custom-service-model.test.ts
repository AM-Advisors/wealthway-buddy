import { describe, expect, it } from "vitest";
import { canChangeCustomService, canCreateCustomService, canReviewCustomServices, cleanCustomService, customQuoteLine, customServiceIdFromKey, customServiceKey, customServiceProblem, editReopensReview, isCustomServiceKey, priceCustomLine, reviewProblem } from "@/lib/custom-service-model";

const base = cleanCustomService({ name: "Board pack prep", summary: "Quarterly board pack assembly for the fund.", included: "Deck\nMinutes" });

describe("custom service keys", () => {
  it("round-trips the service id", () => {
    const key = customServiceKey("abc");
    expect(isCustomServiceKey(key)).toBe(true);
    expect(customServiceIdFromKey(key)).toBe("abc");
    expect(isCustomServiceKey("ADMIN:fund:core")).toBe(false);
  });
});

describe("who reviews", () => {
  it("Super Admin, CEO, CRO, Operations and Product Reviewers review", () => {
    for (const r of ["super_admin", "executive", "cro", "operations", "product_reviewer"]) expect(canReviewCustomServices([r])).toBe(true);
    expect(canReviewCustomServices(["account_executive"])).toBe(false);
    expect(canReviewCustomServices(["sales_management"])).toBe(false);
  });
  it("Sales who can draft quotes can create custom services", () => {
    expect(canCreateCustomService(["account_executive"])).toBe(true);
    expect(canCreateCustomService(["bdr"])).toBe(false);
  });
  it("blocks reviewing your own service", () => {
    expect(reviewProblem({ actorId: "u1", roles: ["super_admin"], createdBy: "u1", decision: "not_tech" })).toMatch(/other than/);
  });
  it("needs a product when adding to an existing product", () => {
    expect(reviewProblem({ actorId: "u2", roles: ["operations"], createdBy: "u1", decision: "add_to_product" })).toMatch(/which product/);
    expect(reviewProblem({ actorId: "u2", roles: ["operations"], createdBy: "u1", decision: "add_to_product", productTarget: "Cap table" })).toBeNull();
  });
  it("rejects non-reviewers and retired services", () => {
    expect(reviewProblem({ actorId: "u2", roles: ["sales"], createdBy: "u1", decision: "design_build" })).not.toBeNull();
    expect(reviewProblem({ actorId: "u2", roles: ["cro"], createdBy: "u1", decision: "design_build", archived: true })).toMatch(/retired/);
  });
  it("only the creator, Sales leaders and reviewers change a service", () => {
    expect(canChangeCustomService({ actorId: "u1", roles: ["account_executive"], createdBy: "u1" })).toBe(true);
    expect(canChangeCustomService({ actorId: "u2", roles: ["account_executive"], createdBy: "u1" })).toBe(false);
    expect(canChangeCustomService({ actorId: "u2", roles: ["sales_management"], createdBy: "u1" })).toBe(true);
    expect(canChangeCustomService({ actorId: "u2", roles: ["product_reviewer"], createdBy: "u1" })).toBe(true);
  });
});

describe("writing a service", () => {
  it("needs a name and a description", () => {
    expect(customServiceProblem(cleanCustomService({ name: "x", summary: "Long enough summary" }))).toMatch(/name/);
    expect(customServiceProblem(cleanCustomService({ name: "Valid", summary: "short" }))).toMatch(/Describe/);
    expect(customServiceProblem(base)).toBeNull();
  });
  it("editing what it is after a decision reopens review; billing changes do not", () => {
    expect(editReopensReview("not_tech", base, { ...base, summary: "Something else entirely now." })).toBe(true);
    expect(editReopensReview("not_tech", base, { ...base, billingFrequency: "annual" })).toBe(false);
    expect(editReopensReview("pending", base, { ...base, name: "Renamed" })).toBe(false);
  });
});

describe("pricing on quotes", () => {
  it("always needs CEO or CRO approval", () => {
    expect(priceCustomLine({ unitCents: 250000, quantity: 1 }, "Board pack").needsExecApproval).toBe(true);
  });
  it("never allows a $0 price", () => {
    expect(() => priceCustomLine({ unitCents: 0, quantity: 1 }, "Board pack")).toThrow(/Enter a price/);
  });
  it("carries the service wording into the quote line", () => {
    const l = customQuoteLine({ id: "s1", name: "Board pack", summary: "What it is", included: ["Deck"], excluded: ["Audit"], billingFrequency: "quarterly", suggestedPriceCents: 150000 });
    expect(l.serviceKey).toBe("CUSTOM:s1");
    expect(l.unitCents).toBe(150000);
    expect(l.details).toEqual({ scope: "What it is", included: ["Deck"], excluded: ["Audit"] });
  });
});
