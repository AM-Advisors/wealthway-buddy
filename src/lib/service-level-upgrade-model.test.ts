import { describe, expect, it } from "vitest";
import { canUpgradeServiceLevel } from "./service-level-upgrade-model";
describe("service level upgrade", () => {
  it("lets Finance confirm a paid level", () => expect(canUpgradeServiceLevel(["finance"])).toBe(true));
  it("blocks Sales reps", () => expect(canUpgradeServiceLevel(["account_executive"])).toBe(false));
});
