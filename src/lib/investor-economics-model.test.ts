import { describe, it, expect } from "vitest";
import { letterRates, parseRate, resolveEconomics } from "./investor-economics-model";

const defaults = { fee: 6, carry: 15 };
const classes = [{ key: "b", name: "Class B", fee: 1, carry: 10 }];
const inv = (id: string, classKey: string | null = null, stage = "profile_selected") => ({ id, investor: id, classKey, stage });

describe("investor economics", () => {
  it("uses fund default with no class or letter", () => {
    const [r] = resolveEconomics(defaults, classes, [inv("a")], []);
    expect([r!.fee, r!.carry, r!.source]).toEqual([6, 15, "Fund default"]);
  });
  it("class overrides default", () => {
    const [r] = resolveEconomics(defaults, classes, [inv("a", "b")], []);
    expect([r!.fee, r!.carry]).toEqual([1, 10]);
  });
  it("active side letter overrides class", () => {
    const [r] = resolveEconomics(defaults, classes, [inv("a", "b")], [{ id: "l", onboardingId: "a", status: "active", fee: 0, carry: 0 }]);
    expect([r!.fee, r!.carry, r!.source]).toEqual([0, 0, "Side letter"]);
  });
  it("proposed side letter is shown but not applied", () => {
    const [r] = resolveEconomics(defaults, classes, [inv("a")], [{ id: "l", onboardingId: "a", status: "proposed", fee: 0, carry: null }]);
    expect(r!.fee).toBe(6);
    expect(r!.proposed).toEqual({ fee: 0, carry: 15 });
  });
  it("signed investors are locked", () => {
    expect(resolveEconomics(defaults, classes, [inv("a", null, "awaiting_funds")], [])[0]!.locked).toBe(true);
  });
  it("parses waived and percents", () => {
    expect(parseRate("waived")).toBe(0);
    expect(parseRate("1.5 %")).toBe(1.5);
    expect(letterRates([{ category: "carry_reduction", value: "0%" }])).toEqual({ fee: null, carry: 0 });
  });
});
