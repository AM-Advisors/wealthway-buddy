import { describe, expect, it } from "vitest";
import { fundingDashboardFigures } from "@/lib/funding-dashboard-model";

const F = "fund-1";
const none = new Map<string, number>();

describe("fundingDashboardFigures", () => {
  it("counts current investments that have no older application", () => {
    const onbs = [
      { id: "o1", offering_id: F, stage: "subscription", funding_status: "not_funded", commitment_amount_cents: 5_000_000 },
      { id: "o2", offering_id: F, stage: "closed", funding_status: "funded", accepted_amount_cents: 10_000_000, funded_amount_cents: 10_000_000 },
    ];
    const f = fundingDashboardFigures(F, onbs, [], [], none, 2_500);
    expect(f.investors).toBe(2);
    expect(f.committedCents).toBe(15_000_000);
    expect(f.receivedCents).toBe(10_000_000);
    expect(f.settled).toBe(1);
    expect(f.inProgress).toBe(1);
    expect(f.wireFeesTotalCents).toBe(2_500);
  });

  it("counts a linked application and its investment once, without adding settled money twice", () => {
    const apps = [{ id: "a1", offering_id: F, user_id: "u1", status: "submitted", funding_status: "settled", commitment_cents: 9_999 }];
    const onbs = [{ id: "o1", offering_id: F, investor_user_id: "u1", application_id: "a1", stage: "closed", funding_status: "funded", accepted_amount_cents: 1_000_000, funded_amount_cents: 1_000_000 }];
    const pays = [{ application_id: "a1", amount_cents: 1_000_000, status: "settled" }];
    const f = fundingDashboardFigures(F, onbs, apps, pays, none, 0);
    expect(f.investors).toBe(1);
    expect(f.committedCents).toBe(1_000_000);
    expect(f.receivedCents).toBe(1_000_000);
  });

  it("never counts intended or reported money as raised", () => {
    const onbs = [{ id: "o1", offering_id: F, stage: "signature", funding_status: "received", commitment_amount_cents: 400_000, funded_amount_cents: 400_000 }];
    const f = fundingDashboardFigures(F, onbs, [], [], none, 0);
    expect(f.receivedCents).toBe(0);
    expect(f.inFlightCents).toBe(400_000);
  });

  it("leaves removed, merged and declined investments out of the money totals", () => {
    const onbs = [
      { id: "o1", offering_id: F, stage: "subscription", commitment_amount_cents: 100, removed_at: "2026-01-01" },
      { id: "o2", offering_id: F, stage: "subscription", commitment_amount_cents: 100, merged_into_onboarding_id: "o3" },
      { id: "o3", offering_id: F, stage: "declined", commitment_amount_cents: 100 },
    ];
    const f = fundingDashboardFigures(F, onbs, [], [], none, 0);
    expect(f.investors).toBe(0);
    expect(f.committedCents).toBe(0);
    expect(f.declined).toBe(1);
  });

  it("keeps unlinked older applications, using the signed subscription amount first", () => {
    const apps = [
      { id: "a1", offering_id: F, user_id: "u1", status: "submitted", funding_status: "awaiting_wire", commitment_cents: 100 },
      { id: "a2", offering_id: F, user_id: "u2", status: "withdrawn", commitment_cents: 500 },
    ];
    const pays = [{ application_id: "a1", amount_cents: 250, status: "processing" }];
    const f = fundingDashboardFigures(F, [], apps, pays, new Map([["a1", 300]]), 0);
    expect(f.investors).toBe(1);
    expect(f.committedCents).toBe(300);
    expect(f.inFlightCents).toBe(250);
  });

  it("ignores other funds", () => {
    const onbs = [{ id: "o1", offering_id: "other", stage: "subscription", commitment_amount_cents: 100 }];
    expect(fundingDashboardFigures(F, onbs, [], [], none, 0).investors).toBe(0);
  });
});
