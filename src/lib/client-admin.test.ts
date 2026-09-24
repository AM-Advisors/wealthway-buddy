import { describe, expect, it } from "vitest";

import {
  applicationAuthorityFromRoles,
  buildSowLines,
  clientCapabilitiesFor,
  diffClient,
  findApplicableSow,
  groupServices,
  planFundLink,
  portalFundAccess,
  resolveServicePrice,
  resolveSowTemplate,
  serviceChangeRequirement,
  sowDisplayStatus,
  validateTemplateOverride,
  type CatalogService,
  type ClientPriceRow,
  type Selection,
  type SowTemplate,
} from "@/lib/client-admin-model";
import { RECORD_TABS } from "@/lib/ops-records";

const C = "c1";
const F1 = "f1";
const F2 = "f2";
const TODAY = "2026-09-24";

const cat = (key: string, o: Partial<CatalogService> = {}): CatalogService => ({
  id: key, key, name: key.replace(/_/g, " "), category: "administration", service_group: "fund_entity",
  standard_scope: `${key} scope`, billing_frequency: "annual", standard_price_cents: null, active: true, status: "active", ...o,
});
const sel = (id: string, key: string, o: Partial<Selection> = {}): Selection => ({
  id, client_id: C, offering_id: F1, service_key: key, status: "proposed", pending_change: null,
  custom_price_cents: null, override_status: null, ...o,
});
const tpl = (v: number, status: string, o: Partial<SowTemplate> = {}): SowTemplate => ({
  id: `t${v}`, name: "Fund SOW", engagement_type: "fund_administration", version: v, effective_date: "2026-01-01",
  status, retired_at: null, approved_at: status === "draft" ? null : "2026-01-01", ...o,
});
const price = (o: Partial<ClientPriceRow>): ClientPriceRow => ({
  id: "p", service_key: "fund_admin", contracted_cents: 100, offering_id: null, superseded_at: null,
  approved_at: "2026-01-01", origin: "client", ...o,
});

describe("client editing and permissions", () => {
  it("authorized staff can edit a client; unauthorized staff cannot", () => {
    expect(clientCapabilitiesFor(["operations"])).toContain("edit_client");
    expect(clientCapabilitiesFor(["finance"])).not.toContain("edit_client");
    expect(clientCapabilitiesFor(["compliance"])).not.toContain("edit_client");
    expect(clientCapabilitiesFor(["investor", "fund_manager"])).toEqual([]);
  });
  it("only legal/admin approve terms; ordinary operations cannot", () => {
    expect(clientCapabilitiesFor(["legal"])).toContain("approve_terms");
    expect(clientCapabilitiesFor(["operations"])).not.toContain("approve_terms");
    expect(clientCapabilitiesFor(["operations"])).not.toContain("manage_pricing");
  });
  it("records before/after only for changed material fields", () => {
    const d = diffClient({ legal_name: "A LLC", phone: "1" }, { legal_name: "B LLC", phone: "1", ein: "x" });
    expect(d).toEqual([{ field: "legal_name", before: "A LLC", after: "B LLC" }]);
  });
  it("Client 360 is organised into the eight sections, keeping old deep links", () => {
    const visible = RECORD_TABS.client.filter((t) => !t.hidden).map((t) => t.title);
    expect(visible).toEqual(["Overview", "People", "Services & Pricing", "Funds & SPVs", "Companies / Cap Tables", "Contracts & SOWs", "Documents", "Tasks & Activity"]);
    expect(RECORD_TABS.client.map((t) => t.id)).toEqual(expect.arrayContaining(["relationships", "activity", "investors", "contacts", "contracts"]));
  });
});

describe("people and roles", () => {
  it("relationship roles never grant application authority; one person can hold many", () => {
    const roles = ["billing", "authorized_signatory", "fund_manager", "primary"];
    expect(applicationAuthorityFromRoles(roles)).toEqual({ fundAccess: [], moneyMovement: false, signing: false });
  });
  it("fund-manager access stays exact-fund scoped", () => {
    const rows = [{ user_id: "u1", offering_id: F1 }, { user_id: "u2", offering_id: F2 }];
    expect(portalFundAccess("u1", rows)).toEqual([F1]);
    expect(portalFundAccess(null, rows)).toEqual([]);
  });
});

describe("funds", () => {
  it("links an unassigned fund and never silently moves another client's fund", () => {
    expect(planFundLink({ client_id: null }, C).kind).toBe("link");
    expect(planFundLink({ client_id: C }, C).kind).toBe("already_linked");
    expect(planFundLink({ client_id: "other" }, C)).toEqual({ kind: "reassignment_required", fromClientId: "other" });
  });
});

describe("services and pricing", () => {
  it("groups approved services by functional area and drops retired ones", () => {
    const groups = groupServices(
      [cat("fund_admin"), cat("k1", { service_group: "tax" }), cat("old", { status: "retired" }), cat("x", { service_group: null })],
      [{ key: "fund_entity", label: "Fund & Entity", sort_order: 1, active: true }, { key: "tax", label: "Tax", sort_order: 2, active: true }, { key: "custom", label: "Custom / Other", sort_order: 9, active: true }],
    );
    expect(groups.map((g) => [g.key, g.services.map((s) => s.key)])).toEqual([["fund_entity", ["fund_admin"]], ["tax", ["k1"]], ["custom", ["x"]]]);
  });
  it("hierarchy: engagement > client > MSA > standard; negotiated beats standard", () => {
    const rows = [price({ id: "msa", origin: "msa", contracted_cents: 300 }), price({ id: "cl", contracted_cents: 200 }), price({ id: "eng", offering_id: F1, origin: "engagement", contracted_cents: 100 })];
    const std = [{ service_key: "fund_admin", amount_cents: 999 }];
    expect(resolveServicePrice({ serviceKey: "fund_admin", offeringId: F1, clientRows: rows, standard: std })).toMatchObject({ cents: 100, source: "engagement" });
    expect(resolveServicePrice({ serviceKey: "fund_admin", offeringId: F2, clientRows: rows, standard: std })).toMatchObject({ cents: 200, source: "client" });
    expect(resolveServicePrice({ serviceKey: "fund_admin", offeringId: null, clientRows: [rows[0]!], standard: std })).toMatchObject({ cents: 300, source: "msa" });
    expect(resolveServicePrice({ serviceKey: "fund_admin", offeringId: null, clientRows: [], standard: std })).toMatchObject({ cents: 999, source: "standard" });
  });
  it("service scope is fund-specific: another fund's pricing never applies", () => {
    const rows = [price({ offering_id: F2, origin: "engagement" })];
    expect(resolveServicePrice({ serviceKey: "fund_admin", offeringId: F1, clientRows: rows, standard: [] }).status).toBe("pricing_required");
  });
  it("superseded or unapproved client pricing is ignored; conflicting amounts are a conflict", () => {
    expect(resolveServicePrice({ serviceKey: "fund_admin", offeringId: null, clientRows: [price({ superseded_at: "x" }), price({ approved_at: null })], standard: [] }).status).toBe("pricing_required");
    expect(resolveServicePrice({ serviceKey: "fund_admin", offeringId: null, clientRows: [price({ id: "a" }), price({ id: "b", contracted_cents: 150 })], standard: [] }).status).toBe("conflict");
  });
});

describe("services → SOW", () => {
  const catalog = [cat("fund_admin"), cat("k1", { standard_scope: null, description: null })];
  const resolved = { status: "resolved" as const, cents: 500, source: "standard" as const, sourceRef: null, pricingModel: "annual", unit: null };
  it("selected services populate the draft with scope, frequency, fee and source", () => {
    const { lines, blockers } = buildSowLines({ clientId: C, offeringId: F1, selections: [sel("s1", "fund_admin")], catalog, prices: { s1: resolved } });
    expect(blockers).toEqual([]);
    expect(lines[0]).toMatchObject({ selectionId: "s1", serviceKey: "fund_admin", scope: "fund_admin scope", frequency: "annual", cents: 500, pricingSource: "standard" });
  });
  it("removed proposed services disappear from the draft", () => {
    const { lines } = buildSowLines({ clientId: C, offeringId: F1, selections: [sel("s1", "fund_admin", { status: "removed" })], catalog, prices: { s1: resolved } });
    expect(lines).toEqual([]);
  });
  it("missing price, missing scope and unapproved custom pricing block signature", () => {
    const { blockers } = buildSowLines({
      clientId: C, offeringId: F1, catalog,
      selections: [sel("s1", "fund_admin"), sel("s2", "k1"), sel("s3", "fund_admin", { offering_id: null, custom_price_cents: 10, override_status: "pending_approval" })],
      prices: { s1: { status: "pricing_required" }, s2: resolved, s3: resolved },
    });
    expect(blockers.map((b) => b.kind).sort()).toEqual(["custom_pricing_unapproved", "missing_scope", "pricing_required"]);
  });
  it("custom pricing applies only to the selection (global price untouched)", () => {
    const { lines } = buildSowLines({ clientId: C, offeringId: F1, selections: [sel("s1", "fund_admin", { custom_price_cents: 42, override_status: "approved" })], catalog, prices: { s1: resolved } });
    expect(lines[0]).toMatchObject({ cents: 42, pricingSource: "custom" });
    expect(catalog[0]!.standard_price_cents).toBeNull();
  });
  it("approved contract exclusions flag the SOW for Harmonious review", () => {
    const { blockers } = buildSowLines({ clientId: C, offeringId: F1, selections: [sel("s1", "fund_admin")], catalog, prices: { s1: resolved }, excludedWork: "Fund admin is excluded" });
    expect(blockers.map((b) => b.kind)).toContain("contract_conflict");
  });
  it("cross-client and cross-fund selections never enter the SOW", () => {
    const { lines } = buildSowLines({ clientId: C, offeringId: F1, catalog, prices: { a: resolved, b: resolved }, selections: [sel("a", "fund_admin", { client_id: "other" }), sel("b", "fund_admin", { offering_id: F2 })] });
    expect(lines).toEqual([]);
  });
  it("selected services remain Proposed and a later change needs an amendment", () => {
    expect(sel("s", "x").status).toBe("proposed");
    const executed = { id: "w", client_id: C, offering_id: F1, status: "active", executed_at: "2026-01-01" };
    expect(serviceChangeRequirement(executed)).toBe("amendment");
    expect(serviceChangeRequirement(null)).toBe("draft_sow");
    const { lines } = buildSowLines({ clientId: C, offeringId: F1, amendment: true, catalog, prices: { a: resolved, b: resolved }, selections: [sel("a", "fund_admin", { status: "contracted" }), sel("b", "fund_admin", { status: "contracted", pending_change: "remove" })] });
    expect(lines.map((l) => [l.selectionId, l.change])).toEqual([["b", "remove"]]);
  });
});

describe("SOW templates and defaulting", () => {
  it("uses the latest approved/current template, not a newer draft or a retired one", () => {
    expect(resolveSowTemplate([tpl(3, "approved"), tpl(4, "draft")], "fund_administration", TODAY)).toMatchObject({ status: "resolved", template: { version: 3 } });
    expect(resolveSowTemplate([tpl(3, "approved"), tpl(4, "approved")], "fund_administration", TODAY)).toMatchObject({ template: { version: 4 } });
    expect(resolveSowTemplate([tpl(5, "retired", { retired_at: "2026-02-01" })], "fund_administration", TODAY).status).toBe("none");
    expect(resolveSowTemplate([tpl(2, "approved", { effective_date: "2027-01-01" })], "fund_administration", TODAY).status).toBe("none");
  });
  it("no approved template yields none (Needs Attention), never an obsolete one", () => {
    expect(resolveSowTemplate([tpl(1, "draft")], "fund_administration", TODAY).status).toBe("none");
    expect(resolveSowTemplate([tpl(1, "approved")], "spv_administration", TODAY).status).toBe("none");
  });
  it("manual override needs a reason and an approved, applicable template", () => {
    expect(validateTemplateOverride(tpl(3, "approved"), "fund_administration", TODAY, "")).toMatch(/reason/);
    expect(validateTemplateOverride(tpl(4, "draft"), "fund_administration", TODAY, "client asked")).toMatch(/approved/);
    expect(validateTemplateOverride(tpl(5, "retired"), "fund_administration", TODAY, "client asked")).toMatch(/approved/);
    expect(validateTemplateOverride(tpl(3, "approved"), "fund_administration", TODAY, "client asked")).toBeNull();
  });
  it("reuses an existing executed SOW for the same client + fund only", () => {
    const sows = [
      { id: "mine", client_id: C, offering_id: F1, status: "active", executed_at: "2026-01-01" },
      { id: "otherFund", client_id: C, offering_id: F2, status: "active", executed_at: "2026-01-01" },
      { id: "otherClient", client_id: "x", offering_id: F1, status: "active", executed_at: "2026-01-01" },
    ];
    expect(findApplicableSow(sows, C, F1).executed?.id).toBe("mine");
    expect(findApplicableSow(sows, C, "f3").executed).toBeNull();
  });
  it("an auto-generated SOW is never treated as executed", () => {
    const draft = { id: "d", client_id: C, offering_id: F1, status: "draft", executed_at: null, generated_automatically: true };
    expect(sowDisplayStatus(draft)).toBe("Draft");
    expect(findApplicableSow([draft], C, F1)).toMatchObject({ executed: null, draft: { id: "d" } });
    expect(sowDisplayStatus({ ...draft, review_blockers: [{ kind: "pricing_required" }] })).toBe("Needs Pricing");
    expect(sowDisplayStatus(null)).toBe("No SOW");
  });
  it("a new template release does not touch an executed SOW's version", () => {
    const executed = { id: "e", client_id: C, offering_id: F1, status: "active", executed_at: "2026-01-01", template_version: 3 };
    resolveSowTemplate([tpl(3, "approved"), tpl(4, "approved")], "fund_administration", TODAY);
    expect(executed.template_version).toBe(3);
    expect(sowDisplayStatus(executed)).toBe("Executed");
  });
});
