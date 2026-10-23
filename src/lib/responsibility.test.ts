import { describe, expect, it } from "vitest";
import { responsibilityAlerts, responsibilityCounts, waitingOnDetail, daysOverdue, asResponsibility } from "./responsibility";

describe("responsibility", () => {
  it("hides third-party names from clients", () => {
    const t = { responsibility_status: "WAITING_ON_THIRD_PARTY", waiting_on_type: "AUDITOR", waiting_on_name: "Deloitte" };
    expect(waitingOnDetail(t, "client")).toBe("Auditor");
    expect(waitingOnDetail(t, "internal")).toBe("Auditor — Deloitte");
  });
  it("counts and falls back safely", () => {
    const c = responsibilityCounts([{ responsibility_status: "COMPLETED" }, { responsibility_status: null }, { responsibility_status: "WAITING_ON_INVESTOR" }]);
    expect(c.COMPLETED).toBe(1); expect(c.HARMONIOUS_HANDLING).toBe(1); expect(c.WAITING_ON_INVESTOR).toBe(1);
    expect(asResponsibility("nope")).toBe("HARMONIOUS_HANDLING");
  });
  it("detects notification hooks without sending", () => {
    expect(responsibilityAlerts({ responsibility_status: "CLIENT_APPROVAL_REQUIRED" }, "HARMONIOUS_HANDLING")).toEqual(["moved_to_approval"]);
    expect(responsibilityAlerts({ responsibility_status: "WAITING_ON_INVESTOR", due_date: "2020-01-01", status: "open" })).toEqual(["investor_overdue"]);
    expect(daysOverdue({ due_date: "2020-01-01", status: "done" })).toBe(0);
  });
});
