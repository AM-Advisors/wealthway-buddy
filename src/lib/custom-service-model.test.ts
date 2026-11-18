import { describe, expect, it } from "vitest";
import { buildUpdateProblem, canReleaseCustomService, releaseOf, releaseProblem } from "@/lib/custom-service-model";
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

describe("building a Needs design or build service", () => {
  it("only reviewers move build progress, only for design or build services", () => {
    expect(buildUpdateProblem({ roles: ["product_reviewer"], reviewStatus: "design_build", stage: "building" })).toBeNull();
    expect(buildUpdateProblem({ roles: ["account_executive"], reviewStatus: "design_build", stage: "building" })).not.toBeNull();
    expect(buildUpdateProblem({ roles: ["operations"], reviewStatus: "not_tech", stage: "building" })).toMatch(/Needs design or build/);
    expect(buildUpdateProblem({ roles: ["operations"], reviewStatus: "design_build", released: true, stage: "testing" })).toMatch(/already on quotes/);
  });
});

describe("releasing a built service to quotes", () => {
  const ok = { actorId: "ceo", roles: ["executive"], createdBy: "writer", reviewStatus: "design_build" as const, buildStage: "ready", priceCents: 500000, billing: "annual" };
  it("only the CEO, CRO or Super Admin release", () => {
    expect(canReleaseCustomService(["executive"])).toBe(true);
    expect(canReleaseCustomService(["cro"])).toBe(true);
    expect(canReleaseCustomService(["product_reviewer"])).toBe(false);
    expect(releaseProblem({ ...ok, roles: ["operations"] })).toMatch(/CEO, CRO/);
  });
  it("needs a ready build, a price and someone other than the writer", () => {
    expect(releaseProblem(ok)).toBeNull();
    expect(releaseProblem({ ...ok, buildStage: "testing" })).toMatch(/Ready to release/);
    expect(releaseProblem({ ...ok, priceCents: 0 })).toMatch(/standard price/);
    expect(releaseProblem({ ...ok, actorId: "writer" })).toMatch(/other than/);
    expect(releaseProblem({ ...ok, reviewStatus: "add_to_product" })).not.toBeNull();
  });
  it("released services price like the rate card", () => {
    const r = releaseOf({ releasedAt: "2026-11-18", listPriceCents: 500000, listBilling: "annual" })!;
    expect(priceCustomLine({ unitCents: 500000, quantity: 1, billingFrequency: "annual" }, "X", r)).toMatchObject({ baselineUnitCents: 500000, needsExecApproval: false });
    expect(priceCustomLine({ unitCents: 600000, quantity: 1, billingFrequency: "annual" }, "X", r).needsExecApproval).toBe(false);
    expect(priceCustomLine({ unitCents: 450000, quantity: 1, billingFrequency: "annual" }, "X", r).needsExecApproval).toBe(true);
    expect(priceCustomLine({ unitCents: 500000, quantity: 1, billingFrequency: "quarterly" }, "X", r).needsExecApproval).toBe(true);
  });
  it("unreleased services keep needing CEO or CRO", () => {
    expect(releaseOf({ releasedAt: null, listPriceCents: 500000, listBilling: "annual" })).toBeNull();
    expect(priceCustomLine({ unitCents: 999999, quantity: 1 }, "X", null).needsExecApproval).toBe(true);
  });
  it("a released service starts the quote line at its standard price and billing", () => {
    const l = customQuoteLine({ id: "s1", name: "Board pack", summary: "What it is", included: [], excluded: [], billingFrequency: "one_time", suggestedPriceCents: 100, releasedAt: "2026-11-18", listPriceCents: 500000, listBilling: "annual" });
    expect(l).toMatchObject({ unitCents: 500000, billingFrequency: "annual" });
  });
});
