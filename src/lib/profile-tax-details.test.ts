import { describe, expect, it } from "vitest";
import { currentProfileTaxDetails } from "./profile-tax-details.server";

function database(rows: any[], error: unknown = null) {
  const q: any = {
    select: () => q, in: () => q, eq: () => q, is: () => q,
    order: async () => ({ data: rows, error }),
  };
  return { from: () => q };
}

describe("signed profile tax details", () => {
  it("returns only last four and type, not full identifiers or form data", async () => {
    const result = await currentProfileTaxDetails(database([
      { investment_profile_id: "profile", certified_at: "2026-10-21", tin_last4: "4321", form_data: { tin_kind: "ein", private_answer: "excluded" } },
    ]), ["profile"], "2026-10-21");
    expect(result.get("profile")).toEqual({ last4: "4321", type: "ein" });
  });
  it("uses the latest certified version rather than the previous identifier", async () => {
    const result = await currentProfileTaxDetails(database([
      { investment_profile_id: "profile", certified_at: "2026-10-21", tin_last4: "4321" },
      { investment_profile_id: "profile", certified_at: "2026-10-20", tin_last4: "1111" },
    ]), ["profile"], "2026-10-21");
    expect(result.get("profile")?.last4).toBe("4321");
  });
  it("never displays a full identifier accidentally stored in a last-four field", async () => {
    const result = await currentProfileTaxDetails(database([
      { investment_profile_id: "profile", certified_at: "2026-10-21", tin_last4: "123456789" },
    ]), ["profile"], "2026-10-21");
    expect(result.get("profile")?.last4).toBeNull();
  });
  it("surfaces read failures rather than claiming tax details are missing", async () => {
    await expect(currentProfileTaxDetails(database([], { message: "unavailable" }), ["profile"])).rejects.toThrow("could not be loaded");
  });
});