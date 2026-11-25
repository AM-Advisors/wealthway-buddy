import { describe, expect, it } from "vitest";
import { FUND_WORK_SOURCES, groupFor, normalizeFundWork, sourcesFor } from "./fund-work-model";

describe("fund open items", () => {
  it("covers every fund work table", () => {
    const tables = FUND_WORK_SOURCES.map((s) => s.table).sort();
    expect(tables).toEqual([
      "client_fund_intakes", "document_signature_signers", "fund_close_filings", "fund_close_requests", "fund_fee_terms",
      "fund_file_signatures", "fund_franchise_fees", "fund_migration_requests", "fund_reopen_requests", "fund_requests",
      "fund_service_requests", "fund_state_filings", "fund_w9_signature_requests", "investment_readiness_tasks",
      "locked_edit_requests", "offering_bank_setup_requests", "offering_document_change_requests", "pricing_approval_requests",
      "side_letter_change_requests", "ss4_signature_requests", "staff_tasks", "wire_requests",
    ]);
  });
  it("hides staff tasks, migration and pricing from fund managers", () => {
    expect(sourcesFor(false).map((s) => s.key)).not.toContain("staff_tasks");
    expect(normalizeFundWork("staff_tasks", [{ id: "t", side: "harmonious", at: "2026-01-01" }], false)).toEqual([]);
    expect(normalizeFundWork("pricing_approvals", [{ id: "p", side: "harmonious", at: "2026-01-01" }], false)).toEqual([]);
    expect(sourcesFor(true)).toHaveLength(22);
  });
  it("counts the same rows by audience", () => {
    const raw = [{ id: "a", side: "manager" as const, at: "x" }, { id: "b", side: "harmonious" as const, at: "x" }, { id: "c", side: "investor" as const, at: "x" }];
    const items = normalizeFundWork("investor_todos", raw, false);
    expect(items.map((i) => groupFor(i, false))).toEqual(["you", "harmonious", "waiting"]);
    expect(items.map((i) => groupFor(i, true))).toEqual(["waiting", "you", "waiting"]);
  });
});
