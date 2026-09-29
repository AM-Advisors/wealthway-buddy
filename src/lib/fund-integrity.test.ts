import { describe, expect, it } from "vitest";
import {
  actionsFor, classifyFolder, duplicateFundIdFromError, findFundMatches, fundCreationBlocker, normalizeFundName,
  parseInvestorFolderName, queueKindFor, summarize, syncItemKey, syncProtected, type CanonicalInvestment,
} from "@/lib/fund-integrity";

const funds = [
  { id: "a", name: "Example Ventures Fund I", legalName: "Example Ventures Fund I, LP" },
  { id: "b", name: "Chapter 1, a series of Storybook Ventures", legalName: null },
];
const inv = (o: Partial<CanonicalInvestment>): CanonicalInvestment => ({
  onboardingId: "o1", profileId: "p1", personId: "per1", profileName: "Jane Doe", profileType: "individual", personName: "Jane Doe", stage: "documents", removed: false, ...o,
});

describe("fund name uniqueness", () => {
  it("normalizes case, spacing and punctuation", () => {
    for (const v of ["Example Ventures Fund I", "example ventures fund i", "  EXAMPLE   VENTURES FUND I ", "Example-Ventures Fund, I"]) {
      expect(normalizeFundName(v)).toBe("example ventures fund i");
    }
  });
  it("blocks the same name in any casing and offers the existing Fund", () => {
    const m = findFundMatches({ name: "EXAMPLE VENTURES FUND I" }, funds);
    expect(m[0]).toMatchObject({ id: "a", kind: "same_name" });
    expect(fundCreationBlocker(m)).toMatch(/already exists/);
  });
  it("blocks a Legal Name that belongs to another Fund", () => {
    const m = findFundMatches({ name: "New Name", legalName: "example ventures fund i lp" }, funds);
    expect(m[0]?.kind).toBe("same_legal_name");
    expect(fundCreationBlocker(m, { distinctConfirmed: true })).toMatch(/Legal Name/);
  });
  it("similar names need an explicit distinct confirmation", () => {
    const m = findFundMatches({ name: "Chapter 1, a series of Storybook Ventures LLC" }, funds);
    expect(m[0]?.kind).toBe("similar");
    expect(fundCreationBlocker(m)).toMatch(/similar/);
    expect(fundCreationBlocker(m, { distinctConfirmed: true })).toBeNull();
  });
  it("excludes the Fund being edited", () => {
    expect(findFundMatches({ name: "Example Ventures Fund I" }, funds, "a")).toHaveLength(0);
  });
  it("reads the concurrent-create database error", () => {
    expect(duplicateFundIdFromError("duplicate_fund_name:3f1c2b4a-1111-2222-3333-444455556666")).toBe("3f1c2b4a-1111-2222-3333-444455556666");
    expect(duplicateFundIdFromError("other")).toBeNull();
  });
});

describe("investor records sync classification", () => {
  it("only a canonical link is an Exact Match", () => {
    expect(classifyFolder({ name: "Jane Doe (Individual)", linkedProfileId: "p1" }, [inv({})], []).confidence).toBe("exact");
    expect(classifyFolder({ name: "Jane Doe (Individual)", linkedProfileId: null }, [inv({})], []).confidence).toBe("likely");
  });
  it("two investments with the same name are a conflict, never merged", () => {
    const c = classifyFolder({ name: "Jane Doe", linkedProfileId: null }, [inv({}), inv({ onboardingId: "o2", profileId: "p2" })], []);
    expect(c.category).toBe("conflict");
  });
  it("an existing Person elsewhere becomes Add to This Fund, not a new Person", () => {
    const c = classifyFolder({ name: "Sam Lee", linkedProfileId: null }, [inv({})], [{ personId: "x", profileIds: [] }]);
    expect(c.category).toBe("existing_person_missing_investment");
  });
  it("several possible Persons are a Duplicate Candidate", () => {
    expect(classifyFolder({ name: "Sam Lee", linkedProfileId: null }, [], [{ personId: "x", profileIds: [] }, { personId: "y", profileIds: [] }]).category).toBe("duplicate_candidate");
  });
  it("no match is a candidate only — never auto-created", () => {
    const c = classifyFolder({ name: "Unknown", linkedProfileId: null }, [], []);
    expect(c.category).toBe("new_investor_candidate");
    expect(actionsFor("new_investor_candidate")).toEqual(["create_investor", "link", "not_investor", "review_later"]);
  });
  it("a removed investor's folder never recreates the Investment", () => {
    const c = classifyFolder({ name: "Jane Doe", linkedProfileId: "p1" }, [inv({ removed: true })], []);
    expect(c.category).toBe("removed_investor");
    expect(actionsFor("removed_investor")).not.toContain("add_to_fund");
  });
  it("there is no accept-everything action", () => {
    for (const c of ["matched", "suggested_update", "conflict", "historical_document", "restricted_document", "fund_duplicate"] as const) {
      expect(actionsFor(c)).not.toContain("accept_all" as any);
    }
  });
  it("funded and closed investments are protected", () => {
    expect(syncProtected("funded")).toBe(true);
    expect(syncProtected("closed")).toBe(true);
    expect(syncProtected("documents")).toBe(false);
  });
  it("item keys are stable so a second sync creates nothing new", () => {
    expect(syncItemKey("f", "unmatched_folder", "folder:1")).toBe(syncItemKey("f", "unmatched_folder", "folder:1"));
  });
  it("routes categories to the Operations review kinds", () => {
    expect(queueKindFor("restricted_document")).toBe("restricted");
    expect(queueKindFor("fund_duplicate")).toBe("fund_duplicate");
    expect(queueKindFor("duplicate_candidate")).toBe("duplicate");
    expect(queueKindFor("historical_document")).toBe("document");
  });
  it("parses folder names written by the structure helper", () => {
    expect(parseInvestorFolderName("Acme Trust (Trust)")).toEqual({ displayName: "Acme Trust", profileHint: "trust" });
  });
  it("summarizes matched / needs review / unmatched", () => {
    expect(summarize([
      { category: "matched", status: "resolved" }, { category: "conflict", status: "open" },
      { category: "new_investor_candidate", status: "later" }, { category: "missing_folder", status: "resolved" },
    ])).toEqual({ matched: 1, needsReview: 1, unmatched: 1 });
  });
});
