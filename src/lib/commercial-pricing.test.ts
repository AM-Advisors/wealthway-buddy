import { describe, expect, it } from "vitest";
import {
  assertCanDecide, canApprovePricing, canProposePricing, clientFacingStatus, decideSnapshot, isReadinessCondition, resolveBaseline,
} from "./commercial-pricing";
import { staffProfile } from "./harmonious-staff";

const catalog = [
  { serviceKey: "setup", label: "Fund setup", amountCents: 750000, pricingModel: "one_time", passThrough: false },
  { serviceKey: "bluesky", label: "Blue Sky", amountCents: 0, pricingModel: "pass_through", passThrough: true },
];
const D = "2026-09-29";

describe("pricing resolution", () => {
  it("uses the rate card when no Client Pricing", () => {
    expect(resolveBaseline(catalog, [], D)[0]!.baselineCents).toBe(750000);
  });
  it("valid Client Pricing becomes the baseline", () => {
    const l = resolveBaseline(catalog, [{ serviceKey: "setup", contractedCents: 600000, effectiveDate: "2026-01-01", expiresOn: null, superseded: false, offeringId: null }], D)[0]!;
    expect(l.baselineCents).toBe(600000);
    expect(l.baselineSource).toBe("client_pricing");
  });
  it("ignores expired, future, superseded and fund-only prices", () => {
    const bad = [
      { serviceKey: "setup", contractedCents: 1, effectiveDate: "2026-01-01", expiresOn: "2026-02-01", superseded: false, offeringId: null },
      { serviceKey: "setup", contractedCents: 2, effectiveDate: "2027-01-01", expiresOn: null, superseded: false, offeringId: null },
      { serviceKey: "setup", contractedCents: 3, effectiveDate: null, expiresOn: null, superseded: true, offeringId: null },
      { serviceKey: "setup", contractedCents: 4, effectiveDate: null, expiresOn: null, superseded: false, offeringId: "fund-a" },
    ];
    expect(resolveBaseline(catalog, bad, D)[0]!.baselineCents).toBe(750000);
  });
});

describe("sales controls", () => {
  const base = resolveBaseline(catalog, [], D);
  it("baseline is approved automatically", () => expect(decideSnapshot(base).status).toBe("approved"));
  it("increase is approved", () => expect(decideSnapshot(base, { setup: 1000000 }).status).toBe("approved"));
  it("decrease routes to pricing approval", () => {
    const d = decideSnapshot(base, { setup: 500000 });
    expect(d.status).toBe("pricing_review");
    expect(d.belowBaseline).toEqual(["setup"]);
  });
  it("pass-through cannot be overridden", () => expect(decideSnapshot(base, { bluesky: 1 }).lines[1]!.finalCents).toBe(0));
  it("ordinary Sales cannot approve; no self-approval", () => {
    expect(canApprovePricing(["sales"])).toBe(false);
    expect(canProposePricing(["sales"])).toBe(true);
    expect(() => assertCanDecide(["sales"], "a", "b")).toThrow();
    expect(() => assertCanDecide(["sales_management"], "a", "a")).toThrow();
    expect(() => assertCanDecide(["super_admin"], "a", "b")).not.toThrow();
    expect(canApprovePricing(["operations", "admin"])).toBe(false);
  });
});

describe("commercial states stay out of readiness and client view", () => {
  it("never a readiness condition", () => {
    for (const s of ["msa_follow_up", "pricing_review", "legacy_review"]) expect(isReadinessCondition(s)).toBe(false);
  });
  it("clients never see internal review wording", () => {
    expect(clientFacingStatus("approved")).toBe("Approved");
    expect(clientFacingStatus("pricing_review")).not.toMatch(/approval|discount|baseline/i);
  });
});

describe("staff compatibility map", () => {
  it("existing Operations/Admin keep Operations access", () => {
    expect(staffProfile(["operations"]).operationsAccess).toBe(true);
    expect(staffProfile(["admin"]).operationsAccess).toBe(true);
  });
  it("Sales is commercial only, without Operations access", () => {
    const p = staffProfile(["sales"]);
    expect(p.operationsAccess).toBe(false);
    expect(p.commercialOnly).toBe(true);
    expect(p.superUser).toBe(false);
  });
  it("Operations is not Super User; investors/managers are not staff", () => {
    expect(staffProfile(["operations"]).superUser).toBe(false);
    expect(staffProfile(["fund_manager"]).isHarmoniousStaff).toBe(false);
    expect(staffProfile(["investor"]).isHarmoniousStaff).toBe(false);
  });
});
