import { describe, expect, it } from "vitest";

import { normalizeInvestmentTab } from "@/lib/investment-workspace";
import { currentFund, currentOnlyOnboardings } from "@/lib/investor-capital.functions";
import { investmentWorkspaceTabs } from "@/lib/client-navigation";

describe("investment workspace", () => {
  it("opens Onboarding steps when a step is requested", () => {
    expect(normalizeInvestmentTab(undefined, "sign")).toBe("onboarding");
  });
  it("falls back to Overview for unknown tabs", () => {
    expect(normalizeInvestmentTab("bogus")).toBe("overview");
  });
  it("every tab link stays on the one investment", () => {
    for (const t of investmentWorkspaceTabs("abc")) expect(t.url.startsWith("/investment/abc")).toBe(true);
  });
});

describe("capital summary sources", () => {
  it("adds current onboardings only where no legacy application exists, never removed ones", () => {
    const out = currentOnlyOnboardings(
      [{ id: "o1", offering_id: "f1" }, { id: "o2", offering_id: "f2" }, { id: "o3", offering_id: "f3", removed_at: "2026-01-01" }],
      [{ id: "a1", offering_id: "f1" }],
    );
    expect(out.map((o) => o.id)).toEqual(["o2"]);
  });
  it("uses the commitment and funded amount from the onboarding", () => {
    const f = currentFund({ id: "o2", offering_id: "f2", commitment_amount_cents: 50000000, funded_amount_cents: 10000000 });
    expect(f.commitmentCents).toBe(50000000);
    expect(f.outstandingCents).toBe(40000000);
  });
});
