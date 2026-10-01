import { describe, expect, it } from "vitest";
import { coreServicesFor, defaultVehicle, eligibilityFor } from "./client-portal-model";

describe("service request auto-picks", () => {
  it("defaults the structure from the chosen service", () => {
    expect(defaultVehicle("launch_spv")).toBe("Delaware LLC");
    expect(defaultVehicle("launch_fund", "venture_capital")).toBe("Delaware LP");
    expect(defaultVehicle("launch_fund", "real_estate")).toBe("Delaware LLC");
  });
  it("ticks nothing until a structure is chosen", () => {
    expect(coreServicesFor(undefined)).toEqual([]);
  });
  it("adds Form D and Blue Sky for Reg D exemptions only", () => {
    expect(coreServicesFor("Delaware LLC", "506(c)")).toEqual(expect.arrayContaining(["form_d", "blue_sky", "accreditation_506c", "delaware_formation"]));
    expect(coreServicesFor("Wyoming LLC", "Reg CF")).not.toContain("form_d");
    expect(coreServicesFor("Wyoming LLC", "Reg CF")).not.toContain("delaware_formation");
  });
  it("syncs eligibility with the exemption", () => {
    expect(eligibilityFor("506(c)")).toMatch(/Accredited investors only/);
    expect(eligibilityFor("Reg A+ (Tier 2)")).toMatch(/10%/);
    expect(eligibilityFor("unknown")).toBe("");
  });
});
