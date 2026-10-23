import { describe, expect, it } from "vitest";

import {
  detectExceptions,
  mappedBalances,
  nextStage,
  openingBalanceChecks,
  REQUIRED_SOURCE_ARTIFACTS,
  resolutionError,
  validateMapping,
  type MigrationState,
} from "@/lib/fund-migration-model";
import {
  FUND_COMMITMENTS,
  HARMONIOUS_CHART,
  INITIAL_MAPPING,
  SOURCE_TRIAL_BALANCE,
  WALKTHROUGH_INVESTORS,
  walkthroughOpeningPackage,
} from "@/lib/reference-fund/walkthrough-source";

/** Permanent regression scenario: Harmonious takes over the (DEMO) Walkthrough fund's books. */

const PREPARER = "demo-preparer";
const REVIEWER = "demo-reviewer";
const fixedMapping = { ...INITIAL_MAPPING, "1010": "H-1000" };

describe("Walkthrough reference fund - synthetic investors", () => {
  it("has 13 synthetic investors whose commitments total exactly $25,000,000", () => {
    expect(WALKTHROUGH_INVESTORS).toHaveLength(13);
    expect(WALKTHROUGH_INVESTORS.reduce((s, i) => s + i.commitment, 0) * 100).toBe(FUND_COMMITMENTS);
    expect(new Set(WALKTHROUGH_INVESTORS.map((i) => i.cls))).toEqual(new Set(["A", "B"]));
  });
});

describe("Account mapping", () => {
  it("accepts 1:1 and many-to-one mappings and an authorized new Harmonious account", () => {
    const r = validateMapping(SOURCE_TRIAL_BALANCE, HARMONIOUS_CHART, fixedMapping);
    expect(r.blocking).toEqual([]);
    expect(r.manyToOne["H-1000"]).toEqual(["1000", "1010"]);
    expect(r.manyToOne["H-1200"]).toEqual(["1200", "1210"]);
    expect(mappedBalances(SOURCE_TRIAL_BALANCE, fixedMapping)["H-5150"]).toBe(200_000_00);
  });

  it("blocks on the deliberately unmapped account", () => {
    const r = validateMapping(SOURCE_TRIAL_BALANCE, HARMONIOUS_CHART, INITIAL_MAPPING);
    expect(r.blocking.map((i) => [i.sourceCode, i.kind])).toEqual([["1010", "unmapped"]]);
  });

  it("blocks invalid mappings: wrong type, unknown target, plug account, unauthorized new account", () => {
    const chart = [...HARMONIOUS_CHART, { code: "H-5160", name: "Unapproved", type: "expense" as const, authorizedBy: null }];
    const r = validateMapping(SOURCE_TRIAL_BALANCE, chart, { ...fixedMapping, "5000": "H-1000", "2000": "H-7777", "1210": "H-9999", "5100": "H-5160" });
    expect(r.blocking.map((i) => i.kind).sort()).toEqual(["plug_target", "type_mismatch", "unauthorized_new_account", "unknown_target"]);
  });
});

describe("Opening balances", () => {
  it("clean package ties every check with no plug account", () => {
    const checks = openingBalanceChecks(walkthroughOpeningPackage({ withDiscrepancies: false }));
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(checks.map((c) => c.key)).toEqual(["tb_balances", "cash_reconciles", "investments_reconcile", "investor_capital_reconciles", "commitments_reconcile", "nav_reconstructs"]);
    expect(Object.keys(mappedBalances(SOURCE_TRIAL_BALANCE, fixedMapping))).not.toContain("H-9999");
  });

  it("catches each deliberate discrepancy and resolves none of them silently", () => {
    const pkg = walkthroughOpeningPackage({ withDiscrepancies: true });
    const mapping = validateMapping(SOURCE_TRIAL_BALANCE, HARMONIOUS_CHART, INITIAL_MAPPING);
    const ex = detectExceptions(pkg, mapping.issues, PREPARER);
    const kinds = new Set(ex.map((e) => e.kind));
    for (const k of ["unmapped_account", "capital_difference", "bank_outstanding_item", "missing_valuation_evidence", "commitment_mismatch", "missing_tax_document"]) expect(kinds).toContain(k);
    expect(ex.find((e) => e.kind === "capital_difference")?.detail).toMatch(/Kestrel.*10000 cents/);
    expect(ex.every((e) => !e.resolution)).toBe(true);
  });
});

describe("Exception resolution", () => {
  const ex = detectExceptions(walkthroughOpeningPackage({ withDiscrepancies: true }), validateMapping(SOURCE_TRIAL_BALANCE, HARMONIOUS_CHART, INITIAL_MAPPING).issues, PREPARER);
  it("requires a different person and a real explanation", () => {
    const e = ex[0]!;
    expect(resolutionError(e, { by: PREPARER, outcome: "corrected", note: "Mapped 1010 to cash." })).toMatch(/someone other/);
    expect(resolutionError(e, { by: REVIEWER, outcome: "corrected", note: "ok" })).toMatch(/at least 10/);
    expect(resolutionError(e, { by: REVIEWER, outcome: "corrected", note: "Mapped 1010 money market to H-1000 cash." })).toBeNull();
  });
  it("never accepts a structural difference; non-structural items may be accepted with evidence", () => {
    const capital = ex.find((e) => e.kind === "capital_difference")!;
    expect(resolutionError(capital, { by: REVIEWER, outcome: "accepted", note: "Immaterial, accept as is." })).toMatch(/cannot be accepted/);
    const bank = ex.find((e) => e.kind === "bank_outstanding_item")!;
    expect(resolutionError(bank, { by: REVIEWER, outcome: "accepted", note: "Check 1042 cleared 2026-01-04 per statement." })).toBeNull();
  });
});

describe("Migration workflow stages", () => {
  const artifacts = Object.fromEntries(REQUIRED_SOURCE_ARTIFACTS.map((a) => [a, { label: `DEMO / SYNTHETIC ${a}` }]));
  const base: MigrationState = { stage: "source_documents_received", artifacts, extracted: true, mappingBlocking: 0, openingChecksFailing: 0, openExceptions: 0, approvals: [], preparedBy: PREPARER };

  it("cannot leave source receipt with a missing artifact", () => {
    const { valuation_support: _omit, ...partial } = artifacts as any;
    expect(nextStage({ ...base, artifacts: partial }).blockers.join(" ")).toMatch(/valuation support/);
  });

  it("cannot proceed with unresolved material mappings, failing checks or open exceptions", () => {
    expect(nextStage({ ...base, stage: "mapping_review", mappingBlocking: 1 }).to).toBeNull();
    expect(nextStage({ ...base, stage: "opening_balance_review", openingChecksFailing: 2 }).to).toBeNull();
    expect(nextStage({ ...base, stage: "exceptions", openExceptions: 6 }).to).toBeNull();
  });

  it("needs an independent approver and stops at Approved for parallel - never Production", () => {
    expect(nextStage({ ...base, stage: "ready_for_approval", approvals: [{ userId: PREPARER }] }).to).toBeNull();
    expect(nextStage({ ...base, stage: "ready_for_approval", approvals: [{ userId: REVIEWER }] }).to).toBe("approved_for_parallel");
    expect(nextStage({ ...base, stage: "approved_for_parallel" }).to).toBeNull();
  });

  it("walks the full chain on the corrected Walkthrough package", () => {
    const pkg = walkthroughOpeningPackage({ withDiscrepancies: false });
    let s: MigrationState = { ...base };
    const visited = [s.stage];
    s = { ...s, mappingBlocking: validateMapping(SOURCE_TRIAL_BALANCE, HARMONIOUS_CHART, fixedMapping).blocking.length, openingChecksFailing: openingBalanceChecks(pkg).filter((c) => !c.ok).length, openExceptions: 0, approvals: [{ userId: REVIEWER }] };
    for (let i = 0; i < 10; i++) {
      const n = nextStage(s);
      if (!n.to) break;
      s = { ...s, stage: n.to };
      visited.push(n.to);
    }
    expect(visited).toEqual(["source_documents_received", "data_extraction", "mapping_review", "opening_balance_review", "exceptions", "ready_for_approval", "approved_for_parallel"]);
  });
});
