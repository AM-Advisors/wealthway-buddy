import { describe, it, expect } from "vitest";
import { ruleFor, dueDateFor, nextDue, stateFromAddress, entityKindOf, urgency, reminderStage } from "./state-filing-rules";

describe("state filing rules", () => {
  it("Delaware LLC is due June 1 with $300", () => {
    const r = ruleFor("DE", "LLC")!; expect(r.feeCents).toBe(30000);
    expect(dueDateFor(r, 2027, null)).toBe("2027-06-01");
  });
  it("Texas is due May 15, moved to Monday when on a weekend", () => {
    expect(dueDateFor(ruleFor("TX", "LP")!, 2027, null)).toBe("2027-05-17"); // May 15 2027 is a Saturday
  });
  it("Wyoming is due the first day of the anniversary month", () => {
    expect(dueDateFor(ruleFor("WY", "LLC")!, 2027, "2025-09-12")).toBe("2027-09-01");
    expect(dueDateFor(ruleFor("WY", "LLC")!, 2027, null)).toBeNull();
  });
  it("New York biennial only in alternating years", () => {
    const r = ruleFor("NY", "LLC")!;
    expect(dueDateFor(r, 2026, "2024-03-05")).toBe("2026-03-31");
    expect(dueDateFor(r, 2027, "2024-03-05")).toBeNull();
  });
  it("rolls forward after a year is filed", () => {
    const r = ruleFor("DE", "LLC")!;
    expect(nextDue(r, "2024-02-01", [], "2026-11-18")?.year).toBe(2025);
    expect(nextDue(r, "2024-02-01", [2025, 2026], "2026-11-18")).toEqual({ year: 2027, due: "2027-06-01" });
  });
  it("reads state from address and entity kind", () => {
    expect(stateFromAddress("100 Main St, Austin, TX 78701")).toBe("TX");
    expect(entityKindOf("Limited Partnership")).toBe("LP");
    expect(entityKindOf("Series LLC")).toBe("LLC");
  });
  it("urgency and reminders", () => {
    expect(urgency("2026-11-01", "2026-11-18")).toBe("past_due");
    expect(urgency("2026-12-10", "2026-11-18")).toBe("due_soon");
    expect(reminderStage("2027-01-10", "2026-11-18")).toBe(60);
    expect(reminderStage("2026-11-22", "2026-11-18")).toBe(7);
  });
});
