import { describe, expect, it } from "vitest";
import { isOpenOnboarding, liveLegacyApplications, preferredOnboarding } from "@/lib/legacy-application-supersede";

describe("older applications vs current investment records", () => {
  it("hides an older application when the same fund has an investment record in any stage", () => {
    const apps = [{ id: "a1", offering_id: "f1" }, { id: "a2", offering_id: "f2" }];
    expect(liveLegacyApplications(apps, [{ offering_id: "f1" }]).map((a) => a.id)).toEqual(["a2"]);
  });
  it("treats closed, complete, declined and cancelled investments as not open", () => {
    for (const stage of ["closed", "complete", "declined", "cancelled"]) expect(isOpenOnboarding({ stage })).toBe(false);
    expect(isOpenOnboarding({ stage: "signature" })).toBe(true);
    expect(isOpenOnboarding({ stage: "signature", closed_at: "2026-01-01" })).toBe(false);
  });
  it("opens the open investment first, otherwise the most recent", () => {
    expect(preferredOnboarding([
      { id: "old", stage: "closed", updated_at: "2026-10-01" },
      { id: "open", stage: "awaiting_funds", updated_at: "2026-01-01" },
    ])?.id).toBe("open");
    expect(preferredOnboarding([
      { id: "a", stage: "closed", updated_at: "2026-01-01" },
      { id: "b", stage: "closed", updated_at: "2026-10-01" },
    ])?.id).toBe("b");
  });
});

import { investmentSubscriptionBadges, invitedFundState } from "@/lib/legacy-application-supersede";

describe("home page cards follow the current investment record", () => {
  it("hides the invitation card once the investment in that fund is closed", () => {
    expect(invitedFundState([{ id: "ob1", stage: "closed", closed_at: "2026-11-09" }])).toEqual({ show: false, onboardingId: null });
  });
  it("continues an open investment and still offers a start after a declined one", () => {
    expect(invitedFundState([{ id: "ob1", stage: "awaiting_funds" }])).toEqual({ show: true, onboardingId: "ob1" });
    expect(invitedFundState([{ id: "ob1", stage: "declined" }])).toEqual({ show: true, onboardingId: null });
    expect(invitedFundState([])).toEqual({ show: true, onboardingId: null });
  });
  it("shows a closed, funded investment as complete and funded, never accreditation not started", () => {
    const badges = investmentSubscriptionBadges({ step: 4, complete: true, fundingState: "funded" });
    expect(badges).toEqual([{ label: "Investment", status: "complete" }, { label: "Funding", status: "funded" }]);
    expect(badges.some((b) => b.label === "Accreditation")).toBe(false);
  });
  it("shows the current step for an investment still in progress", () => {
    expect(investmentSubscriptionBadges({ step: 2, complete: false, fundingState: "not_ready" })).toEqual([
      { label: "Current step", status: "sign" },
      { label: "Funding", status: "not_ready_to_fund" },
    ]);
  });
});
