import { describe, expect, it } from "vitest";

import { planPricingApplication, normalizeExtraction } from "@/lib/contract-ingestion";
import {
  UNABLE,
  compareDocuments,
  computeLifecycle,
  contractCapabilitiesFor,
  detectConflicts,
  mayApproveTerms,
  renderStandardAgreement,
  renewalReminder,
  resolveContractPrice,
  standardSendBlockers,
  type DocLite,
  type TermLite,
} from "@/lib/contract-intelligence";

const doc = (o: Partial<DocLite> = {}): DocLite => ({
  id: "d1", client_id: "c1", doc_type: "msa", title: "MSA", version: 1,
  review_status: "approved", execution_status: "executed_confirmed", precedence_status: "confirmed",
  effective_date: "2025-01-01", expiration_date: null, notice_days: null,
  applies_to_offering_ids: [], applies_to_service_keys: [], parent_document_id: null, supersedes_id: null, terminated_on: null,
  ...o,
});
const term = (key: string, value: string | null, o: Partial<TermLite> = {}): TermLite => ({
  term_key: key, current_value: value, amount_cents: null, service_key: null, status: "confirmed",
  source_page: "3", source_section: "§4", source_quote: value, ...o,
});

describe("Compare Versions", () => {
  it("detects changed fees and keeps source links", () => {
    const r = compareDocuments(
      { doc: doc(), terms: [term("annual_fee", "$7,500", { amount_cents: 750000, service_key: "fa" })] },
      { doc: doc({ id: "d2", version: 2 }), terms: [term("annual_fee", "$8,500", { amount_cents: 850000, service_key: "fa", source_page: "5" })] },
    );
    const fee = r.rows.find((x) => x.key === "annual_fee")!;
    expect(fee.kind).toBe("changed");
    expect(fee.highlight).toBe(true);
    expect(fee.after?.page).toBe("5");
    expect(r.basedOnApprovedTerms).toBe(true);
  });
  it("classifies added / removed / unchanged provisions (amendment comparison)", () => {
    const r = compareDocuments(
      { doc: doc(), terms: [term("governing_law", "Delaware"), term("confidentiality", "Mutual NDA")] },
      { doc: doc({ id: "a1", doc_type: "amendment" }), terms: [term("governing_law", "delaware "), term("assignment", "No assignment")] },
    );
    expect(r.rows.find((x) => x.key === "governing_law")!.kind).toBe("unchanged");
    expect(r.rows.find((x) => x.key === "confidentiality")!.kind).toBe("removed");
    expect(r.rows.find((x) => x.key === "assignment")!.kind).toBe("added");
  });
  it("flags comparisons that include unapproved proposals", () => {
    const r = compareDocuments({ doc: doc(), terms: [] }, { doc: doc({ id: "x", review_status: "awaiting_review" }), terms: [] });
    expect(r.basedOnApprovedTerms).toBe(false);
  });
});

describe("Scope conflict detection", () => {
  it("flags different notice periods between MSA and linked amendment", () => {
    const msa = { ...doc(), terms: [term("termination_notice", "60 days")] };
    const amd = { ...doc({ id: "a1", doc_type: "amendment", parent_document_id: "d1", precedence_status: "requires_review" }), terms: [term("termination_notice", "30 days")] };
    const c = detectConflicts([msa, amd], [], "2025-06-01");
    expect(c.some((x) => x.kind === "notice_period")).toBe(true);
    expect(c.find((x) => x.kind === "notice_period")!.provisions).toHaveLength(2);
    expect(c.some((x) => x.kind === "precedence_unresolved")).toBe(true);
  });
  it("clears only after a reviewer records the relationship and confirms precedence", () => {
    const msa = { ...doc(), terms: [term("termination_notice", "60 days")] };
    const amd = { ...doc({ id: "a1", doc_type: "amendment", parent_document_id: "d1", precedence_status: "confirmed" }), terms: [term("termination_notice", "30 days")] };
    const rel = [{ id: "r", document_id: "a1", related_document_id: "d1", relationship_type: "amends" as const, scope: "client_wide" as const, status: "active" as const }];
    expect(detectConflicts([msa, amd], rel, "2025-06-01").some((x) => x.kind === "notice_period")).toBe(false);
  });
  it("flags overlapping SOWs for the same fund", () => {
    const a = { ...doc({ id: "s1", doc_type: "sow", applies_to_offering_ids: ["f1"] }), terms: [] };
    const b = { ...doc({ id: "s2", doc_type: "sow", applies_to_offering_ids: ["f1"] }), terms: [] };
    expect(detectConflicts([a, b], [], "2025-06-01").some((x) => x.kind === "overlapping_sow")).toBe(true);
    const c = { ...doc({ id: "s3", doc_type: "sow", applies_to_offering_ids: ["f2"] }), terms: [] };
    expect(detectConflicts([a, c], [], "2025-06-01").some((x) => x.kind === "overlapping_sow")).toBe(false);
  });
  it("flags pricing conflicts and fund-vs-client pricing", () => {
    const fee = (c: number) => term("annual_fee", "$", { amount_cents: c, service_key: "fa" });
    const a = { ...doc({ id: "p1", doc_type: "sow" }), terms: [fee(1000)] };
    const b = { ...doc({ id: "p2", doc_type: "pricing_schedule" }), terms: [fee(2000)] };
    expect(detectConflicts([a, b], [], "2025-06-01").some((x) => x.kind === "price")).toBe(true);
    const f = { ...doc({ id: "p3", doc_type: "sow", applies_to_offering_ids: ["f1"] }), terms: [fee(3000)] };
    expect(detectConflicts([a, f], [], "2025-06-01").some((x) => x.kind === "fund_vs_client_price")).toBe(true);
  });
  it("ignores unreviewed terms and flags unlinked amendments", () => {
    const a = { ...doc(), terms: [term("governing_law", "NY", { status: "needs_review" })] };
    const b = { ...doc({ id: "a9", doc_type: "amendment" }), terms: [term("governing_law", "DE")] };
    const c = detectConflicts([a, b], [], "2025-06-01");
    expect(c.some((x) => x.kind === "governing_law")).toBe(false);
    expect(c.some((x) => x.kind === "unlinked_amendment")).toBe(true);
  });
});

describe("Lifecycle engine", () => {
  it("calculates renewal date and notice deadline from approved terms", () => {
    const lc = computeLifecycle(doc(), [term("initial_term", "one (1) year"), term("auto_renewal", "Automatically renews"), term("renewal_period", "12 months"), term("termination_notice", "60 days")], "2025-03-01");
    expect(lc.initialTermEnd).toBe("2025-12-31");
    expect(lc.renewalDate).toBe("2026-01-01");
    expect(lc.noticeDeadline).toBe("2025-11-01");
    expect(lc.status).toBe("Active");
  });
  it("rolls the renewal forward for later terms", () => {
    const lc = computeLifecycle(doc(), [term("initial_term", "12 months"), term("auto_renewal", "yes"), term("renewal_period", "1 year")], "2026-06-01");
    expect(lc.renewalDate).toBe("2027-01-01");
  });
  it("never guesses a date when information is missing", () => {
    const lc = computeLifecycle(doc(), [term("initial_term", "for the duration of the engagement")], "2025-03-01");
    expect(lc.initialTermEnd).toBeNull();
    expect(lc.noticeDeadline).toBeNull();
    expect(lc.unable).toContain("initial term end");
    expect(UNABLE).toMatch(/Unable to calculate/);
  });
  it("ignores unreviewed terms and reports statuses", () => {
    const lc = computeLifecycle(doc(), [term("initial_term", "12 months", { status: "needs_review" })], "2025-03-01");
    expect(lc.initialTermEnd).toBeNull();
    expect(computeLifecycle(doc({ review_status: "superseded" }), [], "2025-03-01").status).toBe("Superseded");
    expect(computeLifecycle(doc({ execution_status: "needs_review" }), [], "2025-03-01").status).toBe("Awaiting Signature Confirmation");
    expect(computeLifecycle(doc({ expiration_date: "2025-02-01" }), [term("auto_renewal", "No")], "2025-03-01").status).toBe("Expired");
  });
  it("issues one renewal reminder at the tightest interval", () => {
    const lc = computeLifecycle(doc(), [term("initial_term", "12 months"), term("auto_renewal", "yes"), term("renewal_period", "12 months")], "2025-12-05");
    expect(renewalReminder(lc, "2025-12-05")).toEqual({ daysLeft: 27, bucket: 30 });
  });
});

describe("Effective-dated pricing", () => {
  const rows = [
    { id: "old", service_key: "fa", offering_id: null, effective_date: "2024-01-01", contracted_cents: 750000, pricing_source: "contract", source_document_id: "sow1", superseded_at: "2025-01-01" },
    { id: "new", service_key: "fa", offering_id: null, effective_date: "2025-01-01", contracted_cents: 850000, pricing_source: "contract", source_document_id: "amd1", superseded_at: null },
  ];
  it("keeps historical prices for dates before an amendment (superseded history)", () => {
    const h = resolveContractPrice(rows, { serviceKey: "fa", offeringId: null, onDate: "2024-06-01" });
    expect(h.status === "resolved" && h.row.contracted_cents).toBe(750000);
    const n = resolveContractPrice(rows, { serviceKey: "fa", offeringId: null, onDate: "2025-06-01" });
    expect(n.status === "resolved" && n.row.contracted_cents).toBe(850000);
  });
  it("refuses to choose between equally applicable prices", () => {
    const tie = [...rows, { ...rows[1]!, id: "x", source_document_id: "other", contracted_cents: 900000 }];
    expect(resolveContractPrice(tie, { serviceKey: "fa", offeringId: null, onDate: "2025-06-01" }).status).toBe("conflict");
  });
  it("prefers fund-specific pricing for that fund only", () => {
    const f = [...rows, { ...rows[1]!, id: "f", offering_id: "f1", contracted_cents: 500000 }];
    const r = resolveContractPrice(f, { serviceKey: "fa", offeringId: "f1", onDate: "2025-06-01" });
    expect(r.status === "resolved" && r.row.id).toBe("f");
    const o = resolveContractPrice(f, { serviceKey: "fa", offeringId: "f2", onDate: "2025-06-01" });
    expect(o.status === "resolved" && o.row.id).toBe("new");
  });
});

describe("Harmonious Standard Agreement", () => {
  const sections = [{ section_no: "1", title: "Parties", body: "This Agreement is between Harmonious and {{client_legal_name}}, effective {{effective_date}}. {{secret}}", sort_order: 1 }];
  it("fills only allowed fields and keeps the approved language verbatim", () => {
    const r = renderStandardAgreement(sections, { client_legal_name: "Acme LLC", effective_date: "2026-01-01", services: "Fund Administration" });
    expect(r.sections[0]!.body).toBe("This Agreement is between Harmonious and Acme LLC, effective 2026-01-01. {{secret}}");
    expect(r.unknownPlaceholders).toEqual(["secret"]);
    expect(r.missing).toEqual([]);
  });
  it("uses the exact approved template version and blocks unapproved ones", () => {
    const draft = { msa_version_id: "v1", standard_status: "approved_to_send", standard_prepared_by: "a", standard_reviewed_by: "b" };
    expect(standardSendBlockers({ id: "v1", status: "published" }, draft, [])).toEqual([]);
    expect(standardSendBlockers({ id: "v1", status: "draft" }, draft, []).join(" ")).toMatch(/published/);
    expect(standardSendBlockers({ id: "v2", status: "published" }, draft, []).join(" ")).toMatch(/pinned/);
  });
  it("requires a different reviewer and a reviewed preview", () => {
    expect(standardSendBlockers({ id: "v1", status: "published" }, { msa_version_id: "v1", standard_status: "draft", standard_prepared_by: "a", standard_reviewed_by: null }, []).length).toBeGreaterThan(0);
    expect(standardSendBlockers({ id: "v1", status: "published" }, { msa_version_id: "v1", standard_status: "approved_to_send", standard_prepared_by: "a", standard_reviewed_by: "a" }, []).join(" ")).toMatch(/different person/);
  });
});

describe("Granular contract permissions", () => {
  it("ordinary Operations can upload and review but not approve", () => {
    const caps = contractCapabilitiesFor(["operations"]);
    expect(caps).toContain("upload_contracts");
    expect(mayApproveTerms(caps)).toBe(false);
    expect(caps).not.toContain("confirm_execution");
  });
  it("Fund Managers get nothing, even with a stray grant", () => {
    expect(contractCapabilitiesFor(["fund_manager"], ["approve_terms"])).toEqual([]);
    expect(contractCapabilitiesFor(["investor"])).toEqual([]);
  });
  it("explicit grants extend staff; legal approves; finance configures pricing", () => {
    expect(mayApproveTerms(contractCapabilitiesFor(["operations"], ["approve_terms"]))).toBe(true);
    expect(mayApproveTerms(contractCapabilitiesFor(["legal"]))).toBe(true);
    expect(contractCapabilitiesFor(["finance"])).toContain("configure_pricing");
    expect(mayApproveTerms(contractCapabilitiesFor(["client_success"]))).toBe(false);
    expect(contractCapabilitiesFor(["super_admin"])).toHaveLength(11);
  });
});

describe("AI extraction cannot activate terms", () => {
  it("extracted terms start unreviewed and produce no pricing without approval", () => {
    const terms = normalizeExtraction({ terms: [{ key: "annual_fee", value: "$5,000", basis: "explicit", confidence: 0.99 }] });
    expect(terms.every((t) => t.status === "needs_review")).toBe(true);
    const plan = planPricingApplication(
      { id: "d", client_id: "c", doc_type: "msa", review_status: "awaiting_review", execution_status: "executed_confirmed", precedence_status: "confirmed", applies_to_offering_ids: [], effective_date: "2025-01-01" },
      terms.map((t, i) => ({ id: String(i), term_key: t.key, material: t.material, status: t.status, current_value: t.value, amount_cents: 500000, service_key: "fa" })),
    );
    expect(plan.rows).toHaveLength(0);
  });
});
