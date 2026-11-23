import { describe, expect, it } from "vitest";
import { canonicalApplicationNames, managerFundCounts, onboardingPanelStage } from "@/lib/manager-panel-model";

const F = "fund-1";

describe("manager home fund cards", () => {
  it("counts investments that have no older application (previously shown as 0)", () => {
    const onbs = [
      { id: "o1", offering_id: F, stage: "profile_selected", funding_status: "not_funded", commitment_amount_cents: 5_000_000 },
      { id: "o2", offering_id: F, stage: "funded", funding_status: "funded", accepted_amount_cents: 10_000_000, funded_amount_cents: 10_000_000 },
    ];
    const c = managerFundCounts(F, onbs, [], new Map());
    expect(c.total).toBe(2);
    expect(c.committedCents).toBe(15_000_000);
    expect(c.receivedCents).toBe(10_000_000);
    expect(c.identity).toBe(1);
    expect(c.complete).toBe(1);
  });

  it("counts an investment and its linked application once", () => {
    const onbs = [{ id: "o1", offering_id: F, application_id: "a1", investor_user_id: "u1", stage: "signature", requested_amount_cents: 2_000_000 }];
    const apps = [{ id: "a1", offering_id: F, user_id: "u1", commitment_cents: 2_000_000 }];
    const c = managerFundCounts(F, onbs, apps, new Map());
    expect(c.total).toBe(1);
    expect(c.committedCents).toBe(2_000_000);
    expect(c.documents).toBe(1);
  });

  it("still counts an unlinked older application with no current investment", () => {
    const apps = [{ id: "a9", offering_id: F, user_id: "u9", kyc_status: "approved", aml_status: "approved", accreditation_status: "approved", documents_status: "approved", funding_status: "settled", commitment_cents: 300_000 }];
    const c = managerFundCounts(F, [], apps, new Map([["a9", 300_000]]));
    expect(c.total).toBe(1);
    expect(c.complete).toBe(1);
    expect(c.receivedCents).toBe(300_000);
  });

  it("money marked received but not reconciled is not counted as received", () => {
    const onbs = [{ id: "o1", offering_id: F, stage: "profile_selected", funding_status: "received", funded_amount_cents: 1_000_000, commitment_amount_cents: 1_000_000 }];
    expect(managerFundCounts(F, onbs, [], new Map()).receivedCents).toBe(0);
  });

  it("leaves out removed, merged, declined and cancelled investments and other funds", () => {
    const onbs = [
      { id: "o1", offering_id: F, stage: "started", removed_at: "2026-01-01" },
      { id: "o2", offering_id: F, stage: "started", merged_into_onboarding_id: "o3" },
      { id: "o3", offering_id: F, stage: "cancelled" },
      { id: "o4", offering_id: F, stage: "declined" },
      { id: "o5", offering_id: "other", stage: "started" },
    ];
    expect(managerFundCounts(F, onbs, [], new Map()).total).toBe(0);
  });

  it("never counts withdrawn applications", () => {
    const apps = [{ id: "a1", offering_id: F, user_id: "u1", status: "withdrawn", commitment_cents: 12_345_678_900 }];
    const c = managerFundCounts(F, [], apps, new Map());
    expect(c.total).toBe(0);
    expect(c.committedCents).toBe(0);
  });

  it("never counts test investors or an application tied only to a removed test investment", () => {
    const onbs = [
      { id: "o1", offering_id: F, application_id: "a1", investor_user_id: "u1", stage: "harmonious_review", is_test_investor: true, removed_at: "2026-10-21" },
      { id: "o2", offering_id: F, investor_user_id: "u2", stage: "signature", is_test_investor: true, requested_amount_cents: 1_000_000 },
    ];
    const apps = [{ id: "a1", offering_id: F, user_id: "u1", status: "in_progress", commitment_cents: 250_000_000 }];
    const c = managerFundCounts(F, onbs, apps, new Map());
    expect(c.total).toBe(0);
    expect(c.committedCents).toBe(0);
  });

  it("Erebor case: 5 real investors plus 5 withdrawn test applications counts 5", () => {
    const onbs = [1, 2, 3, 4, 5].map((n) => ({ id: `o${n}`, offering_id: F, application_id: `a${n}`, investor_user_id: `u${n}`, stage: "signature", requested_amount_cents: 43_000_000 }));
    const real = [1, 2, 3, 4, 5].map((n) => ({ id: `a${n}`, offering_id: F, user_id: `u${n}`, status: "in_progress", commitment_cents: 43_000_000 }));
    const tests = [6, 7, 8, 9, 10].map((n) => ({ id: `a${n}`, offering_id: F, user_id: `t${n}`, status: "withdrawn", commitment_cents: 2_500_000_000 }));
    const c = managerFundCounts(F, onbs, [...real, ...tests], new Map());
    expect(c.total).toBe(5);
    expect(c.committedCents).toBe(215_000_000);
  });

  it("maps stages to steps", () => {
    expect(onboardingPanelStage({ stage: "eligibility" }, "not_funded")).toBe("accreditation");
    expect(onboardingPanelStage({ stage: "awaiting_funds" }, "not_funded")).toBe("funding");
    expect(onboardingPanelStage({ stage: "closed" }, null)).toBe("complete");
    expect(onboardingPanelStage({ stage: "signature" }, "settled")).toBe("complete");
  });

  it("names an application by its investing party, then the person", () => {
    const m = canonicalApplicationNames([
      { application_id: "a1", profileName: "The Buckman Family Trust", personName: "Jim Buckman" },
      { application_id: "a2", profileName: null, personName: "Doug Mangrum" },
      { application_id: null, profileName: "x" },
    ]);
    expect(m.get("a1")).toBe("The Buckman Family Trust");
    expect(m.get("a2")).toBe("Doug Mangrum");
    expect(m.size).toBe(2);
  });
});
