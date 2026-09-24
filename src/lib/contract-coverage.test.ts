import { describe, expect, it } from "vitest";
import {
  approvalProblem,
  centsSchema,
  friendlyParse,
  mapStaffCaps,
  normalizePriceInput,
  parseMoneyToCents,
  relatedDocumentOptions,
  resolveFundCoverage,
  resolveServiceCoverage,
  SEPT_2026_PACKAGE,
  staffCapabilitiesFor,
  STAFF_TO_CLIENT_CAP,
  STAFF_TO_CONTRACT_CAPS,
  tierFeeFor,
  type CoverageSow,
} from "./contract-coverage";
import { relationshipProblem } from "./contract-intelligence";
import { z } from "zod";

const msa = { id: "msa", title: "Master Service Agreement", doc_type: "msa", review_status: "approved", effective_date: "2026-09-01" };
const msaOld = { id: "msa0", title: "Old MSA", doc_type: "msa", review_status: "superseded", effective_date: "2024-01-01" };
const sow = { id: "sow", title: "SPV SOW", doc_type: "sow", review_status: "approved", effective_date: "2026-09-01" };
const amd = { id: "amd", title: "Amendment 1", doc_type: "amendment", review_status: "approved", effective_date: "2026-12-01" };

describe("related document selection", () => {
  it("lists current client documents with useful labels and excludes itself", () => {
    const r = relatedDocumentOptions(amd, [amd, msa, sow, msaOld], "amends");
    expect(r.options.map((o) => o.id)).toEqual(["msa", "sow"]);
    expect(r.options[0]!.label).toBe("Master Service Agreement — Effective Sep 1, 2026 — Active");
  });
  it("preselects the single obvious agreement", () => {
    expect(relatedDocumentOptions(amd, [msa, sow], "amends").defaultId).toBe("msa");
    expect(relatedDocumentOptions(amd, [msa, sow], "amends_sow").defaultId).toBe("sow");
  });
  it("requires a choice when ambiguous", () => {
    const sow2 = { ...sow, id: "sow2", title: "Tax SOW" };
    const r = relatedDocumentOptions(amd, [msa, sow, sow2], "amends_sow");
    expect(r.defaultId).toBeNull();
    expect(r.ambiguous).toBe(true);
  });
  it("rejects self relationships and requires a provision for provision scope", () => {
    const base = { relationship_type: "amends" as const, document_id: "a", reason: null, scope: "client_wide" as const, offering_ids: [], service_keys: [] };
    expect(relationshipProblem({ ...base, related_document_id: "a" })).toMatch(/itself/);
    expect(relationshipProblem({ ...base, related_document_id: "b", scope: "provision" })).toMatch(/provision/);
  });
});

describe("maker/checker", () => {
  it("preparer cannot approve own determination; decided ones are final", () => {
    expect(approvalProblem("u1", "u1", "pending_approval")).toMatch(/different person/);
    expect(approvalProblem("u1", "u2", "approved")).toMatch(/isn't waiting/);
    expect(approvalProblem("u1", "u2", "pending_approval")).toBeNull();
  });
});

const exec = (o: Partial<CoverageSow>): CoverageSow => ({ id: "s1", title: "SPV Administration SOW", client_id: "c", offering_id: null, status: "active", executed_at: "2026-09-01", ...o });

describe("contract coverage", () => {
  const base = { clientId: "c", governingMsa: { id: "msa", title: "MSA" }, fundHasServices: true };
  it("one SOW covers multiple funds without duplication", () => {
    const s = exec({ covered_offering_ids: ["f1", "f2", "f3", "f4"] });
    for (const f of ["f1", "f2", "f3", "f4"]) {
      const r = resolveFundCoverage({ ...base, offeringId: f, sows: [s] });
      expect(r.status).toBe("covered");
      expect(r.sows).toHaveLength(1);
    }
  });
  it("detects existing coverage before a new SOW, and asks for review when scope is unclear", () => {
    const s = exec({ covered_offering_ids: ["f1"] });
    expect(resolveFundCoverage({ ...base, offeringId: "f9", sows: [s] }).status).toBe("needs_review");
    expect(resolveFundCoverage({ ...base, offeringId: "f9", sows: [exec({ fund_scope: "client_wide" })] }).status).toBe("covered_client_wide");
  });
  it("a new fund never implies a SOW", () => {
    expect(resolveFundCoverage({ ...base, offeringId: "f", sows: [], fundHasServices: false }).status).toBe("msa_only");
    expect(resolveFundCoverage({ ...base, offeringId: "f", sows: [] }).status).toBe("sow_required");
    expect(resolveFundCoverage({ ...base, governingMsa: null, offeringId: "f", sows: [] }).status).toBe("no_governing_agreement");
  });
  it("ignores other clients' SOWs", () => {
    expect(resolveFundCoverage({ ...base, offeringId: "f1", sows: [exec({ client_id: "other", covered_offering_ids: ["f1"] })] }).status).toBe("sow_required");
  });
  it("identifies partial service coverage", () => {
    const s = exec({ service_keys: ["admin", "tax"] });
    expect(resolveServiceCoverage(["admin", "tax"], [s]).status).toBe("already_contracted");
    const p = resolveServiceCoverage(["admin", "k1"], [s]);
    expect(p.status).toBe("partially_covered");
    expect(p.uncovered).toEqual(["k1"]);
    expect(resolveServiceCoverage(["k1"], [s]).status).toBe("not_covered");
  });
});

describe("pricing input", () => {
  it("converts currency to cents and never returns NaN", () => {
    expect(parseMoneyToCents("$7,500.00")).toBe(750000);
    expect(parseMoneyToCents("7500")).toBe(750000);
    for (const bad of ["", "abc", "7.5.0", "-5", "1e5", undefined, null, Number.NaN]) expect(parseMoneyToCents(bad as any)).toBeNull();
  });
  it("blank fixed price gives a useful message", () => {
    const r = normalizePriceInput({ model: "fixed", amount: "" });
    expect(r).toEqual({ ok: false, message: "Enter a valid service price or select another pricing method." });
  });
  it("tiered, percentage, pass-through and custom don't require amountCents", () => {
    expect(normalizePriceInput({ model: "tiered", tiers: SEPT_2026_PACKAGE.spvBaseFeeTiers })).toMatchObject({ ok: true, amountCents: null });
    expect(normalizePriceInput({ model: "percentage", percent: "1.25%" })).toMatchObject({ ok: true, amountCents: null, rateBps: 125 });
    expect(normalizePriceInput({ model: "pass_through" })).toMatchObject({ ok: true, amountCents: null });
    expect(normalizePriceInput({ model: "custom" })).toMatchObject({ ok: true, amountCents: null });
  });
  it("resolves standard SPV tiers", () => {
    const t = SEPT_2026_PACKAGE.spvBaseFeeTiers;
    expect(tierFeeFor(t, 10_000_000)).toBe(500_000);
    expect(tierFeeFor(t, 50_000_000)).toBe(750_000);
    expect(tierFeeFor(t, 500_000_000)).toBe(1_000_000);
    expect(tierFeeFor(t, 2_000_000_000)).toBe(1_500_000);
  });
  it("server boundary rejects NaN with a human message", () => {
    expect(() => friendlyParse(z.object({ c: centsSchema }), { c: Number.NaN })).toThrow("Enter a valid service price or select another pricing method.");
  });
});

describe("staff RBAC", () => {
  it("Client Ops can add funds but not approve pricing/precedence", () => {
    const caps = staffCapabilitiesFor({ roles: [], assignedRoleKeys: ["client_operations_specialist"] });
    expect(mapStaffCaps(caps, STAFF_TO_CLIENT_CAP)).toContain("link_funds");
    expect(mapStaffCaps(caps, STAFF_TO_CLIENT_CAP)).not.toContain("approve_pricing");
    expect(mapStaffCaps(caps, STAFF_TO_CONTRACT_CAPS)).not.toContain("approve_precedence");
  });
  it("grants cannot confer tax, compliance-exception or money authority", () => {
    const caps = staffCapabilitiesFor({ roles: [], grants: ["tax_full_tin", "execute_money_movement", "approve_compliance_exception"], customRoles: { x: ["tax_full_tin"] }, assignedRoleKeys: ["x"] });
    expect(caps).toEqual([]);
  });
  it("custom roles resolve to capabilities", () => {
    expect(staffCapabilitiesFor({ roles: [], assignedRoleKeys: ["r"], customRoles: { r: ["view_funds", "bogus"] } })).toEqual(["view_funds"]);
  });
});
