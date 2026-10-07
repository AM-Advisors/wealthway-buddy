import { describe, expect, it } from "vitest";
import { fundHealth } from "./fund-command-health";
import { occurrences, taskDue } from "./fund-calendar-templates";

const T = "2026-10-07";
describe("command center health", () => {
  it("no data is never Healthy", () => expect(fundHealth([], [], null, T).overall).toBe("NO_DATA"));
  it("materially overdue client action = Action Required", () => {
    expect(fundHealth([{ status: "open", due_date: "2026-10-01", responsibility_status: "CLIENT_APPROVAL_REQUIRED" }], [], null, T).overall).toBe("ACTION_REQUIRED");
  });
  it("minor overdue = Attention Needed; on time = Healthy", () => {
    expect(fundHealth([{ status: "open", due_date: "2026-10-06", responsibility_status: "HARMONIOUS_HANDLING" }], [], null, T).overall).toBe("ATTENTION_NEEDED");
    expect(fundHealth([{ status: "open", due_date: "2026-10-20", responsibility_status: "HARMONIOUS_HANDLING" }], [{ status: "SCHEDULED", due_date: "2026-11-01", category: "NAV" }], null, T).overall).toBe("HEALTHY");
  });
});

describe("calendar recurrence", () => {
  it("quarterly NAV 45 days after quarter end", () => {
    expect(occurrences({ cadence: "QUARTERLY", due_day_offset: 45 }, "2026-10-01", "2027-03-31").map((o) => o.due)).toEqual(["2026-11-14", "2027-02-14"]);
  });
  it("annual uses configurable date; lead time gate", () => {
    expect(occurrences({ cadence: "ANNUAL", due_day_offset: 0, annual_month: 3, annual_day: 15 }, "2026-10-01", "2027-10-01")[0]).toEqual({ period: "FY2026", due: "2027-03-15" });
    expect(taskDue("2026-10-15", 10, T)).toBe(true);
    expect(taskDue("2026-10-30", 10, T)).toBe(false);
  });
});
