import { describe, expect, it } from "vitest";

import {
  TERM_CATALOG,
  approvalBlockers,
  canApproveContract,
  contractAlerts,
  effectiveContractPrice,
  einLast4,
  findDuplicateClients,
  normalizeExtraction,
  noticeDeadline,
  parentProblem,
  parseDays,
  parseMoneyCents,
  planPricingApplication,
  readableQuality,
  type DocRow,
  type TermRow,
} from "@/lib/contract-ingestion";
import { RECORD_TABS } from "@/lib/ops-records";

const doc = (o: Partial<DocRow> = {}): DocRow => ({
  id: "d1", client_id: "c1", doc_type: "msa", review_status: "awaiting_review",
  execution_status: "executed_confirmed", precedence_status: "confirmed",
  applies_to_offering_ids: [], effective_date: "2025-01-01", ...o,
});
const term = (o: Partial<TermRow> = {}): TermRow => ({
  id: "t1", term_key: "annual_fee", material: true, status: "confirmed",
  current_value: "$16,000", amount_cents: 1_600_000, service_key: "fund_admin", ...o,
});

describe("new client intake", () => {
  it("Client 360 has Contacts and Contracts tabs gated by the clients area", () => {
    const ids = RECORD_TABS.client.map((t) => t.id);
    expect(ids).toContain("contacts");
    expect(ids).toContain("contracts");
    expect(RECORD_TABS.client.find((t) => t.id === "contracts")!.area).toBe("clients");
  });
  it("detects duplicate clients by name (ignoring suffixes) or email", () => {
    const existing = [{ id: "1", name: "Acme Capital LLC", legal_name: null, primary_contact_email: "a@acme.com" }];
    expect(findDuplicateClients({ name: "Acme Capital" }, existing)).toHaveLength(1);
    expect(findDuplicateClients({ name: "Other", primary_email: "A@acme.com" }, existing)).toHaveLength(1);
    expect(findDuplicateClients({ name: "Beta Partners" }, existing)).toHaveLength(0);
  });
  it("keeps only the last 4 EIN digits and rejects malformed EINs", () => {
    expect(einLast4("12-3456789")).toBe("6789");
    expect(einLast4("123")).toBeNull();
  });
});

describe("extraction safety", () => {
  it("fills every catalog term; missing terms are Not Found with no value", () => {
    const out = normalizeExtraction({ terms: [{ key: "annual_fee", value: "$16,000 per year", basis: "explicit", confidence: 0.95, page: 3, section: "4.1", quote: "$16,000" }] });
    expect(out).toHaveLength(TERM_CATALOG.length);
    const missing = out.find((t) => t.key === "termination_notice")!;
    expect(missing.basis).toBe("not_found");
    expect(missing.value).toBeNull();
    const fee = out.find((t) => t.key === "annual_fee")!;
    expect(fee.amountCents).toBe(1_600_000);
    expect(fee.page).toBe("3");
    expect(fee.section).toBe("4.1");
  });
  it("never trusts a 'found' term without a value, drops unknown keys", () => {
    const out = normalizeExtraction({ terms: [{ key: "setup_fee", value: "  ", basis: "explicit" }, { key: "made_up", value: "x", basis: "explicit" }] });
    expect(out.find((t) => t.key === "setup_fee")!.basis).toBe("not_found");
    expect(out.find((t) => (t as any).key === "made_up")).toBeUndefined();
  });
  it("marks inferred or low-confidence values ambiguous and every term Needs Review", () => {
    const out = normalizeExtraction({ terms: [
      { key: "auto_renewal", value: "Yes", basis: "inferred", confidence: 0.9 },
      { key: "initial_term", value: "1 year", basis: "explicit", confidence: 0.4 },
    ] });
    expect(out.find((t) => t.key === "auto_renewal")!.ambiguous).toBe(true);
    expect(out.find((t) => t.key === "initial_term")!.ambiguous).toBe(true);
    expect(out.every((t) => t.status === "needs_review")).toBe(true);
  });
  it("multiple amounts are ambiguous, not guessed", () => {
    expect(parseMoneyCents("$16,000 first year, $12,000 thereafter")).toBeNull();
    expect(parseMoneyCents("$16,000")).toBe(1_600_000);
    expect(parseDays("sixty (60) days' written notice")).toBe(60);
    expect(parseDays("30 days or 60 days")).toBeNull();
  });
  it("poor text quality requires manual review", () => {
    expect(readableQuality(50)).toBe("poor");
    expect(readableQuality(5000)).toBe("ok");
  });
  it("garbage model output yields nothing found", () => {
    expect(normalizeExtraction("nonsense").every((t) => t.basis === "not_found")).toBe(true);
  });
});

describe("human approval", () => {
  it("AI cannot activate terms: unreviewed material terms block approval", () => {
    const b = approvalBlockers(doc(), [term({ status: "needs_review" })]);
    expect(b.join(" ")).toMatch(/material term/);
  });
  it("execution must be confirmed by a person; precedence must be reviewed", () => {
    expect(approvalBlockers(doc({ execution_status: "needs_review" }), [term()]).join(" ")).toMatch(/fully executed/);
    expect(approvalBlockers(doc({ precedence_status: "requires_review" }), [term()]).join(" ")).toMatch(/Precedence/);
    expect(approvalBlockers(doc(), [term()])).toEqual([]);
  });
  it("only contract-authority roles approve; managers and operations cannot", () => {
    expect(canApproveContract(["legal"])).toBe(true);
    expect(canApproveContract(["fund_manager"])).toBe(false);
    expect(canApproveContract(["investor"])).toBe(false);
    expect(canApproveContract(["operations"])).toBe(false);
  });
  it("nothing applies before approval", () => {
    expect(planPricingApplication(doc(), [term()]).rows).toEqual([]);
  });
});

describe("applying approved terms", () => {
  it("applies the exact contract amount as contract-specific pricing", () => {
    const { rows } = planPricingApplication(doc({ review_status: "approved" }), [term()]);
    expect(rows).toEqual([expect.objectContaining({ contracted_cents: 1_600_000, pricing_source: "contract", offering_id: null, source_term_id: "t1" })]);
  });
  it("skips unreviewed, unmapped or inexact pricing instead of guessing", () => {
    const { rows, skipped } = planPricingApplication(doc({ review_status: "approved" }), [
      term({ id: "a", status: "needs_review" }),
      term({ id: "b", service_key: null }),
      term({ id: "c", amount_cents: null }),
    ]);
    expect(rows).toHaveLength(0);
    expect(skipped.map((s) => s.reason)).toEqual(["Not reviewed", "No service mapped", "No exact amount"]);
  });
  it("a Fund-specific SOW does not affect another Fund", () => {
    const { rows } = planPricingApplication(doc({ review_status: "approved", doc_type: "sow", applies_to_offering_ids: ["fund1"] }), [term()]);
    expect(effectiveContractPrice(rows, "fund_admin", "fund1", "2025-06-01")?.contracted_cents).toBe(1_600_000);
    expect(effectiveContractPrice(rows, "fund_admin", "fund2", "2025-06-01")).toBeNull();
  });
  it("standard pricing never overrides client contract pricing", () => {
    const rows = [
      { service_key: "fund_admin", offering_id: null, effective_date: "2025-01-01", pricing_source: "contract", contracted_cents: 1_600_000 },
      { service_key: "fund_admin", offering_id: null, effective_date: "2026-01-01", pricing_source: "standard", contracted_cents: 2_000_000 },
    ];
    expect(effectiveContractPrice(rows, "fund_admin", null, "2026-06-01")?.contracted_cents).toBe(1_600_000);
  });
  it("amendments preserve history: the earlier price still applies to earlier dates", () => {
    const rows = [
      { service_key: "fund_admin", offering_id: null, effective_date: "2025-01-01", pricing_source: "contract", contracted_cents: 1_600_000 },
      { service_key: "fund_admin", offering_id: null, effective_date: "2026-01-01", pricing_source: "contract", contracted_cents: 1_800_000 },
    ];
    expect(effectiveContractPrice(rows, "fund_admin", null, "2025-06-01")?.contracted_cents).toBe(1_600_000);
    expect(effectiveContractPrice(rows, "fund_admin", null, "2026-06-01")?.contracted_cents).toBe(1_800_000);
  });
});

describe("isolation, deadlines and tasks", () => {
  it("an amendment cannot point at another client's agreement", () => {
    expect(parentProblem({ id: "x", client_id: "other" }, "c1")).toMatch(/different client/);
    expect(parentProblem(null, "c1")).toMatch(/doesn't exist/);
    expect(parentProblem({ id: "x", client_id: "c1" }, "c1")).toBeNull();
  });
  it("computes the notice deadline and raises one alert per kind", () => {
    expect(noticeDeadline("2026-12-31", 60)).toBe("2026-11-01");
    const alerts = contractAlerts({ ...doc({ review_status: "approved" }), expiration_date: "2026-12-31", notice_days: 60, title: "MSA" }, "2026-10-20");
    expect(alerts.map((a) => a.kind).sort()).toEqual(["notice_deadline"]);
    const pending = contractAlerts({ ...doc({ execution_status: "needs_review" }), expiration_date: null, notice_days: null, title: "MSA" }, "2026-01-01");
    expect(pending.map((a) => a.kind).sort()).toEqual(["awaiting_review", "missing_execution"]);
  });
});
