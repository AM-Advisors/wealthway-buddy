import { describe, expect, it } from "vitest";
import { VEHICLE_STRUCTURES, coreServicesFor, defaultVehicle, eligibilityFor } from "./client-portal-model";

describe("service request auto-picks", () => {
  it("defaults the structure from the chosen service", () => {
    expect(defaultVehicle("launch_spv")).toBe("LLC");
    expect(defaultVehicle("launch_fund", "venture_capital")).toBe("LP");
    expect(defaultVehicle("launch_fund", "real_estate")).toBe("LLC");
  });
  it("offers only the four structure options", () => {
    expect(VEHICLE_STRUCTURES).toEqual(["Series LLC", "LLC", "LP", "GP"]);
  });
  it("ticks nothing until a structure is chosen", () => {
    expect(coreServicesFor(undefined)).toEqual([]);
  });
  it("adds Form D and Blue Sky for Reg D exemptions, and state formation from the jurisdiction", () => {
    expect(coreServicesFor("LLC", "506(c)", "Delaware")).toEqual(expect.arrayContaining(["form_d", "blue_sky", "accreditation_506c", "delaware_formation"]));
    expect(coreServicesFor("LLC", "506(c)", "Wyoming")).not.toContain("delaware_formation");
    expect(coreServicesFor("LLC", "Reg CF", "Wyoming")).not.toContain("form_d");
    expect(coreServicesFor("LLC", "Reg CF", "Wyoming")).not.toContain("delaware_formation");
  });
  it("syncs eligibility with the exemption", () => {
    expect(eligibilityFor("506(c)")).toMatch(/Accredited investors only/);
    expect(eligibilityFor("Reg A+ (Tier 2)")).toMatch(/10%/);
    expect(eligibilityFor("unknown")).toBe("");
  });
});
