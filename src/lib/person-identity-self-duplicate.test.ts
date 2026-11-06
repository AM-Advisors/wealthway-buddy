import { describe, it, expect } from "vitest";
import { isBenignSelfDuplicate } from "./person-identity-model";

const base = {
  warnings: ["Possible duplicated user from other session", "Duplicated face from other approved session", "Full name mismatch with provided information"],
  livenessStatus: "pass", faceMatchStatus: "pass", amlHits: 0, documentExpired: false,
  idFullName: "Jason Robert M K Dang", personLegalName: "Jason Robert M K Dang",
};

describe("same person on a second account", () => {
  it("passes when only duplicate-of-self warnings and the ID name matches the person", () => expect(isBenignSelfDuplicate(base)).toBe(true));
  it("stays in review when the ID name differs from the person", () => expect(isBenignSelfDuplicate({ ...base, personLegalName: "Josh Dang" })).toBe(false));
  it("stays in review when liveness fails", () => expect(isBenignSelfDuplicate({ ...base, livenessStatus: "review" })).toBe(false));
  it("stays in review with a watchlist match", () => expect(isBenignSelfDuplicate({ ...base, amlHits: 1 })).toBe(false));
  it("stays in review with any other warning", () => expect(isBenignSelfDuplicate({ ...base, warnings: [...base.warnings, "Document may be tampered"] })).toBe(false));
  it("needs a duplicate warning to apply at all", () => expect(isBenignSelfDuplicate({ ...base, warnings: [] })).toBe(false));
});
