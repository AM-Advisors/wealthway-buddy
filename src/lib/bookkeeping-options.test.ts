import { describe, expect, it } from "vitest";
import { bookkeepingObligations, coverageConflicts, fundAccountingCoverage, optionAvailableFor, responsibilityRows, visibleCapabilities, type CoverageRow } from "@/lib/bookkeeping-options";

const days = { review: null, close: { monthly: 20, quarterly: 20, annual: null } };
const window = { from: "2026-01-01", to: "2026-12-31" };

describe("bookkeeping obligations", () => {
  it("Self-Service creates no Harmonious work", () => {
    expect(bookkeepingObligations({ option: "self_service", frequency: null }, window, days)).toEqual([]);
  });
  it("Review creates one review per agreed period", () => {
    expect(bookkeepingObligations({ option: "review", frequency: "quarterly" }, window, days).map((o) => o.periodEnd)).toEqual(["2026-03-31", "2026-06-30", "2026-09-30", "2026-12-31"]);
    expect(bookkeepingObligations({ option: "review", frequency: "annual" }, window, days)).toHaveLength(1);
  });
  it("Managed closes monthly by default, 20 business days after period end", () => {
    const o = bookkeepingObligations({ option: "managed", frequency: null }, window, days);
    expect(o).toHaveLength(12);
    expect(o[0]).toMatchObject({ kind: "close", periodEnd: "2026-01-31", dueOn: "2026-02-27" });
  });
});

describe("responsibilities and capabilities", () => {
  it("Self-Service: the client does everything and Harmonious does not review or correct", () => {
    const rows = responsibilityRows("self_service");
    expect(rows.filter((r) => r.owner === "harmonious")).toEqual([]);
    expect(rows.find((r) => r.activity === "review")?.owner).toBe("not_included");
  });
  it("Managed: Harmonious categorizes, reconciles and closes", () => {
    const rows = responsibilityRows("managed");
    for (const a of ["categorize", "reconcile", "close"]) expect(rows.find((r) => r.activity === a)?.owner).toBe("harmonious");
  });
  it("missing capabilities are never shown, fund-only tools only for funds", () => {
    expect(visibleCapabilities("review", { entityType: "fund", offeringId: "x" }).map((c) => c.key)).toContain("outstanding_items_report");
    expect(visibleCapabilities("review", { entityType: "management_company" }).map((c) => c.key)).not.toContain("outstanding_items_report");
    expect(visibleCapabilities("self_service", { entityType: "management_company" })).toEqual([]);
    expect(optionAvailableFor("self_service", { entityType: "management_company" }).available).toBe(false);
    expect(optionAvailableFor("managed", { entityType: "management_company" }).available).toBe(true);
  });
});

describe("duplicate coverage", () => {
  const admin: CoverageRow = { source: "administration", label: "Fund admin", scope: ["tools", "categorize", "journal_entries", "reconcile", "close", "reports", "review", "corrections"], start: "2025-01-01", end: null };
  it("blocks when another bookkeeping engagement covers the same entity and period", () => {
    const r = coverageConflicts({ option: "review", effectiveOn: "2026-01-01", termMonths: 12 }, [{ source: "bookkeeping", label: "Existing", scope: ["review"], start: "2025-06-01", end: "2026-05-31" }]);
    expect(r.blocked).toBe(true);
  });
  it("does not block when the existing engagement ends before the new period", () => {
    const r = coverageConflicts({ option: "review", effectiveOn: "2026-01-01", termMonths: 12 }, [{ source: "bookkeeping", label: "Old", scope: ["review"], start: "2024-01-01", end: "2025-12-31" }]);
    expect(r.blocked).toBe(false);
  });
  it("blocks Managed when the administration agreement already covers everything", () => {
    expect(coverageConflicts({ option: "managed", effectiveOn: "2026-01-01", termMonths: 12 }, [admin]).blocked).toBe(true);
  });
  it("partial overlap must be excluded before quoting", () => {
    const partial: CoverageRow = { ...admin, scope: ["tools", "reconcile"] };
    const r = coverageConflicts({ option: "managed", effectiveOn: "2026-01-01", termMonths: 12 }, [partial]);
    expect(r.blocked).toBe(false);
    expect(r.unresolved).toEqual(["reconcile"]);
    expect(coverageConflicts({ option: "managed", effectiveOn: "2026-01-01", termMonths: 12, excluded: ["reconcile"] }, [partial]).unresolved).toEqual([]);
  });
});

describe("fund accounting", () => {
  it("reads coverage from administration features", () => {
    const s = fundAccountingCoverage(["QUARTERLY_NAV", "MANAGEMENT_FEE_CALC"]);
    expect(s.find((x) => x.key === "nav")?.included).toBe(true);
    expect(s.find((x) => x.key === "performance_allocations")?.included).toBe(false);
  });
});
