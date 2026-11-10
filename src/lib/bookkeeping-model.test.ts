import { describe, expect, it } from "vitest";
import proposed from "@/lib/config/bookkeeping-proposed.json";
import { bookkeepingCoverageBlocker as coverageBlocker, coverageCheckFor as checkFor, bookkeepingConfigSchema, bookkeepingDraftBlocker, bookkeepingTerms, calculateBookkeeping, type BookkeepingInput } from "@/lib/bookkeeping-model";

const config = bookkeepingConfigSchema.parse(proposed);
const priced = bookkeepingConfigSchema.parse({ ...proposed, options: proposed.options.map((o) => o.key === "managed" ? { ...o, monthlyCents: { ...o.monthlyCents, monthly: 100000, quarterly: 80000 } } : o) });
const base: BookkeepingInput = {
  configVersionId: "11111111-1111-4111-8111-111111111111", option: "managed", frequency: "monthly", supportLevel: "self_serve",
  billing: "quarterly", entityId: null, entityReferences: ["Example GP LLC"], expectedTransactions: 40, financialAccounts: 2,
  accountingMethod: "cash", reporting: "standard", reportingRequirements: "", effectiveOn: "2026-01-01", termMonths: 12,
  addons: [], excludedScope: [], customMonthlyCents: null, customReason: "",
};

describe("bookkeeping pricing", () => {
  it("default configuration publishes no prices: every option needs a quote", () => {
    for (const option of ["self_service", "review", "managed"] as const) {
      const r = calculateBookkeeping(config, { ...base, option, frequency: option === "self_service" ? null : option === "review" ? "quarterly" : "monthly" });
      expect(r.listMonthly).toBeNull();
      expect(r.invoiceCents).toBeNull();
      expect(r.blockers.length).toBeGreaterThan(0);
    }
  });

  it("billing frequency multiplies the monthly-equivalent price independently of the close frequency", () => {
    expect(calculateBookkeeping(priced, { ...base, billing: "monthly" }).invoiceCents).toBe(100000);
    expect(calculateBookkeeping(priced, { ...base, billing: "quarterly" }).invoiceCents).toBe(300000);
    expect(calculateBookkeeping(priced, { ...base, billing: "annual" }).invoiceCents).toBe(1200000);
    expect(calculateBookkeeping(priced, { ...base, frequency: "quarterly", billing: "monthly" }).invoiceCents).toBe(80000);
  });

  it("support level never changes price, schedule or deadline", () => {
    const a = calculateBookkeeping(priced, { ...base, supportLevel: "self_serve" });
    const b = calculateBookkeeping(priced, { ...base, supportLevel: "white_glove" });
    expect(b.invoiceCents).toBe(a.invoiceCents);
    expect(b.businessDays).toBe(a.businessDays);
    expect(b.input.frequency).toBe(a.input.frequency);
  });

  it("work beyond the configured limits requires a scope review before any extra charge", () => {
    const r = calculateBookkeeping(priced, { ...base, expectedTransactions: 51 });
    expect(r.scopeReview).toEqual(["51 monthly transactions (limit 50)"]);
    expect(r.blockers[0]).toMatch(/scope review/);
    expect(calculateBookkeeping(priced, { ...base, expectedTransactions: 51, customMonthlyCents: 120000, customReason: "Reviewed volume" }).blockers).toEqual([]);
  });

  it("add-ons without approved prices cannot be added silently", () => {
    const r = calculateBookkeeping(priced, { ...base, addons: [{ key: "payroll", quantity: 1, quotedCents: null }] });
    expect(r.blockers).toContain("Payroll has no approved price; quote it before adding.");
    const quoted = calculateBookkeeping(priced, { ...base, addons: [{ key: "payroll", quantity: 1, quotedCents: 20000 }] });
    expect(quoted.monthlyCents).toBe(120000);
    expect(quoted.needsExecutiveApproval).toBe(true);
  });

  it("Self-Service has no service frequency and Managed has no annual close", () => {
    expect(() => calculateBookkeeping(config, { ...base, option: "self_service", frequency: "monthly" })).toThrow();
    expect(() => calculateBookkeeping(config, { ...base, option: "managed", frequency: "annual" })).toThrow();
    expect(calculateBookkeeping(config, { ...base, frequency: null }).input.frequency).toBe("monthly");
  });

  it("Self-Service terms state no review, correction or accuracy guarantee", () => {
    const priceSelf = bookkeepingConfigSchema.parse({ ...proposed, options: proposed.options.map((o) => o.key === "self_service" ? { ...o, monthlyCents: { ...o.monthlyCents, platform: 5000 } } : o) });
    const terms = bookkeepingTerms(priceSelf, { ...base, option: "self_service", frequency: null });
    expect(terms).toMatch(/no accuracy guarantee/);
  });

  it("quotes containing bookkeeping stay draft-only", () => {
    expect(bookkeepingDraftBlocker([{ service_key: "BOOKKEEPING_ACCOUNTING" }])).toMatch(/proposed/);
    expect(bookkeepingDraftBlocker([{ service_key: "OTHER" }])).toBeNull();
  });
});


describe("coverage check pending for entities not on file", () => {
  const now = "2026-11-10T00:00:00Z";
  const org = { entityName: "Acme Fund I LP", organizationId: "c1", organizationName: "Acme Capital" };
  it("an entity not on file stays pending and blocks the quote", () => {
    const check = checkFor({ entityId: null, entityReferences: ["Acme GP LLC"] }, null, now);
    expect(check.status).toBe("pending");
    expect(coverageBlocker([{ service_key: "BOOKKEEPING_ACCOUNTING", bookkeeping_snapshot: { coverageCheck: check } }])).toContain("Coverage check pending: Acme GP LLC");
  });
  it("a linked entity that passed the checks no longer blocks", () => {
    const check = checkFor({ entityId: "e1", entityReferences: ["Acme Fund I LP"] }, org, now);
    expect(check).toMatchObject({ status: "passed", organizationName: "Acme Capital", entityName: "Acme Fund I LP" });
    expect(coverageBlocker([{ service_key: "BOOKKEEPING_ACCOUNTING", bookkeeping_snapshot: { coverageCheck: check } }])).toBeNull();
  });
  it("other entities named on the same line keep it pending", () => {
    const check = checkFor({ entityId: "e1", entityReferences: ["Acme Fund I LP", "Acme GP LLC"] }, org, now);
    expect(check.status).toBe("pending");
    expect(check.unlinkedReferences).toEqual(["Acme GP LLC"]);
  });
  it("a bookkeeping line saved without a check is treated as pending", () => {
    expect(coverageBlocker([{ service_key: "BOOKKEEPING_ACCOUNTING", bookkeeping_snapshot: { entityReferences: ["X LLC"] } }])).not.toBeNull();
    expect(coverageBlocker([{ service_key: "OTHER" }])).toBeNull();
  });
});
