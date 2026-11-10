import { describe, expect, it } from "vitest";
import { findLikelyDuplicates, studioApprover } from "./marketing-approvals-model";

const open = [{ id: "a", title: "Q4 Fund Tips", at: "2026-11-12T15:00:00Z" }, { id: "b", title: "Q4 fund tips", at: "2026-11-13T15:00:00Z" }];

describe("marketing approvals", () => {
  it("flags the same title on the same day, ignoring case", () => {
    expect(findLikelyDuplicates("q4  fund tips", "2026-11-12T09:00:00Z", open).map((d) => d.id)).toEqual(["a"]);
  });
  it("never flags the item itself or placeholder titles", () => {
    expect(findLikelyDuplicates("Q4 Fund Tips", "2026-11-12T09:00:00Z", open, "a")).toEqual([]);
    expect(findLikelyDuplicates("Untitled post", null, [{ id: "x", title: "Untitled post", at: null }])).toEqual([]);
  });
  it("CEO approval needs an executive; a marketing manager cannot give it", () => {
    expect(studioApprover("ceo_approval", ["marketing_manager"]).canApprove).toBe(false);
    expect(studioApprover("ceo_approval", ["executive_approver"]).canApprove).toBe(true);
    expect(studioApprover("internal_review", ["marketing_manager"]).canApprove).toBe(true);
  });
});
