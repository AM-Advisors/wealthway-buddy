import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ managers: vi.fn(), ops: vi.fn() }));
vi.mock("@/lib/client-work-notify.server", () => ({ notifyFundManagers: mocks.managers }));
vi.mock("@/lib/ops-slack-notify.server", () => ({ notifySubmission: mocks.ops }));
import { notifyFundChange } from "./fund-change-notify.server";
describe("Fund change alerts", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("alerts managers and Operations for a saved fee request with a fund review link", async () => {
    await notifyFundChange({ fundId: "fund-a", ref: "fee-a", title: "Fund fee terms", status: "requested", actorId: "staff-a" });
    expect(mocks.managers).toHaveBeenCalledWith("fund-a", "material_update", "Fund fee terms: requested", "/client/funds/fund-a?tab=approvals", "fee-a:requested");
    expect(mocks.ops).toHaveBeenCalledWith(expect.objectContaining({ ref: "fee-a", once: true, offeringId: "fund-a", path: "/ops/fund/fund-a?tab=approvals" }));
  });
  it("does not duplicate the existing service-request Operations alert", async () => {
    await notifyFundChange({ fundId: "fund-a", ref: "request-a", title: "Fund service request", status: "requested", actorId: "staff-a", tab: "requests" });
    expect(mocks.managers).toHaveBeenCalledTimes(1);
    expect(mocks.ops).not.toHaveBeenCalled();
  });
  it("does not fail the saved request if alert delivery fails", async () => {
    mocks.managers.mockRejectedValue(new Error("unavailable"));
    await expect(notifyFundChange({ fundId: "fund-a", ref: "letter-a", title: "Side letter change", status: "requested", actorId: "staff-a" })).resolves.toBeUndefined();
  });
});