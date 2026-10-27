import { describe, expect, it, vi } from "vitest";
import { getRoasPaymentsHandler } from "./ops-billing.functions";

describe("staff-only payment reader", () => {
  it("refuses a missing signed-in account before reading anything", async () => {
    const from = vi.fn();
    await expect(getRoasPaymentsHandler({ context: { supabase: { from } } })).rejects.toThrow("Sign in");
    expect(from).not.toHaveBeenCalled();
  });
  it("refuses an investor or manager account before privileged invoice reads", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [{ role: "investor" }, { role: "fund_manager" }], error: null });
    await expect(getRoasPaymentsHandler({ context: { userId: "fictional-investor", supabase: { from: () => ({ select: () => ({ eq }) }) } } })).rejects.toThrow("Forbidden");
    expect(eq).toHaveBeenCalledWith("user_id", "fictional-investor");
  });
  it("fails closed on an unsuccessful staff-role lookup", async () => {
    await expect(getRoasPaymentsHandler({ context: { userId: "fictional-staff", supabase: { from: () => ({ select: () => ({ eq: async () => ({ data: [{ role: "operations" }], error: new Error("unavailable") }) }) }) } } })).rejects.toThrow("Forbidden");
  });
});