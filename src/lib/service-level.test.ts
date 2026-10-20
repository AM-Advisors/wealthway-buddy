import { describe, expect, it } from "vitest";
import { managerMayComplete, normalizeServiceLevel, resolveLevelOnSubmit, serviceLevelItem } from "./service-level";

describe("fund service level", () => {
  it("defaults to Self Serve", () => {
    expect(normalizeServiceLevel(undefined)).toBe("self_serve");
    expect(normalizeServiceLevel("bogus")).toBe("self_serve");
  });
  it("charges nothing for Self Serve or Institutional", () => {
    expect(serviceLevelItem("self_serve")).toBeNull();
    expect(serviceLevelItem("institutional")).toBeNull();
    expect(serviceLevelItem("white_glove")?.cents).toBe(2_400_000);
  });
  it("activates a paid level only after payment", () => {
    expect(resolveLevelOnSubmit("core", null)).toEqual({ active: "self_serve", status: "awaiting_payment" });
    expect(resolveLevelOnSubmit("core", { paid: false }).active).toBe("self_serve");
    expect(resolveLevelOnSubmit("core", { paid: true })).toEqual({ active: "core", status: "active" });
    expect(resolveLevelOnSubmit("institutional", { paid: true }).active).toBe("self_serve");
  });
  it("lets only that fund's managers self-complete, and only on Self Serve", () => {
    expect(managerMayComplete("self_serve", true)).toBe(true);
    expect(managerMayComplete("self_serve", false)).toBe(false);
    expect(managerMayComplete("plus", true)).toBe(false);
  });
});
