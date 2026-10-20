import { describe, expect, it } from "vitest";

import { addMonths, duePeriods, issueBlocker, periodFor, scheduleRef } from "@/lib/invoice-schedule-model";
import { payoutDueDate, PAYOUT_RECORDERS } from "@/lib/commission-model";

describe("billing schedule", () => {
  it("a quarterly schedule produces three-month periods", () => {
    expect(periodFor("quarterly", "2026-01-15")).toEqual({ start: "2026-01-15", end: "2026-04-14", next: "2026-04-15" });
    expect(duePeriods("quarterly", "2026-01-15", "2026-07-20").map((p) => p.start)).toEqual(["2026-01-15", "2026-04-15", "2026-07-15"]);
  });
  it("annual and monthly periods end the day before the next one", () => {
    expect(periodFor("annual", "2026-03-01").end).toBe("2027-02-28");
    expect(periodFor("monthly", "2026-01-31").next).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });
  it("a one-time charge is billed once", () => {
    expect(duePeriods("one_time", "2026-02-01", "2027-01-01")).toHaveLength(1);
  });
  it("nothing is due before the first billing date", () => {
    expect(duePeriods("monthly", "2026-11-01", "2026-10-31")).toHaveLength(0);
  });
  it("each schedule period has one key, so a re-run can't bill twice", () => {
    expect(scheduleRef("s1", "2026-01-15")).toBe(scheduleRef("s1", "2026-01-15"));
    expect(scheduleRef("s1", "2026-01-15")).not.toBe(scheduleRef("s1", "2026-04-15"));
  });
});

describe("issuing an invoice", () => {
  const base = { issuerId: "b", createdBy: "a", reviewedBy: null, generatedBySchedule: false, isSuperAdmin: false };
  it("a draft can't be issued by the person who prepared it", () => {
    expect(issueBlocker({ ...base, issuerId: "a" })).toMatch(/different person/);
    expect(issueBlocker(base)).toBeNull();
  });
  it("a scheduled draft needs a reviewer, and the reviewer can't issue it", () => {
    expect(issueBlocker({ ...base, createdBy: null, generatedBySchedule: true })).toMatch(/review/);
    expect(issueBlocker({ ...base, createdBy: null, generatedBySchedule: true, reviewedBy: "b" })).toMatch(/different person/);
    expect(issueBlocker({ ...base, createdBy: null, generatedBySchedule: true, reviewedBy: "c" })).toBeNull();
  });
  it("a Super Admin may issue their own draft only with a reason", () => {
    expect(issueBlocker({ ...base, issuerId: "a", isSuperAdmin: true })).toMatch(/reason/);
    expect(issueBlocker({ ...base, issuerId: "a", isSuperAdmin: true, selfReason: "Month-end close" })).toBeNull();
  });
});

describe("commission payouts", () => {
  it("a payment on Feb 10 queues payouts for Mar 31", () => {
    expect(payoutDueDate("2026-02-10")).toBe("2026-03-31");
  });
  it("only Finance, the CRO or the CEO can confirm a payout", () => {
    expect([...PAYOUT_RECORDERS].sort()).toEqual(["cro", "executive", "finance"]);
  });
});
