import { describe, expect, it } from "vitest";
import proposed from "./config/bookkeeping-proposed.json";
import { bookkeepingConfigSchema, bookkeepingDraftBlocker, bookkeepingDueOn, bookkeepingTerms, calculateBookkeeping, type BookkeepingInput } from "./bookkeeping-model";

const config = bookkeepingConfigSchema.parse(proposed);
const input: BookkeepingInput = { configVersionId: "11111111-1111-4111-8111-111111111111", tier: "essential", reconciliation: "monthly", billing: "monthly", entityReferences: ["Fictional Sample Company"], expectedTransactions: 0, financialAccounts: 0, accountingMethod: "cash", reportingRequirements: "", effectiveOn: "2026-11-01", termMonths: 12, addons: [], customMonthlyCents: null, customReason: "" };
describe("proposed bookkeeping rules", () => {
  const rates = { self_service: [7900, 8900, 9900], essential: [15000, 20000, 25000], growth: [30000, 40000, 50000], professional: [65000, 82500, 100000], enterprise: [null, 200000, 250000] };
  for (const [tier, prices] of Object.entries(rates)) for (const [i, reconciliation] of (["annual", "quarterly", "monthly"] as const).entries()) {
    it(`${tier} ${reconciliation} uses the supplied proposed rate`, () => {
      const result = calculateBookkeeping(config, { ...input, tier: tier as BookkeepingInput["tier"], reconciliation });
      expect(result.listMonthly).toBe(prices[i]);
      if (tier === "enterprise") expect(result.customRequired).toBe(true);
      if (tier === "enterprise" && reconciliation === "annual") expect(result.invoiceCents).toBeNull();
    });
  }
  for (const [billing, expected] of [["monthly", 25000], ["quarterly", 75000], ["annual", 300000]] as const) it(`${billing} billing has no prepayment discount`, () => {
    const result = calculateBookkeeping(config, { ...input, billing });
    expect(result.invoiceCents).toBe(expected);
    expect(result.annualCents).toBe(300000);
  });
  for (const [tier, transactions, accounts] of [["self_service", 250, 3], ["essential", 50, 2], ["growth", 150, 4], ["professional", 350, 8], ["enterprise", 500, null]] as const) it(`${tier} has exact included allowances`, () => {
    const result = calculateBookkeeping(config, { ...input, tier });
    expect(result.tier.transactions).toBe(transactions); expect(result.tier.accounts).toBe(accounts);
  });
  for (const [key, cents] of [["historical_cleanup", 10000], ["initial_cleanup", 50000], ["extra_transactions", 5000], ["extra_account", 2500], ["extra_entity", 20000], ["payroll_integration", 10000], ["ar_ap", 15000], ["runway", 25000], ["custom_report", 25000], ["analysis", 12500]] as const) it(`${key} retains the proposed optional rate`, () => {
    expect(config.addons.find(a => a.key === key)?.unitCents).toBe(cents);
  });
  it("prices whole extra transaction blocks and accounts once", () => {
    const result = calculateBookkeeping(config, { ...input, expectedTransactions: 101, financialAccounts: 3, addons: [{ key: "extra_transactions", quantity: 1 }] });
    expect(result.extraTransactions).toBe(2); expect(result.extraAccounts).toBe(1); expect(result.monthlyCents).toBe(37500);
  });
  it("keeps one-time and quoted usage outside recurring billing", () => {
    const result = calculateBookkeeping(config, { ...input, addons: [{ key: "initial_cleanup", quantity: 1 }, { key: "historical_cleanup", quantity: 3 }, { key: "custom_report", quantity: 2 }] });
    expect(result.invoiceCents).toBe(25000); expect(result.oneTimeCents).toBe(50000); expect(result.usageCents).toBe(80000);
  });
  it("requires a documented custom Enterprise annual price", () => {
    const unpriced = calculateBookkeeping(config, { ...input, tier: "enterprise", reconciliation: "annual" });
    expect(unpriced.invoiceCents).toBeNull(); expect(unpriced.blockers.length).toBeGreaterThan(0);
    const priced = calculateBookkeeping(config, { ...input, tier: "enterprise", reconciliation: "annual", customMonthlyCents: 275000, customReason: "Fictional approved scope" });
    expect(priced.invoiceCents).toBe(275000); expect(priced.needsExecutiveApproval).toBe(true);
  });
  it("never invents an Enterprise account allowance or multi-entity scope", () => {
    const result = calculateBookkeeping(config, { ...input, tier: "enterprise", entityReferences: ["Fictional A", "Fictional B"], customMonthlyCents: 300000, customReason: "Fictional scope" });
    expect(result.tier.accounts).toBeNull(); expect(result.blockers.some(b => b.includes("every named entity"))).toBe(true);
    expect(() => calculateBookkeeping(config, { ...input, entityReferences: ["Fictional A", "Fictional B"] })).toThrow(/Enterprise/);
  });
  it("rejects duplicate entities and unconfigured optional services", () => {
    expect(() => calculateBookkeeping(config, { ...input, entityReferences: ["Same entity", "Same entity"] })).toThrow(/once/);
    expect(() => calculateBookkeeping(config, { ...input, addons: [{ key: "invented", quantity: 1 }] })).toThrow(/not configured/);
  });
  for (const [tier, days] of [["self_service", null], ["essential", 20], ["growth", 15], ["professional", 10], ["enterprise", 7]] as const) it(`${tier} uses the managed monthly deadline rule`, () => {
    expect(calculateBookkeeping(config, { ...input, tier }).businessDays).toBe(days);
  });
  it("quarterly and annual targets follow the reconciliation cadence", () => {
    expect(calculateBookkeeping(config, { ...input, reconciliation: "quarterly", billing: "annual" }).businessDays).toBe(20);
    expect(calculateBookkeeping(config, { ...input, reconciliation: "annual", billing: "quarterly" }).businessDays).toBe(30);
    expect(calculateBookkeeping(config, { ...input, tier: "self_service", reconciliation: "annual" }).businessDays).toBeNull();
  });
  it("starts deadline after later records receipt and excludes weekends", () => {
    expect(bookkeepingDueOn("2026-10-31", "2026-11-06", 7)).toBe("2026-11-17");
    expect(bookkeepingDueOn("2026-10-31", "2026-10-01", 20)).toBe("2026-11-27");
    expect(bookkeepingDueOn("2026-10-31", "2026-11-06", null)).toBeNull();
  });
  it("staged terms cannot approve, activate, invoice or move money", () => {
    expect(bookkeepingDraftBlocker([{ service_key: "BOOKKEEPING_ACCOUNTING" }])).not.toBeNull();
    expect(bookkeepingDraftBlocker([{ service_key: "other", bookkeeping_snapshot: { publicationStatus: "proposed" } }])).not.toBeNull();
    expect(bookkeepingDraftBlocker([{ service_key: "existing_accounting" }])).toBeNull();
  });
  it("frozen model output does not mutate inputs or configuration", () => {
    const before = JSON.stringify({ config, input });
    calculateBookkeeping(config, input); bookkeepingTerms(config, input);
    expect(JSON.stringify({ config, input })).toBe(before);
  });
  it("configuration cannot silently give Enterprise annual an automatic rate", () => {
    const changed = structuredClone(config); const enterprise = changed.tiers.find(t => t.key === "enterprise");
    if (!enterprise) throw new Error("Missing enterprise fixture");
    enterprise.monthlyCents.annual = 200000;
    expect(bookkeepingConfigSchema.safeParse(changed).success).toBe(false);
  });
});