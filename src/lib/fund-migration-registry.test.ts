import { describe, expect, it } from "vitest";
import inventory from "@/lib/fund-migration-inventory.json";
import { allowedDecisions, buildRow, latestByKey, metrics, sortQueue, type Decision, type FundFacts, type InventoryEntry } from "@/lib/fund-migration-registry";

const E = inventory as InventoryEntry[];
const entry = (o: Partial<InventoryEntry> = {}): InventoryEntry => ({ key: "k", name: "X SPV", classification: "matched", matchedName: "X SPV", hasTaxFolder: false, fileCount: 0, parent: null, isTest: false, sources: [], ...o });
const facts: FundFacts = { offeringId: "o1", legalName: "X SPV LLC", investorCount: 3, managerCount: 1, formationDocs: 1, signingTemplates: 1 };
const dec = (decision: Decision["decision"], at = "2026-10-13T00:00:00Z"): Decision => ({ registry_key: "k", decision, offering_id: null, parent_key: null, reason: "r", actor_user_id: "u", created_at: at });

describe("fund migration registry", () => {
  it("reproduces the approved inventory counts", () => {
    const rows = E.map((e) => buildRow(e, null, null));
    const m = metrics(rows, 1);
    expect(m).toMatchObject({ total: 219, matched: 8, missing: 114, missingWithTax: 36, archived: 72, duplicates: 5, review: 20 });
  });
  it("gives no credit for folder names: unapproved match scores 0", () => {
    expect(buildRow(entry(), null, facts).score).toBe(0);
  });
  it("scores only verified facts after staff approve the match; K-1 and Didit stay blocked", () => {
    const r = buildRow(entry(), dec("approve_match"), facts);
    expect(r.score).toBe(71);
    expect(r.dims.k1.status).toBe("blocked");
    expect(r.dims.didit.status).toBe("blocked");
  });
  it("rejecting a match moves the record to missing", () => {
    expect(buildRow(entry(), dec("reject_match"), facts).status).toBe("missing");
  });
  it("latest decision wins regardless of input order", () => {
    const l = latestByKey([dec("needs_review", "2026-10-14T00:00:00Z"), dec("approve_match", "2026-10-13T00:00:00Z")]);
    expect(l.get("k")!.decision).toBe("needs_review");
  });
  it("offers no destructive or merge decision", () => {
    for (const s of ["matched", "missing", "archived", "duplicate", "review", "not_a_fund"] as const) {
      expect(allowedDecisions(s).join()).not.toMatch(/merge|delete|create/);
    }
  });
  it("puts test funds last and real tax-folder funds ahead of other missing funds", () => {
    const q = sortQueue([
      buildRow(entry({ key: "t", isTest: true }), null, null),
      buildRow(entry({ key: "a", classification: "missing", matchedName: null }), null, null),
      buildRow(entry({ key: "b", classification: "missing", matchedName: null, hasTaxFolder: true }), null, null),
    ]);
    expect(q.map((r) => r.key)).toEqual(["b", "a", "t"]);
  });
  it("keeps the Onboarding Walkthrough test fund flagged as test", () => {
    expect(E.find((e) => e.name === "Onboarding Walkthrough Fund I")?.isTest).toBe(true);
  });
});
