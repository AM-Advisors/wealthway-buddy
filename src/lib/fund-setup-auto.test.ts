import { describe, expect, it } from "vitest";
import { autoCompletedKeys, seriesMasterName } from "./fund-setup-model";

describe("fund setup auto-completion", () => {
  it("series under a master completes formation and registered agent", () => {
    expect(seriesMasterName("CORPS EREBOR, A series of AM SPV Fund Management LLC")).toBe("AM SPV Fund Management LLC");
    expect(autoCompletedKeys({ seriesMaster: "AM SPV", hasEin: false, hasWire: false }).tasks).toEqual(["entity_formation", "entity_registered_agent"]);
  });
  it("standalone fund does not auto-complete formation", () => {
    expect(autoCompletedKeys({ seriesMaster: null, hasEin: false, hasWire: false }).tasks).toEqual([]);
  });
  it("entered EIN completes EIN task", () => {
    expect(autoCompletedKeys({ seriesMaster: null, hasEin: true, hasWire: false }).tasks).toEqual(["entity_ein"]);
  });
  it("entered wire instructions complete bank account", () => {
    const r = autoCompletedKeys({ seriesMaster: null, hasEin: false, hasWire: true });
    expect(r.tasks).toEqual(["banking_account"]);
    expect(r.conditions).toEqual(["banking_active"]);
  });
});
