import { describe, it, expect } from "vitest";
import { stallReason, summarizeStalls } from "./investor-stall-model";

const base = { fundName: "Fund A", stage: "profile_selected", entrySource: "document", hasLogin: false, hasAnswers: false, lastActivityAt: "2026-10-01T00:00:00Z" };

describe("investor stall report", () => {
  it("imported investor without a login is 'never invited'", () => {
    expect(stallReason(base)).toBe("no_login_imported");
  });
  it("signed-in investor with answers is 'started, not finished'", () => {
    expect(stallReason({ ...base, hasLogin: true, hasAnswers: true })).toBe("answers_incomplete");
  });
  it("counts stale after 14 days and ignores later stages", () => {
    const s = summarizeStalls([base, { ...base, stage: "signature" }], new Date("2026-10-22T00:00:00Z"));
    expect(s[0].total).toBe(1);
    expect(s[0].stale).toBe(1);
  });
});
