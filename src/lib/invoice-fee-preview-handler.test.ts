import { beforeEach, describe, expect, it, vi } from "vitest";
const preview = vi.hoisted(() => vi.fn());
vi.mock("./invoice-fee-accounting.server", () => ({ previewFeeAccounting: preview }));
import { previewInvoiceFeeEntryHandler } from "./invoice-fee-accounting.functions";

const data = { lineId: "fictional-line", entryDate: "2026-10-15", category: "administration" };
function context(roles: string[], error: unknown = null) {
  return { userId: "fictional-staff", supabase: { from: () => ({ select: () => ({ eq: async () => ({ data: roles.map(role => ({ role })), error }) }) }) } };
}
describe("fee entry preview authorization", () => {
  beforeEach(() => preview.mockReset());
  it.each([[], ["user"], ["sales"], ["fund_manager"]])("denies callers without accounting authority: %j", async roles => {
    await expect(previewInvoiceFeeEntryHandler({ context: context(roles), data })).rejects.toThrow("authority");
    expect(preview).not.toHaveBeenCalled();
  });
  it("fails closed if role lookup fails", async () => {
    await expect(previewInvoiceFeeEntryHandler({ context: context(["admin"], { message: "offline" }), data })).rejects.toThrow("verify");
    expect(preview).not.toHaveBeenCalled();
  });
  it("allows the existing accounting role and passes exact source inputs to the read-only engine", async () => {
    const ctx = context(["admin"]); preview.mockResolvedValue({ ready: false, blockers: ["No book"] });
    await expect(previewInvoiceFeeEntryHandler({ context: ctx, data })).resolves.toEqual({ ready: false, blockers: ["No book"] });
    expect(preview).toHaveBeenCalledWith(ctx, data);
  });
});