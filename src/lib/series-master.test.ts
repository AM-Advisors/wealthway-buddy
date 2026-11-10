import { describe, expect, it } from "vitest";
import { seriesMasterKey, seriesMasterLabel } from "./series-master";

describe("series master matching", () => {
  it("links every spelling of the same master LLC to one master", () => {
    const names = [
      "CORPS EREBOR, A series of AM SPV Fund Management LLC",
      "Corps LaaSy, a series of AM SPV Fund Management",
      "4D Senseye SPV 2, a series of AM SPV Fund Management, LLC",
      "Pro Supps SPV, a series of AM SPV Fund Management L.L.C.",
    ];
    expect(new Set(names.map(seriesMasterKey))).toEqual(new Set(["am spv fund management"]));
  });
  it("keeps different masters separate", () => {
    expect(seriesMasterKey("Chapter 1, a series of Storybook Ventures LLC")).toBe("storybook ventures");
    expect(seriesMasterKey("Fund, a series of HCAM TX")).toBe("hcam tx");
  });
  it("is not a series without 'a series of' in the legal name", () => {
    expect(seriesMasterKey("ROAS Hedge LP")).toBeNull();
    expect(seriesMasterLabel("Pilot Fund")).toBeNull();
  });
  it("shows the master name as written", () => {
    expect(seriesMasterLabel("Corps LaaSy, a series of AM SPV Fund Management")).toBe("AM SPV Fund Management");
  });
});
