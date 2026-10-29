import { describe, expect, it } from "vitest";
import { minutesLeft, STEP_MINUTES } from "./investor-journey-model";
describe("ten-minute onboarding target", () => {
  it("all four steps add up to 10 minutes", () => {
    expect(Object.values(STEP_MINUTES).reduce((a, b) => a + b, 0)).toBe(10);
  });
  it("completed steps don't count toward time left", () => {
    expect(minutesLeft([{ key: "about", state: "complete" }, { key: "verify", state: "action_required" }, { key: "sign", state: "locked" }, { key: "fund", state: "locked" }])).toBe(8);
  });
});
