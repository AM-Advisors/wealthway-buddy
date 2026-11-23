import { describe, expect, it } from "vitest";
import { reviewerFundLine } from "@/lib/manager-panel-model";

const F = "fund-upper90";

describe("Funds you manage reads current investment records", () => {
  it("counts investments that have no older application (Upper90: 3 investors, $4.0M)", () => {
    const onbs = [
      { id: "o1", offering_id: F, investor_user_id: "u1", stage: "profile_selected", requested_amount_cents: 300_000_000 },
      { id: "o2", offering_id: F, investor_user_id: "u2", stage: "profile_selected", requested_amount_cents: 100_000_000 },
      { id: "o3", offering_id: F, investor_user_id: "u3", stage: "profile_selected" },
    ];
    const line = reviewerFundLine(F, onbs, []);
    expect(line.investors).toBe(3);
    expect(line.committedCents).toBe(400_000_000);
    expect(line.needsReview).toBe(0);
  });

  it("counts an investment and its linked older application once", () => {
    const onbs = [{ id: "o1", offering_id: F, investor_user_id: "u1", application_id: "a1", stage: "verification", requested_amount_cents: 5_000_000 }];
    const apps = [{ id: "a1", offering_id: F, user_id: "u1", commitment_cents: 9_000_000, status: "submitted" }];
    const line = reviewerFundLine(F, onbs, apps);
    expect(line.investors).toBe(1);
    expect(line.committedCents).toBe(5_000_000);
    expect(line.needsReview).toBe(0);
  });

  it("counts a signed investment awaiting manager approval as a review", () => {
    const onbs = [
      { id: "o1", offering_id: F, stage: "harmonious_review" },
      { id: "o2", offering_id: F, stage: "harmonious_review", approved_to_fund_at: "2026-11-20T00:00:00Z" },
    ];
    expect(reviewerFundLine(F, onbs, []).needsReview).toBe(1);
  });

  it("never counts test investors, removed or ended investments", () => {
    const onbs = [
      { id: "o1", offering_id: F, stage: "verification", is_test_investor: true, application_id: "a1", requested_amount_cents: 1 },
      { id: "o2", offering_id: F, stage: "verification", removed_at: "2026-11-01T00:00:00Z" },
      { id: "o3", offering_id: F, stage: "declined" },
    ];
    const apps = [{ id: "a1", offering_id: F, user_id: "u1", commitment_cents: 1 }];
    expect(reviewerFundLine(F, onbs, apps)).toEqual({ investors: 0, committedCents: 0, needsReview: 0 });
  });

  it("still counts older applications no investment replaced", () => {
    const apps = [{ id: "a1", offering_id: F, user_id: "u9", commitment_cents: 2_500_000, manager_review_status: "pending" }];
    expect(reviewerFundLine(F, [], apps)).toEqual({ investors: 1, committedCents: 2_500_000, needsReview: 1 });
  });
});
