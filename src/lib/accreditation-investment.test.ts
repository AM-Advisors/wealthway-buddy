import { describe, expect, it } from "vitest";
import { pickAccreditationInvestment } from "@/lib/accreditation-investment";

const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, offering_id: `off-${id}`, stage: "profile_selected", ...extra });

describe("accreditation investment without an address", () => {
  it("uses the investor's only open investment", () => {
    expect(pickAccreditationInvestment([row("a"), row("b", { stage: "cancelled" }), row("c", { removed_at: "2026-01-01" })]))
      .toEqual({ kind: "one", onboardingId: "a" });
  });

  it("asks the investor to choose when several investments are open", () => {
    expect(pickAccreditationInvestment([row("a"), row("b")])).toEqual({ kind: "many", onboardingIds: ["a", "b"] });
  });

  it("never picks closed, declined, merged or fund-less investments", () => {
    expect(pickAccreditationInvestment([
      row("a", { closed_at: "2026-01-01" }), row("b", { stage: "declined" }),
      row("c", { merged_into_onboarding_id: "x" }), row("d", { offering_id: null }),
    ])).toEqual({ kind: "none" });
  });
});
