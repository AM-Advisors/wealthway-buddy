import { describe, it, expect } from "vitest";
import { followUpStatus, needsFollowUp } from "./document-follow-up-model";

const base = { usage: "signature" as const, execution: "not_sent" as const, acknowledged: false, sentAt: null, openedAt: null };

describe("document follow-up status", () => {
  it("an open is never a signature", () => {
    expect(followUpStatus({ ...base, sentAt: "2026-11-01", openedAt: "2026-11-02" })).toBe("opened_unsigned");
  });
  it("sent but never opened needs follow-up", () => {
    const s = followUpStatus({ ...base, sentAt: "2026-11-01" });
    expect(s).toBe("sent_unopened");
    expect(needsFollowUp(s)).toBe(true);
  });
  it("fully executed counts as signed", () => {
    expect(followUpStatus({ ...base, execution: "fully_executed", sentAt: "2026-11-01" })).toBe("signed");
  });
  it("investor signed but fund not yet is not unsigned", () => {
    const s = followUpStatus({ ...base, execution: "awaiting_countersignature", openedAt: "x" });
    expect(s).toBe("awaiting_fund");
    expect(needsFollowUp(s)).toBe(false);
  });
  it("acknowledgment documents complete on acknowledgment", () => {
    expect(followUpStatus({ ...base, usage: "acknowledgment", acknowledged: true })).toBe("signed");
  });
  it("reading-only documents never need a signature", () => {
    expect(followUpStatus({ ...base, usage: "reference", sentAt: "x" })).toBe("read_only");
  });
});
