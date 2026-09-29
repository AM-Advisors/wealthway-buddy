import { describe, expect, it } from "vitest";
import {
  buildImpactReport, consolidationBlockers, detectConflicts, duplicateInvestments, factualSummary, FUND_NAME_UNIQUENESS_SCOPE,
  historicalNameCollision, keepSeparateComplete, legalNameRequired, pairKey, resolveAlias, type FundSnapshot, type ReviewState,
} from "./fund-duplicate-resolution";
import { findFundMatches, fundCreationBlocker, normalizeFundName } from "./fund-integrity";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

function snap(id: string, over: Partial<FundSnapshot> = {}): FundSnapshot {
  return {
    id, name: "Harmonious Growth Fund II", legalName: null, clientId: null, clientName: null, fundType: null, createdAt: null, createdBy: null, status: "closed",
    entity: { entityType: null, jurisdiction: null, dateFormed: null, einOnFile: false, einLetterOnFile: false, formationStep: null },
    investors: { persons: 0, investments: 0, active: 0, removed: 0, funded: 0, closed: 0 },
    capital: { subscribedCents: 0, reconciledFundedCents: 0 },
    documents: { offeringDocuments: 0, versions: 0, executed: 0, historical: 0 },
    banking: { exists: false, currentVersion: null, verification: null },
    operations: { readinessRecords: 0, workItems: 0, regulatoryConfig: false, formD: null, blueSky: null, taxClassification: null },
    external: { driveFolders: 0, eSignReferences: 0, providerReferences: 0, integrationEvents: 0 },
    managers: [], economicsVersions: 0, investments: [], dependencies: [], ...over,
  };
}
const noFacts = { einDiffers: false, bankingDiffers: false };
const review = (over: Partial<ReviewState> = {}): ReviewState => ({ status: "consolidation_pending", decision: "same_fund", canonicalId: A, duplicateId: B, acknowledged: [], fundIds: [A, B], ...over });
const ok = { canonicalId: A, duplicateId: B, confirmed: true, reason: "Same entity, verified" };

describe("duplicate comparison", () => {
  it("exact duplicate pair has no conflicts when facts agree", () => {
    expect(detectConflicts(snap(A), snap(B), noFacts)).toEqual([]);
  });
  it("factual summary never names a pick", () => {
    const s = factualSummary(snap(A, { investors: { persons: 14, investments: 14, active: 14, removed: 0, funded: 0, closed: 0 }, banking: { exists: true, currentVersion: 1, verification: "pending" } }), "Record A");
    expect(s).toBe("Record A contains 14 Investments, banking, no executed documents.");
    expect(s).not.toMatch(/canonical|recommend/i);
  });
  it("pair key is order independent", () => expect(pairKey([B, A])).toBe(pairKey([A, B])));
});

describe("canonical selection", () => {
  it("no automatic canonical selection", () => {
    expect(consolidationBlockers(review({ canonicalId: null }), buildImpactReport(snap(A), snap(B), noFacts), ok)).toContain("Harmonious must explicitly select the Canonical Fund.");
  });
  it("explicit selection with no conflicts is allowed", () => {
    expect(consolidationBlockers(review(), buildImpactReport(snap(A), snap(B), noFacts), ok)).toEqual([]);
  });
  it("requires confirm + reason", () => {
    const r = consolidationBlockers(review(), buildImpactReport(snap(A), snap(B), noFacts), { ...ok, confirmed: false, reason: "" });
    expect(r).toContain("Confirm Consolidation must be ticked.");
    expect(r).toContain("A reason is required.");
  });
  it("rejects a canonical that differs from the recorded decision", () => {
    expect(consolidationBlockers(review(), buildImpactReport(snap(B), snap(A), noFacts), { ...ok, canonicalId: B, duplicateId: A })).toContain("Selected Canonical Fund does not match the recorded decision.");
  });
  it("needs a Same Fund decision", () => {
    expect(consolidationBlockers(review({ decision: "needs_review" }), null, ok).length).toBeGreaterThan(0);
  });
  it("concurrent resolution: already consolidated is blocked", () => {
    expect(consolidationBlockers(review({ status: "consolidated" }), buildImpactReport(snap(A), snap(B), noFacts), ok)).toContain("This pair has already been consolidated.");
  });
});

describe("different funds", () => {
  it("keep separate requires a unique name", () => {
    expect(keepSeparateComplete({ name: "Chapter 1" }, { name: "chapter-1" })).toBe(false);
    expect(keepSeparateComplete({ name: "Chapter 1" }, { name: "Chapter 1 (Series B)" })).toBe(true);
  });
});

describe("impact report", () => {
  const dup = snap(B, {
    dependencies: [
      { table: "investor_onboardings", column: "offering_id", count: 3, preserved: false },
      { table: "offering_documents", column: "offering_id", count: 2, preserved: false },
      { table: "offering_name_history", column: "offering_id", count: 1, preserved: true },
    ],
    investments: [
      { onboardingId: "i1", personId: "p1", profileId: "f1", stage: "funded", removed: false },
      { onboardingId: "i2", personId: "p2", profileId: "f2", stage: "closed", removed: false },
      { onboardingId: "i3", personId: "p3", profileId: "f3", stage: "invited", removed: false },
    ],
  });
  const r = buildImpactReport(snap(A), dup, noFacts);
  it("reassociates investments with exact counts", () => {
    expect(r.move).toContainEqual({ table: "investor_onboardings", column: "offering_id", count: 3 });
    expect(r.totals.move).toBe(5);
  });
  it("preserves history with original id", () => expect(r.preserve).toEqual([{ table: "offering_name_history", column: "offering_id", count: 1 }]));
  it("document rows are moved, not recreated or deleted", () => expect(r.move.find((m) => m.table === "offering_documents")?.count).toBe(2));
  it("funded/closed investments are counted as protected", () => expect(r.protectedInvestments).toBe(2));
  it("keeps canonical id", () => expect(r.keep.canonicalId).toBe(A));
});

describe("conflicts", () => {
  it("same person in both funds is a blocking conflict, not assumed duplicate", () => {
    const inv = [{ onboardingId: "x", personId: "p", profileId: "f", stage: "invited", removed: false }];
    const a = snap(A, { investments: inv });
    const b = snap(B, { investments: [{ ...inv[0]!, onboardingId: "y" }] });
    expect(duplicateInvestments(a, b)).toEqual([{ a: "x", b: "y" }]);
    expect(detectConflicts(a, b, noFacts).find((c) => c.kind === "duplicate_investment")?.blocking).toBe(true);
  });
  it("banking on both is blocking", () => {
    const bank = { exists: true, currentVersion: 1, verification: "pending_verification" };
    const c = detectConflicts(snap(A, { banking: bank }), snap(B, { banking: bank }), { einDiffers: false, bankingDiffers: true });
    expect(c.find((x) => x.kind === "banking")).toMatchObject({ blocking: true, detail: "Current banking instructions differ." });
  });
  it("banking on one side only is not a conflict", () => {
    expect(detectConflicts(snap(A, { banking: { exists: true, currentVersion: 1, verification: "x" } }), snap(B), noFacts)).toEqual([]);
  });
  it("drive on both opens Drive Consolidation Review", () => {
    const e = { driveFolders: 1, eSignReferences: 0, providerReferences: 0, integrationEvents: 0 };
    expect(detectConflicts(snap(A, { external: e }), snap(B, { external: e }), noFacts).find((c) => c.kind === "drive")?.label).toBe("Drive Consolidation Review");
  });
  it("different legal names must be acknowledged", () => {
    const rpt = buildImpactReport(snap(A, { legalName: "X LLC" }), snap(B, { legalName: "Y LLC" }), noFacts);
    expect(consolidationBlockers(review(), rpt, ok).some((b) => b.includes("Different Legal Names"))).toBe(true);
    expect(consolidationBlockers(review({ acknowledged: ["legal_name"] }), rpt, ok)).toEqual([]);
  });
  it("different EINs cannot be acknowledged away", () => {
    const rpt = buildImpactReport(snap(A), snap(B), { einDiffers: true, bankingDiffers: false });
    expect(consolidationBlockers(review({ acknowledged: ["ein"] }), rpt, ok).length).toBe(1);
  });
});

describe("alias / redirect", () => {
  it("follows chains and stops on cycles", () => {
    expect(resolveAlias("old", new Map([["old", "mid"], ["mid", "new"]]))).toBe("new");
    expect(resolveAlias("a", new Map([["a", "b"], ["b", "a"]]))).toBe("b");
    expect(resolveAlias("live", new Map())).toBe("live");
  });
});

describe("legal name gates", () => {
  it("draft fund needs no legal name; entity actions do", () => {
    expect(legalNameRequired("investor_signing", "")).toBe("Legal Name Required before investor signing.");
    expect(legalNameRequired("banking_verification", "Fund LP")).toBeNull();
  });
});

describe("name detection", () => {
  const funds = [{ id: A, name: "ABC Fund II", legalName: null }, { id: B, name: "Chapter 1", legalName: null }];
  it("Fund II vs Fund III remain different", () => {
    expect(normalizeFundName("ABC Fund II")).not.toBe(normalizeFundName("ABC Fund III"));
    expect(fundCreationBlocker(findFundMatches({ name: "ABC Fund III" }, funds))).toBeNull();
  });
  it("Chapter 1 vs Chapter 11 remain different", () => {
    expect(fundCreationBlocker(findFundMatches({ name: "Chapter 11" }, funds))).toBeNull();
  });
  it("exact normalized identity blocks", () => {
    expect(fundCreationBlocker(findFundMatches({ name: "abc  fund-ii" }, funds))).toMatch(/already exists/);
  });
  it("historical name collision is detected", () => {
    const h = [{ offeringId: A, previousName: "Old Name Fund" }];
    expect(historicalNameCollision("old name fund", h)?.offeringId).toBe(A);
    expect(historicalNameCollision("old name fund", h, A)).toBeNull();
    expect(historicalNameCollision("Old Name Fund II", h)).toBeNull();
  });
  it("uniqueness scope stays global", () => expect(FUND_NAME_UNIQUENESS_SCOPE).toBe("global"));
});
