import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  removed: false,
  terms: [{ id: "current-terms", offering_id: "fund-a", status: "active" }],
  acceptances: [] as Record<string, unknown>[],
  acceptanceError: false,
}));

vi.mock("./investor-onboarding.server", () => ({
  assertOnboardingAccess: vi.fn(async (userId: string, onboardingId: string) => {
    if (!["staff", "fund-a-manager", "investor"].includes(userId)) throw new Error("Forbidden");
    if (onboardingId !== "investment-a") throw new Error("Not found");
    return { row: { id: onboardingId, offering_id: "fund-a", investor_user_id: "investor", removed_at: state.removed ? "2026-11-04" : null } };
  }),
}));

vi.mock("@/lib/fund-tabs.server", () => ({
  assertFund: vi.fn(),
  db: async () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data: (table === "fund_fee_terms" ? state.terms : state.acceptances)
            .find((row: Record<string, unknown>) => filters.every(([key, value]) => row[key] === value)) ?? null,
          error: table === "investor_fee_acceptances" && state.acceptanceError ? { message: "unavailable" } : null,
        }),
      };
      return query;
    },
  }),
}));

import { assertFeesAccepted } from "./investor-extras.server";

beforeEach(() => {
  state.removed = false;
  state.terms = [{ id: "current-terms", offering_id: "fund-a", status: "active" }];
  state.acceptances = [{ id: "accepted", onboarding_id: "investment-a", fee_terms_id: "current-terms" }];
  state.acceptanceError = false;
});

describe("authorized preparation checks the investor's fee acceptance", () => {
  it.each(["staff", "fund-a-manager", "investor"])("allows %s after exact-investment acceptance", async (userId) => {
    await expect(assertFeesAccepted(userId, "investment-a")).resolves.toBeUndefined();
  });
  it("does not let staff accept fees on the investor's behalf", async () => {
    state.acceptances = [];
    await expect(assertFeesAccepted("staff", "investment-a")).rejects.toThrow("investor must review and accept");
  });
  it("rejects acceptance of an older fee version", async () => {
    state.acceptances[0] = { onboarding_id: "investment-a", fee_terms_id: "old-terms" };
    await expect(assertFeesAccepted("fund-a-manager", "investment-a")).rejects.toThrow("current fees");
  });
  it("rejects acceptance from another investment", async () => {
    state.acceptances[0] = { onboarding_id: "investment-b", fee_terms_id: "current-terms" };
    await expect(assertFeesAccepted("staff", "investment-a")).rejects.toThrow("current fees");
  });
  it("denies an unrelated fund manager before reading acceptance", async () => {
    await expect(assertFeesAccepted("fund-b-manager", "investment-a")).rejects.toThrow("Forbidden");
  });
  it("denies a removed investment", async () => {
    state.removed = true;
    await expect(assertFeesAccepted("staff", "investment-a")).rejects.toThrow("isn't available");
  });
  it("fails closed when acceptance cannot be read", async () => {
    state.acceptanceError = true;
    await expect(assertFeesAccepted("staff", "investment-a")).rejects.toThrow("couldn't check");
  });
  it("allows authorized preparation when there are no active fees to accept", async () => {
    state.terms = [];
    await expect(assertFeesAccepted("staff", "investment-a")).resolves.toBeUndefined();
  });
});