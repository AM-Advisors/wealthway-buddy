import { describe, expect, it } from "vitest";

import { canConfirm, nextDueDate, reminderStageFor, wantsReminder } from "@/lib/billing-model";
import { dedupeNav, extraGrantItems, grantCapabilities, grantableItem } from "@/lib/ops-nav-registry";

describe("payment reminders", () => {
  it("reminds at 30 and 7 days before, on the due date, and 7 and 14 days overdue", () => {
    expect(reminderStageFor("2026-11-30", "2026-10-31")?.key).toBe("before-30");
    expect(reminderStageFor("2026-11-07", "2026-10-31")?.key).toBe("before-7");
    expect(reminderStageFor("2026-10-31", "2026-10-31")?.key).toBe("due");
    expect(reminderStageFor("2026-10-24", "2026-10-31")?.key).toBe("overdue-7");
    expect(reminderStageFor("2026-10-17", "2026-10-31")?.key).toBe("overdue-14");
    expect(reminderStageFor("2026-11-10", "2026-10-31")).toBeNull();
  });
  it("never emails card-autopay or paused services", () => {
    const base = { status: "active", card_autopay: false, reminders_paused: false, amount_cents: 100 };
    expect(wantsReminder(base)).toBe(true);
    expect(wantsReminder({ ...base, card_autopay: true })).toBe(false);
    expect(wantsReminder({ ...base, reminders_paused: true })).toBe(false);
  });
  it("next due date moves past the confirmed paid-through date", () => {
    expect(nextDueDate({ cadence: "annual", startDate: "2026-01-15", paidThrough: null })).toBe("2026-01-15");
    expect(nextDueDate({ cadence: "annual", startDate: "2026-01-15", paidThrough: "2026-12-31" })).toBe("2027-01-15");
    expect(nextDueDate({ cadence: "quarterly", startDate: "2026-01-15", paidThrough: "2026-04-14" })).toBe("2026-04-15");
    expect(nextDueDate({ cadence: "one_time", startDate: "2026-01-15", paidThrough: "2026-01-15" })).toBeNull();
  });
});

describe("second-person confirmation", () => {
  it("needs someone else, or a Super Admin with a reason", () => {
    expect(canConfirm("a", "b", ["finance"], null).ok).toBe(true);
    expect(canConfirm("a", "a", ["finance"], "ok fine").ok).toBe(false);
    expect(canConfirm("a", "a", ["super_admin"], "").ok).toBe(false);
    expect(canConfirm("a", "a", ["super_admin"], "verified with bank").ok).toBe(true);
  });
});

describe("sidebar registry", () => {
  it("keeps each screen in only one place", () => {
    const out = dedupeNav([
      { id: "a", label: "A", items: [{ id: "funds", title: "Funds", url: "/ops/funds", icon: "x", sub: [{ title: "Migrations", url: "/ops/fund-migration/requests" }] }] },
      { id: "b", label: "B", items: [{ id: "mig", title: "Migrations", url: "/ops/fund-migration/requests", icon: "x" }, { id: "t", title: "Tasks", url: "/ops/tasks", icon: "x" }] },
    ]);
    expect(out[1]!.items.map((i) => i.title)).toEqual(["Tasks"]);
  });
  it("money, tax and administration screens can't be granted individually", () => {
    expect(grantableItem("/admin/funding")).toBeNull();
    expect(grantCapabilities(["/admin/funding"])).toEqual([]);
  });
  it("a granted screen appears as an extra item only when not already shown", () => {
    const g = grantableItem("/admin/pricing")!;
    expect(g).not.toBeNull();
    expect(extraGrantItems([], [{ url: g.url, title: g.title }]).length).toBe(1);
    expect(extraGrantItems([{ id: "x", label: "X", items: [{ id: "p", title: "P", url: g.url, icon: "x" }] }], [{ url: g.url, title: g.title }]).length).toBe(0);
  });
});
