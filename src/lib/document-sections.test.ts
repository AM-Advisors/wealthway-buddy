import { describe, expect, it } from "vitest";
import { autoTags, cleanCheck, sectionFor, type LibraryDoc } from "./document-sections";

const doc = (o: Partial<LibraryDoc>): LibraryDoc => ({
  source: "investor_document", id: "x", title: "file.pdf", kind: "other", investorUserId: "u1", offeringId: "f1", onboardingId: "o1",
  taxYear: null, date: null, status: null, signed: false, replaced: false, ...o,
});

describe("sections", () => {
  it("routes kinds to the four sections", () => {
    expect(sectionFor("investor_document", "w9")).toBe("tax");
    expect(sectionFor("k1", "")).toBe("tax");
    expect(sectionFor("signature", "", "Private Placement Memorandum")).toBe("fund");
    expect(sectionFor("signature", "", "Subscription Agreement")).toBe("subscription");
    expect(sectionFor("investor_document", "accreditation_letter")).toBe("identity");
  });
});

describe("auto tags", () => {
  it("marks past, signed and prior tax year", () => {
    expect(autoTags({ replaced: true, signed: true, taxYear: 2025 }, 2026)).toEqual(["Past version", "Signed", "Prior tax year 2025"]);
    expect(autoTags({ replaced: false, signed: false, taxYear: 2026 }, 2026)).toEqual([]);
  });
});

describe("clean check", () => {
  it("finds duplicate copies", () => {
    const r = cleanCheck([doc({ id: "a" }), doc({ id: "b" })]);
    expect(r.map((i) => i.kind)).toEqual(["duplicate"]);
  });
  it("ignores replaced copies as duplicates", () => {
    expect(cleanCheck([doc({ id: "a" }), doc({ id: "b", replaced: true })])).toEqual([]);
  });
  it("finds a document filed under the wrong investor", () => {
    const r = cleanCheck([doc({ linkedInvestorUserId: "u2" })]);
    expect(r[0]?.kind).toBe("wrong_party");
  });
  it("finds more than one current version", () => {
    const r = cleanCheck([doc({ id: "a", source: "signature", slotKey: "s" }), doc({ id: "b", source: "signature", slotKey: "s" })]);
    expect(r[0]?.kind).toBe("multiple_current");
  });
});
