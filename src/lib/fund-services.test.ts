import { describe, it, expect } from "vitest";
import { checkTransition, allowedNext, managerView, maskEin } from "./fund-services";

const base = { actorId: "b", preparedBy: "a", fields: {} as Record<string, unknown> };

describe("fund services", () => {
  it("requires a different reviewer", () => {
    expect(checkTransition({ ...base, kind: "ein", from: "ready_for_review", to: "reviewed", actorId: "a" })).toMatch(/different/);
    expect(checkTransition({ ...base, kind: "ein", from: "ready_for_review", to: "reviewed" })).toBeNull();
  });
  it("cannot skip review", () => {
    expect(checkTransition({ ...base, kind: "ein", from: "preparing", to: "submitted" })).toMatch(/Can't/);
  });
  it("EIN completion needs the IRS letter", () => {
    const t = { ...base, kind: "ein" as const, from: "submitted" as const, to: "completed" as const };
    expect(checkTransition(t)).toMatch(/letter/);
    expect(checkTransition({ ...t, hasEinLetter: true })).toBeNull();
  });
  it("BOI needs parties and confirmation; only BOI can be exempt", () => {
    expect(checkTransition({ ...base, kind: "boi", from: "preparing", to: "ready_for_review", boiPartyCount: 0 })).toMatch(/owner/);
    expect(checkTransition({ ...base, kind: "boi", from: "submitted", to: "completed" })).toMatch(/FinCEN/);
    expect(allowedNext("ein", "not_started")).not.toContain("exempt");
    expect(allowedNext("boi", "not_started")).toContain("exempt");
  });
  it("submission requires a date", () => {
    expect(checkTransition({ ...base, kind: "formation", from: "reviewed", to: "submitted" })).toMatch(/date/);
  });
  it("masks for managers", () => {
    expect(managerView({ ein: "123456789", confirmationNumber: "x", state: "DE" })).toEqual({ state: "DE" });
    expect(maskEin("12-3456789")).toBe("**-***6789");
  });
});
