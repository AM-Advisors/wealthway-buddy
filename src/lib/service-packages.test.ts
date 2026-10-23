import { describe, expect, it } from "vitest";

import { legacyPrimaryStatus, planContactSave } from "@/lib/client-contacts-model";
import {
  CAP_TIERS, clientServiceStatus, entitlementsFor, fundSubset, isServiceReadinessCondition, mapLegacyServices,
  priceConfig, serviceKeysFor, serviceLabel, spvTiers, validateConfig, type ClientServiceConfig, type RateItem,
} from "@/lib/service-packages";

const rate: RateItem[] = [
  { serviceKey: null, label: "SPV under $250,000", amountCents: 500000, pricingModel: "one_time" },
  { serviceKey: null, label: "SPV $250,000–$1,000,000", amountCents: 750000, pricingModel: "one_time" },
  { serviceKey: null, label: "SPV over $1,000,000", amountCents: 1000000, pricingModel: "one_time" },
  { serviceKey: "fund_management", label: "Fund Management", amountCents: 250000, pricingModel: "annual" },
  { serviceKey: "investor_onboarding", label: "IO annual", amountCents: 250000, pricingModel: "annual" },
  { serviceKey: "investor_onboarding_per_investor", label: "IO per investor", amountCents: 5000, pricingModel: "transaction" },
  { serviceKey: "tax_k1", label: "Taxes", amountCents: 250000, pricingModel: "annual" },
  { serviceKey: "financial_statements", label: "FS", amountCents: 250000, pricingModel: "transaction" },
  { serviceKey: "additional_asset", label: "Additional asset", amountCents: 200000, pricingModel: "transaction" },
  { serviceKey: "cap_table_growth", label: "Growth monthly", amountCents: 30000, pricingModel: "recurring" },
  { serviceKey: "cap_table_growth", label: "Growth annual", amountCents: 300000, pricingModel: "annual" },
  { serviceKey: "cap_table_scale", label: "Scale custom", amountCents: null, pricingModel: "recurring" },
];
const find = (c: ClientServiceConfig, k: string) => priceConfig(c, rate).find((l) => l.key === k)!;

describe("contacts", () => {
  const existing = [{ id: "a", full_name: "Jane Doe", email: "jane@x.com", designations: [] }];
  it("Primary Contact entry links the existing contact instead of creating a second one", () => {
    const p = planContactSave(existing, [{ full_name: "Jane Doe", email: "jane@x.com", designations: ["Primary"] }]);
    expect(p.error).toBeNull();
    expect(p.rows[0]!.id).toBe("a");
    expect(p.rows[0]!.designations).toContain("Primary");
    expect(p.linked).toBe(1);
  });
  it("possible match stops with Contact Review Required unless confirmed separate", () => {
    const inc = [{ full_name: "Jane Doe", email: "other@x.com", designations: [] }];
    expect(planContactSave(existing, inc).error).toMatch(/Contact Review Required/);
    expect(planContactSave(existing, inc, [0]).error).toBeNull();
  });
  it("changing Primary keeps the old contact and deactivates (never deletes) removed ones", () => {
    const p = planContactSave(
      [{ id: "a", full_name: "Jane Doe", email: "jane@x.com", designations: ["Primary"] }, { id: "b", full_name: "Bo Li", email: null, designations: [] }],
      [{ id: "a", full_name: "Jane Doe", email: "jane@x.com", designations: [] }, { full_name: "Sam Roe", email: "sam@x.com", designations: ["Primary"] }],
    );
    expect(p.rows.find((r) => r.id === "a")).toBeTruthy();
    expect(p.deactivate).toEqual(["b"]);
  });
  it("only one Primary Contact", () => {
    expect(planContactSave([], [{ full_name: "A B", designations: ["Primary"] }, { full_name: "C D", designations: ["Primary"] }]).error).toMatch(/one contact/);
  });
  it("legacy primary without a Primary contact needs review", () => {
    expect(legacyPrimaryStatus({ primary_contact_name: "Jane Doe", primary_contact_email: "jane@x.com" }, []).status).toBe("review");
    expect(legacyPrimaryStatus({ primary_contact_name: "Jane Doe", primary_contact_email: "jane@x.com" }, [{ id: "a", full_name: "Jane Doe", email: "jane@x.com", designations: ["Primary"] }]).status).toBe("linked");
  });
});

describe("service packages", () => {
  it("State Formation terminology", () => expect(serviceLabel("delaware_formation", "Delaware formation")).toBe("State Formation"));
  it("Standard SPV resolves raise-based price from the rate card", () => {
    expect(spvTiers(rate)).toHaveLength(3);
    expect(find({ spv: { structure: "standard", expectedRaiseCents: 50_000_000 } }, "spv_standard").totalCents).toBe(750000);
    expect(find({ spv: { structure: "standard" } }, "spv_standard").status).toBe("raise_based");
  });
  it("Series SPV includes the master formation and needs a known Master", () => {
    const c: ClientServiceConfig = { spv: { structure: "series", masterId: "m1" } };
    expect(serviceKeysFor(c)).toContain("management_llc");
    expect(validateConfig(c, ["m1"])).toEqual([]);
    expect(validateConfig({ spv: { structure: "series", masterId: "zz" } }, ["m1"])).not.toEqual([]);
  });
  it("Investor Onboarding included with SPV, never charged twice", () => {
    const l = find({ spv: { structure: "standard" }, investorOnboarding: { billing: "annual" } }, "investor_onboarding");
    expect(l.status).toBe("included");
    expect(l.totalCents).toBeNull();
    expect(entitlementsFor({ spv: { structure: "standard" }, investorOnboarding: { billing: null } }).filter((e) => e.kind === "investor_onboarding")).toHaveLength(1);
  });
  it("Fund Management $2,500/year", () => expect(find({ fund: { management: true } }, "fund_management").totalCents).toBe(250000));
  it("Investor Onboarding annual / per investor, billing required outside SPV", () => {
    expect(find({ investorOnboarding: { billing: "annual" } }, "investor_onboarding").totalCents).toBe(250000);
    expect(find({ investorOnboarding: { billing: "per_investor" } }, "investor_onboarding").unitCents).toBe(5000);
    expect(validateConfig({ investorOnboarding: { billing: null } })).not.toEqual([]);
  });
  it("Taxes and Financial Reporting multiply by quantity", () => {
    expect(find({ taxes: { sets: 1 } }, "taxes").totalCents).toBe(250000);
    expect(find({ taxes: { sets: 3 } }, "taxes").totalCents).toBe(750000);
    expect(find({ financialReporting: { reports: 2 } }, "financial_reporting").totalCents).toBe(500000);
  });
  it("included vs additional quantities keep their source", () => {
    const c: ClientServiceConfig = { spv: { structure: "standard" }, financialReporting: { reports: 1 }, alaCarte: [{ serviceKey: "additional_asset", quantity: 2 }] };
    const caps = entitlementsFor(c).filter((e) => e.kind === "capital_account_statements");
    expect(caps.map((e) => e.source).sort()).toEqual(["Financial Reporting", "Standard SPV LLC"]);
    expect(find(c, "additional_asset").totalCents).toBe(400000);
  });
  it("Cap Table: one tier, rate-card price, Pricing Required when unpriced", () => {
    expect(CAP_TIERS).toHaveLength(5);
    expect(find({ capTable: { tier: "growth" } }, "cap_table_growth").totalCents).toBe(300000);
    expect(find({ capTable: { tier: "scale" } }, "cap_table_scale").status).toBe("pricing_required");
    expect(priceConfig({ capTable: { tier: "growth" } }, rate).filter((l) => l.key.startsWith("cap_table_"))).toHaveLength(1);
  });
  it("à la carte already in the package shows Included", () => {
    expect(find({ spv: { structure: "standard" }, alaCarte: [{ serviceKey: "form_d", quantity: 1 }] }, "form_d").status).toBe("included");
  });
  it("Fund subset leaves Cap Table at the Client unless chosen, and is a copy", () => {
    const client: ClientServiceConfig = { spv: { structure: "standard" }, capTable: { tier: "growth" }, taxes: { sets: 1 } };
    const f = fundSubset(client, ["spv_standard", "taxes"]);
    expect(f.capTable).toBeNull();
    client.taxes = { sets: 5 }; // later client change
    expect(f.taxes).toEqual({ sets: 1 });
  });
  it("legacy flat services map deterministically; the rest go to Service Mapping Review", () => {
    const m = mapLegacyServices(["tax_k1", "tax_1065", "kyc", "cap_table_growth", "side_letters"]);
    expect(m.config.taxes).toEqual({ sets: 1 });
    expect(m.config.capTable).toEqual({ tier: "growth" });
    expect(m.review).toContain("side_letters");
    expect(m.review).toContain("investor_onboarding_billing");
    expect(clientServiceStatus(null, ["kyc"])).toBe("legacy_service_review");
  });
  it("no commercial service state gates readiness", () => {
    for (const s of ["configured", "service_mapping_review", "legacy_service_review", "none"] as const) expect(isServiceReadinessCondition(s)).toBe(false);
  });
});
