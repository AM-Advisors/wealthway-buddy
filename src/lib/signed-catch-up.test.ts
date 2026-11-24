import { describe, expect, it } from "vitest";
import { needsSignedRecheck, pickSignedRechecks } from "./signed-catch-up";

const base = { id: "a", stage: "signature", removed: false, executed: false, latestSignedAt: "2026-11-20T00:00:00Z", lastRecheckAt: "2026-11-19T05:27:37Z" };

describe("signed catch-up", () => {
  it("rechecks an investment signed after its last check (Todd Floyd case)", () => expect(needsSignedRecheck(base)).toBe(true));
  it("skips when already rechecked after signing", () => expect(needsSignedRecheck({ ...base, lastRecheckAt: "2026-11-21T00:00:00Z" })).toBe(false));
  it("skips already submitted investments", () => expect(needsSignedRecheck({ ...base, executed: true })).toBe(false));
  it("skips removed investments", () => expect(needsSignedRecheck({ ...base, removed: true })).toBe(false));
  it("skips closed investments", () => expect(needsSignedRecheck({ ...base, stage: "closed" })).toBe(false));
  it("skips when nothing is signed", () => expect(needsSignedRecheck({ ...base, latestSignedAt: null })).toBe(false));
  it("rechecks when never checked", () => expect(needsSignedRecheck({ ...base, lastRecheckAt: null })).toBe(true));
  it("caps the batch", () => expect(pickSignedRechecks(Array.from({ length: 30 }, (_, i) => ({ ...base, id: String(i) })), 25)).toHaveLength(25));
});
