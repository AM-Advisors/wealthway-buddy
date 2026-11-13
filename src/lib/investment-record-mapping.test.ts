import { describe, expect, it } from "vitest";
import {
  applicationHoldsValue,
  currentFundApplication,
  investmentToOpen,
  joinFundRecords,
  overviewStageForSteps,
} from "@/lib/investment-record-mapping";

const open = (id: string, extra: Record<string, unknown> = {}) => ({ id, offering_id: "fund-a", investor_user_id: "u1", stage: "profile_selected", updated_at: "2026-11-10", ...extra });

describe("which older application a fund page uses", () => {
  it("uses the application linked to the open investment, not an older one in the same fund", () => {
    const choice = currentFundApplication([open("inv-1", { application_id: "app-new" })], [{ id: "app-old" }, { id: "app-new" }], null);
    expect(choice).toEqual({ kind: "linked", applicationId: "app-new", onboardingId: "inv-1" });
  });

  it("reports an unlinked open investment instead of borrowing the older application", () => {
    expect(currentFundApplication([open("inv-1")], [{ id: "app-old" }], null)).toEqual({ kind: "unlinked", onboardingId: "inv-1" });
  });

  it("keeps older behavior when only older applications exist, or the investment is closed or removed", () => {
    expect(currentFundApplication([], [{ id: "app-old" }], null)).toEqual({ kind: "legacy" });
    expect(currentFundApplication([open("inv-1", { stage: "closed", application_id: "app-old" })], [{ id: "app-old" }], null)).toEqual({ kind: "legacy" });
    expect(currentFundApplication([open("inv-1", { removed_at: "2026-11-01", application_id: "app-old" })], [{ id: "app-old" }], null)).toEqual({ kind: "legacy" });
  });

  it("picks between two linked investments only by the investing account in use, never by guessing", () => {
    const invs = [open("inv-1", { application_id: "app-1" }), open("inv-2", { application_id: "app-2" })];
    const apps = [{ id: "app-1", persona_id: "p1" }, { id: "app-2", persona_id: "p2" }];
    expect(currentFundApplication(invs, apps, "p2")).toEqual({ kind: "linked", applicationId: "app-2", onboardingId: "inv-2" });
    expect(currentFundApplication(invs, apps, null)).toEqual({ kind: "legacy" });
  });
});

describe("older identity page hand-off", () => {
  it("opens the open investment in the same fund instead of starting a new application", () => {
    expect(investmentToOpen([open("inv-1")], "fund-a", false)).toBe("inv-1");
    expect(investmentToOpen([open("inv-1")], "fund-a", true)).toBe("inv-1");
  });

  it("with no older application, opens any open investment; with one in another fund, leaves it alone", () => {
    expect(investmentToOpen([open("inv-1")], "fund-b", false)).toBe("inv-1");
    expect(investmentToOpen([open("inv-1")], "fund-b", true)).toBeNull();
    expect(investmentToOpen([open("inv-1", { stage: "closed" })], "fund-a", false)).toBeNull();
  });
});

describe("one roster per fund", () => {
  const apps = [
    { id: "app-linked", user_id: "u1", funding_status: null },
    { id: "app-stale", user_id: "u1", funding_status: null },
    { id: "app-funded", user_id: "u1", funding_status: "funded" },
    { id: "app-other", user_id: "u9", funding_status: null },
  ];
  const invs = [
    open("inv-linked", { application_id: "app-linked" }),
    open("inv-manual", { investor_user_id: null, application_id: null }),
    open("inv-removed", { removed_at: "2026-11-01" }),
  ];
  const r = joinFundRecords(apps, invs, applicationHoldsValue);

  it("lists each live investment once, with its linked application folded in", () => {
    expect(r.linked.map((l) => [l.investment.id, l.application.id])).toEqual([["inv-linked", "app-linked"]]);
    expect(r.investmentsOnly.map((i) => i.id)).toEqual(["inv-manual"]);
  });

  it("marks an empty earlier application from the same login as replaced, but keeps one with money", () => {
    expect(r.replaced.map((a) => a.id)).toEqual(["app-stale"]);
    expect(r.applicationsOnly.map((a) => a.id)).toEqual(["app-funded", "app-other"]);
  });

  it("never lists removed investments", () => {
    expect([...r.linked.map((l) => l.investment.id), ...r.investmentsOnly.map((i) => i.id)]).not.toContain("inv-removed");
  });
});

describe("manager roster stage groups", () => {
  const steps = (states: string[]) => ["about_you", "verification", "sign", "fund"].map((key, i) => ({ key, state: states[i]! }));
  it("follows the first unfinished canonical step", () => {
    expect(overviewStageForSteps(steps(["in_progress", "not_started", "not_started", "not_started"]))).toBe("identity");
    expect(overviewStageForSteps(steps(["complete", "complete", "in_progress", "not_started"]))).toBe("documents");
    expect(overviewStageForSteps(steps(["complete", "complete", "complete", "waiting_harmonious"]))).toBe("funding");
    expect(overviewStageForSteps(steps(["complete", "complete", "complete", "complete"]))).toBe("complete");
  });
});
