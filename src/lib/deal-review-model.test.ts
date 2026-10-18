import { describe, expect, it } from "vitest";
import { documentsUnlocked, preCommitmentDocs, publishedTerms } from "./deal-review-model";

describe("deal review visibility", () => {
  it("returns only documents the manager marked for pre-commitment review", () => {
    const out = preCommitmentDocs([
      { id: "a", show_pre_commitment: true, archived_at: null },
      { id: "b", show_pre_commitment: false, archived_at: null },
      { id: "c", show_pre_commitment: true, archived_at: "2026-01-01" },
      { id: "d", show_pre_commitment: true, archived_at: null, visibility: "internal" },
    ]);
    expect(out.map((d) => d.id)).toEqual(["a"]);
  });
  it("never returns draft offering terms", () => {
    expect(publishedTerms({ is_published: false })).toBeNull();
    expect(publishedTerms({ is_published: true })).not.toBeNull();
  });
  it("locks documents until the required confidentiality agreement is accepted", () => {
    expect(documentsUnlocked(true, false)).toBe(false);
    expect(documentsUnlocked(true, true)).toBe(true);
    expect(documentsUnlocked(false, false)).toBe(true);
  });
});
