import { describe, expect, it } from "vitest";
import {
  buildMyFunds,
  filterMyFunds,
  fundFilterKey,
  investorFundView,
  platformAgreementHistory,
  prefillFromContract,
  REQUEST_GROUPS,
  separateSignedRecords,
  setupSchemaFor,
  SPV_SETUP_SCHEMA,
  workspaceCategories,
} from "./client-portal-model";
import { ADVICE_PATTERN, DEFAULT_HELP, resolveHelp } from "./help-content";
import { REQUEST_INTENTS } from "./client-services.functions";
import { resolveFundCoverage } from "./contract-coverage";

describe("platform agreements", () => {
  const rows = [
    { id: "1", kind: "terms", version: 1, accepted_at: "2025-01-01" },
    { id: "2", kind: "terms", version: 2, accepted_at: "2026-01-01" },
    { id: "3", kind: "e_records", version: 1, accepted_at: "2025-01-01" },
    { id: "4", kind: "privacy", version: 1, accepted_at: "2025-01-01" },
    { id: "5", kind: "pricing", version: 1, accepted_at: "2025-01-01" },
    { id: "6", kind: "migration", version: 1, accepted_at: "2025-01-01" },
  ];
  it("keeps every acceptance and marks the newest per kind current", () => {
    const h = platformAgreementHistory(rows);
    expect(h.history).toHaveLength(6);
    expect(h.agreements.map((a) => a.label)).toEqual(["Terms & Conditions", "Electronic Records / E-Sign Consent", "Privacy", "Migration Terms"]);
    expect(h.agreements[0]!.version).toBe("2");
    expect(h.history.find((x) => x.id === "1")!.current).toBe(false);
    expect(h.pricing.map((p) => p.label)).toEqual(["Standard Pricing Acknowledgment"]);
  });
  it("platform sign-offs are not shown as executed documents", () => {
    const s = separateSignedRecords([{ id: "sow", kind: "agreement" }, { id: "p", kind: "policy" }]);
    expect(s.documents.map((d) => d.id)).toEqual(["sow"]);
    expect(s.platform.map((d) => d.id)).toEqual(["p"]);
  });
});

describe("fund vs SPV setup", () => {
  it("Launch Fund and Launch SPV are separate workflows in the Funds group", () => {
    expect(REQUEST_GROUPS[0]!.intents).toEqual(["launch_fund", "launch_spv", "move_fund_spv"]);
    for (const g of REQUEST_GROUPS) for (const i of g.intents) expect(REQUEST_INTENTS.some((r) => r.value === i)).toBe(true);
  });
  it("chooses the right schema per type", () => {
    const keys = (v: "fund" | "spv", t?: string) => setupSchemaFor(v, t).map((f) => f.key);
    expect(keys("fund", "venture_capital")).toEqual(expect.arrayContaining(["investment_period", "carried_interest", "capital_call_structure"]));
    expect(keys("fund", "private_equity")).toContain("acquisition_strategy");
    expect(keys("fund", "hedge")).toEqual(expect.arrayContaining(["nav_frequency", "redemptions", "high_water_mark"]));
    expect(keys("fund", "hedge")).not.toContain("capital_call_structure");
    expect(setupSchemaFor("spv")).toBe(SPV_SETUP_SCHEMA);
    expect(SPV_SETUP_SCHEMA.length).toBeLessThan(setupSchemaFor("fund", "venture_capital").length + 2);
  });
});

describe("set up from contract", () => {
  const terms = [
    { term_key: "fund_name", current_value: "Fund I", status: "confirmed", source_page: 2 },
    { term_key: "management_fee", current_value: "2%", status: "extracted" },
    { term_key: "fee_line", current_value: "$7,500", status: "confirmed", service_key: "spv_admin", amount_cents: 750000 },
    { term_key: "fee_line", current_value: "x", status: "extracted", service_key: "form_d", amount_cents: 1 },
  ];
  it("prefills reviewed facts from an executed SOW and flags unconfirmed material facts", () => {
    const p = prefillFromContract(terms, { sowExecuted: true });
    expect(p.fields.find((f) => f.key === "fund_name")!.confirmed).toBe(true);
    expect(p.unconfirmed).toContain("management_fee");
    expect(p.proposedServices).toEqual(["spv_admin"]);
    expect(p.pricing).toEqual([{ serviceKey: "spv_admin", amountCents: 750000 }]);
  });
  it("unexecuted agreement facts always need confirmation", () => {
    expect(prefillFromContract(terms, { sowExecuted: false }).unconfirmed).toContain("fund_name");
  });
  it("additional fund can use an existing SOW; fund can exist without SOW", () => {
    const sow = { id: "s", title: "SPV SOW", client_id: "c", offering_id: null, covered_offering_ids: ["a", "b"], status: "active", executed_at: "2026-01-01" };
    expect(resolveFundCoverage({ clientId: "c", offeringId: "b", governingMsa: null, sows: [sow], fundHasServices: true }).status).toBe("covered");
    expect(resolveFundCoverage({ clientId: "c", offeringId: "new", governingMsa: null, sows: [], fundHasServices: false }).status).toBe("no_governing_agreement");
  });
});

describe("My Funds", () => {
  const funds = [
    { id: "a", name: "Alpha VC Fund I", fund_type: "venture_capital", entity_type: null, is_open: true, client_name: "C" },
    { id: "b", name: "Beta SPV", fund_type: "spv", entity_type: null, is_open: false, client_name: "C" },
    { id: "c", name: "Gamma Hedge", fund_type: "hedge", entity_type: null, is_open: true, client_name: "C" },
    { id: "d", name: "Other client fund", fund_type: "private_equity", entity_type: null, is_open: true, client_name: "C" },
  ];
  it("contains only related funds, with exact fund-manager scope", () => {
    const rows = buildMyFunds({ managedFundIds: ["a"], investorFundIds: ["c"] }, funds);
    expect(rows.map((r) => r.id)).toEqual(["a", "c"]);
    expect(rows.find((r) => r.id === "c")!.path).toBe("/my-funds/c");
    expect(rows.find((r) => r.id === "c")!.client).toBeNull();
    expect(rows.find((r) => r.id === "a")!.path).toBe("/manager/fund/a");
  });
  it("filters by type", () => {
    const rows = buildMyFunds({ managedFundIds: ["a", "b", "c", "d"], investorFundIds: [] }, funds);
    expect(filterMyFunds(rows, "vc").map((r) => r.id)).toEqual(["a"]);
    expect(filterMyFunds(rows, "spv").map((r) => r.id)).toEqual(["b"]);
    expect(filterMyFunds(rows, "hedge").map((r) => r.id)).toEqual(["c"]);
    expect(filterMyFunds(rows, "pe").map((r) => r.id)).toEqual(["d"]);
    expect(fundFilterKey("Venture")).toBe("vc");
  });
  it("multi-persona user sees company, funds and investments from one identity", () => {
    expect(workspaceCategories({ companyIds: ["co"], clientIds: [], managedFundIds: ["a"], investmentCount: 1, investmentProfileIds: ["p"] })).toEqual(["company", "funds", "investments"]);
    expect(workspaceCategories({ companyIds: [], clientIds: [], managedFundIds: [], investmentCount: 1, investmentProfileIds: ["p"] })).not.toContain("company");
  });
});

describe("investor-safe fund view", () => {
  it("drops other investors and internal fund data", () => {
    const v = investorFundView({
      fund: { id: "f", name: "F", fund_type: "venture_capital", client_id: "c", bank_accounts: [1], wire_instructions: "x", compliance: "y" },
      myPositions: [{ id: "p", status: "active", other_investors: ["z"], manager_review_notes: "n" }],
      myDocuments: [],
    });
    const json = JSON.stringify(v);
    for (const k of ["client_id", "bank_accounts", "wire_instructions", "compliance", "other_investors", "manager_review_notes"]) expect(json).not.toContain(k);
    expect(v.myInvestments).toEqual([{ id: "p", status: "active" }]);
  });
});

describe("help content", () => {
  it("covers the priority terms and never gives advice", () => {
    for (const k of ["spv", "vc_fund", "pe_fund", "hedge_fund", "506b", "506c", "kyc", "kyb", "aml", "form_d", "blue_sky", "sow", "msa", "nav", "carried_interest"]) expect(DEFAULT_HELP[k]).toBeTruthy();
    for (const h of Object.values(DEFAULT_HELP)) expect(ADVICE_PATTERN.test(`${h.short_description} ${h.long_description ?? ""}`)).toBe(false);
    expect(DEFAULT_HELP["506c"]!.professional).toBe(true);
  });
  it("published registry rows override defaults", () => {
    expect(resolveHelp("spv", [{ help_key: "spv", short_description: "Updated" }])!.short_description).toBe("Updated");
    expect(resolveHelp("missing")).toBeNull();
  });
});
