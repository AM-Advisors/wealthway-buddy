import { describe, expect, it } from "vitest";
import { canManageTech, errorFingerprint, groupErrors, reporterStatus, shouldAlertError, triageProblem } from "@/lib/tech-model";

describe("who runs the Tech workspace", () => {
  it("Super Admin, Product Reviewer and Tech team triage; other staff only view", () => {
    for (const r of ["super_admin", "product_reviewer", "tech_team"]) expect(canManageTech([r])).toBe(true);
    expect(canManageTech(["operations"])).toBe(false);
    expect(canManageTech(["executive"])).toBe(false);
  });
});

describe("triage", () => {
  const ok = { roles: ["tech_team"], status: "received" as const };
  it("not planned and needs info need a note the reporter will see", () => {
    expect(triageProblem({ ...ok, action: "not_planned" })).toMatch(/reason/);
    expect(triageProblem({ ...ok, action: "needs_info", note: "" })).toMatch(/information/);
    expect(triageProblem({ ...ok, action: "not_planned", note: "Out of scope for now" })).toBeNull();
  });
  it("merge needs another report", () => {
    expect(triageProblem({ ...ok, action: "merge", selfId: "a", mergeInto: "a" })).toMatch(/combine/);
    expect(triageProblem({ ...ok, action: "merge", selfId: "a", mergeInto: "b" })).toBeNull();
  });
  it("non-managers and released reports are blocked", () => {
    expect(triageProblem({ roles: ["operations"], status: "received", action: "accept" })).not.toBeNull();
    expect(triageProblem({ ...ok, status: "released", action: "accept" })).toMatch(/released/);
  });
  it("reporters see In progress once the item is in Now", () => {
    expect(reporterStatus("accepted", "now")).toBe("In progress");
    expect(reporterStatus("accepted", "later")).toBe("Planned");
    expect(reporterStatus("not_planned", null)).toBe("Not planned");
  });
});

describe("caught errors", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  it("groups by message and screen, never by record id", () => {
    expect(errorFingerprint("TypeError", "/ops/fund/0d29ab32-07e0-42f9-a3fc-80d86f0b9c9a?tab=x")).toBe("error:TypeError|/ops/fund/:record");
    const g = groupErrors([
      { action: "TypeError", path: "/ops/fund/0d29ab32-07e0-42f9-a3fc-80d86f0b9c9a", created_at: "2026-11-18T11:30:00Z", user_id: "u1" },
      { action: "TypeError", path: "/ops/fund/1d29ab32-07e0-42f9-a3fc-80d86f0b9c9a", created_at: "2026-11-18T09:00:00Z", user_id: "u2" },
    ], now);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ count: 2, people: 2, lastHour: 1 });
  });
  it("alerts at 5 in an hour", () => {
    expect(shouldAlertError({ lastHour: 4 })).toBe(false);
    expect(shouldAlertError({ lastHour: 5 })).toBe(true);
  });
});
