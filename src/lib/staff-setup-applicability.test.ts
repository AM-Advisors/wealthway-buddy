import { describe, expect, it } from "vitest";
import { staffSetupApplies } from "./staff-setup-applicability";

describe("staffSetupApplies", () => {
  it("hides class assignment for a single-class SPV", () => {
    expect(staffSetupApplies({ fundType: "SPV" }).classAssignment).toBe(false);
  });
  it("keeps class assignment for an SPV with multiple classes", () => {
    expect(staffSetupApplies({ fundType: "SPV", hasMultipleClasses: true }).classAssignment).toBe(true);
  });
  it("keeps class assignment for a venture fund", () => {
    expect(staffSetupApplies({ fundType: "Venture capital" }).classAssignment).toBe(true);
  });
  it("never repeats banking or launch in the Harmonious only box", () => {
    const r = staffSetupApplies({ fundType: "Private equity" });
    expect(r.banking).toBe(false);
    expect(r.launch).toBe(false);
  });
});
