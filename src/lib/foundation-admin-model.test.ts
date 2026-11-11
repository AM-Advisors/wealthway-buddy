import { describe, expect, it } from "vitest";
import {
  annualReturnReferenceDate, authorityProblem, foundationAccessProblem, foundationCoverageConflict, foundationHandoffTasks,
  foundationLineInputSchema, foundationReleaseBlocker, foundationSnapshot, holdsAuthority, priceFoundationLine,
  type FoundationLineInput,
} from "./foundation-admin-model";
import { quoteInputsFromRows, sowLinesFromQuote } from "./quote-sow-sync";

const P = "11111111-1111-4111-8111-111111111111";
const E = "22222222-2222-4222-8222-222222222222";
const base: FoundationLineInput = foundationLineInputSchema.parse({
  component: "grant_administration", foundationProfileId: P, clientEntityId: E, billing: "annual",
  negotiatedUnitCents: 1_200_000, negotiatedReason: "Agreed with the board chair for 2027", optional: false,
  limits: [{ label: "Grants processed", quantity: 40, unit: "per year" }], scope: "", deliverables: [], included: [], excluded: [],
  serviceStartOn: "2027-01-01", serviceEndOn: null, billingStartOn: "2027-01-01",
});

describe("exact-client access", () => {
  it("denies a member of another client", () => {
    expect(foundationAccessProblem({ capabilities: [], memberClientIds: ["other"], clientId: "mine", write: false })).not.toBeNull();
  });
  it("lets an exact-client member read but never change", () => {
    expect(foundationAccessProblem({ capabilities: [], memberClientIds: ["mine"], clientId: "mine", write: false })).toBeNull();
    expect(foundationAccessProblem({ capabilities: [], memberClientIds: ["other"], clientId: "mine", write: true })).toBe("Foundation not found.");
    expect(foundationAccessProblem({ capabilities: [], memberClientIds: ["mine"], clientId: "mine", write: true })).not.toBeNull();
  });
  it("requires clients:prepare for staff changes", () => {
    expect(foundationAccessProblem({ capabilities: ["clients:see"], memberClientIds: [], clientId: "mine", write: true })).not.toBeNull();
    expect(foundationAccessProblem({ capabilities: ["clients:see", "clients:prepare"], memberClientIds: [], clientId: "mine", write: true })).toBeNull();
  });
});

describe("preparer versus signer", () => {
  it("a paperwork preparer cannot hold signing, banking, verification, grant or payment authority", () => {
    for (const s of ["sign_agreements", "banking", "submit_verification", "approve_grants", "approve_payments"])
      expect(authorityProblem({ role: "paperwork_preparer", scopes: [s], evidenceDocumentId: "doc" })).not.toBeNull();
    expect(authorityProblem({ role: "paperwork_preparer", scopes: ["prepare_paperwork"] })).toBeNull();
  });
  it("signing authority needs evidence", () => {
    expect(authorityProblem({ role: "authorized_signer", scopes: ["sign_agreements"], evidenceDocumentId: null })).not.toBeNull();
    expect(authorityProblem({ role: "authorized_signer", scopes: ["sign_agreements"], evidenceDocumentId: "doc" })).toBeNull();
  });
  it("only an active, effective, exact grant counts", () => {
    const rows = [
      { person_id: "a", role: "paperwork_preparer", authority_scopes: ["prepare_paperwork", "sign_agreements"], status: "active", effective_on: "2026-01-01" },
      { person_id: "b", role: "authorized_signer", authority_scopes: ["sign_agreements"], status: "active", effective_on: "2026-01-01" },
      { person_id: "c", role: "authorized_signer", authority_scopes: ["sign_agreements"], status: "ended", effective_on: "2026-01-01" },
    ];
    expect(holdsAuthority(rows, "a", "sign_agreements", "2026-06-01")).toBe(false);
    expect(holdsAuthority(rows, "a", "prepare_paperwork", "2026-06-01")).toBe(true);
    expect(holdsAuthority(rows, "b", "sign_agreements", "2026-06-01")).toBe(true);
    expect(holdsAuthority(rows, "b", "banking", "2026-06-01")).toBe(false);
    expect(holdsAuthority(rows, "c", "sign_agreements", "2026-06-01")).toBe(false);
    expect(holdsAuthority(rows, "b", "sign_agreements", "2025-12-31")).toBe(false);
  });
});

describe("missing and custom pricing", () => {
  it("no approved rate and no price is refused, never $0", () => {
    const r = priceFoundationLine({ ...base, negotiatedUnitCents: null }, null);
    expect(r.ok).toBe(false);
    expect(priceFoundationLine({ ...base, negotiatedUnitCents: 0 }, null).ok).toBe(false);
  });
  it("a negotiated price without an approved rate always needs executive approval", () => {
    const r = priceFoundationLine(base, null);
    expect(r.ok && r.pricing).toMatchObject({ unitCents: 1_200_000, priceSource: "negotiated", needsExecutiveApproval: true });
  });
  it("a negotiated price needs a reason", () => {
    expect(priceFoundationLine({ ...base, negotiatedReason: null }, null).ok).toBe(false);
  });
  it("an approved rate prices the line; below it needs executive approval", () => {
    const at = priceFoundationLine({ ...base, negotiatedUnitCents: null }, 1_500_000);
    expect(at.ok && at.pricing).toMatchObject({ unitCents: 1_500_000, priceSource: "rate_card", needsExecutiveApproval: false });
    const below = priceFoundationLine(base, 1_500_000);
    expect(below.ok && below.pricing.needsExecutiveApproval).toBe(true);
  });
  it("a zero rate on file is treated as no approved rate", () => {
    const r = priceFoundationLine(base, 0);
    expect(r.ok && r.pricing.priceSource).toBe("negotiated");
  });
  it("cadence follows the component", () => {
    expect(priceFoundationLine({ ...base, billing: "one_time" }, null).ok).toBe(false);
    expect(priceFoundationLine({ ...base, component: "onboarding_setup", billing: "annual" }, null).ok).toBe(false);
  });
  it("billing cannot start before service", () => {
    expect(priceFoundationLine({ ...base, billingStartOn: "2026-12-01" }, null).ok).toBe(false);
  });
});

describe("unreleased services never progress", () => {
  const lines = [{ service_key: "FOUNDATION_ADMIN:grant_administration", foundation_snapshot: {} }];
  it.each(["send", "contract", "sign", "invoice"] as const)("blocks %s with a reason", (action) => {
    expect(foundationReleaseBlocker(lines, action)).toMatch(/Grant administration/);
  });
  it("leaves other quotes alone", () => {
    expect(foundationReleaseBlocker([{ service_key: "ADMIN:SPV_ADMINISTRATION:core", foundation_snapshot: null }], "send")).toBeNull();
  });
});

describe("duplicate coverage", () => {
  const row = { source: "quote" as const, ref: "q1", component: "grant_administration" as const, clientEntityId: E, startOn: "2027-01-01", endOn: "2027-12-31" };
  it("blocks the same entity and component for an overlapping period", () => {
    expect(foundationCoverageConflict({ ...base, serviceStartOn: "2027-06-01" }, [row])).not.toBeNull();
  });
  it("allows a later period, another component or another entity", () => {
    expect(foundationCoverageConflict({ ...base, serviceStartOn: "2028-01-01" }, [row])).toBeNull();
    expect(foundationCoverageConflict({ ...base, component: "governance_admin" }, [row])).toBeNull();
    expect(foundationCoverageConflict({ ...base, clientEntityId: P }, [row])).toBeNull();
  });
  it("one-time setup conflicts whatever the dates", () => {
    expect(foundationCoverageConflict({ ...base, component: "onboarding_setup", serviceStartOn: "2030-01-01" }, [{ ...row, component: "onboarding_setup" }])).not.toBeNull();
  });
});

describe("quote and SOW version consistency", () => {
  it("a new version carries the same foundation terms", () => {
    const pr = priceFoundationLine(base, null);
    if (!pr.ok) throw new Error(pr.problem);
    const snapshot = foundationSnapshot(base, pr.pricing, { entityName: "Example Foundation", checkedAt: "2026-11-11T00:00:00Z" });
    const row = { service_key: "FOUNDATION_ADMIN:grant_administration", label: "x", quantity: 1, unit_cents: 1_200_000, baseline_unit_cents: 1_200_000, line_cents: 1_200_000, sort_order: 0, billing_frequency: "annual", first_bill_on: "2027-01-01", bookkeeping_snapshot: null, foundation_snapshot: snapshot, service_details: {} };
    expect(quoteInputsFromRows([row])[0]!.foundation).toEqual(base);
    expect(sowLinesFromQuote([row])[0]).toHaveProperty("foundation_snapshot");
    expect(snapshot).toMatchObject({ foundationProfileId: P, clientEntityId: E, priceSource: "negotiated", releaseStatus: "unreleased" });
  });
});

describe("Operations handoff", () => {
  it("creates foundation tasks without any fund", () => {
    const tasks = foundationHandoffTasks("Example Foundation", ["onboarding_setup", "grant_administration"]);
    expect(tasks).toHaveLength(3);
    for (const t of tasks) expect(Object.keys(t).sort()).toEqual(["description", "dueInDays", "team", "title"]);
  });
});

describe("annual return reference date", () => {
  it("is the 15th day of the 5th month after fiscal year end", () => {
    expect(annualReturnReferenceDate(12, "2026-11-11")).toBe("2027-05-15");
    expect(annualReturnReferenceDate(6, "2026-11-11")).toBe("2026-11-15");
    expect(annualReturnReferenceDate(null, "2026-11-11")).toBeNull();
  });
});
