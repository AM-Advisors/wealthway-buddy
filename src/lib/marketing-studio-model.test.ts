import { describe, expect, it } from "vitest";
import { moveProblem, weekStart, isLocked } from "./marketing-studio-model";

const base = { actorId: "a", authorId: "b", publishAt: null as string | null };
describe("marketing studio workflow", () => {
  it("allows one step forward for contributors", () => {
    expect(moveProblem({ ...base, from: "idea", to: "researching", roles: ["marketing_contributor"] })).toBeNull();
    expect(moveProblem({ ...base, from: "idea", to: "drafting", roles: ["marketing_manager"] })).toMatch(/one step/);
  });
  it("requires a reviewer other than the author", () => {
    expect(moveProblem({ ...base, from: "fact_check", to: "design", roles: ["marketing_contributor"] })).toMatch(/reviewer/);
    expect(moveProblem({ ...base, authorId: "a", from: "fact_check", to: "design", roles: ["compliance_reviewer"] })).toMatch(/other than/);
    expect(moveProblem({ ...base, from: "fact_check", to: "design", roles: ["compliance_reviewer"] })).toBeNull();
  });
  it("approval needs an executive, never the author (super admin needs a reason)", () => {
    expect(moveProblem({ ...base, from: "ceo_approval", to: "approved", roles: ["marketing_manager"] })).toMatch(/executive/);
    expect(moveProblem({ ...base, authorId: "a", from: "ceo_approval", to: "approved", roles: ["executive"] })).toMatch(/other than/);
    expect(moveProblem({ ...base, authorId: "a", from: "ceo_approval", to: "approved", roles: ["super_admin"] })).toMatch(/reason/);
    expect(moveProblem({ ...base, authorId: "a", from: "ceo_approval", to: "approved", roles: ["super_admin"], note: "CEO away" })).toBeNull();
  });
  it("scheduling needs a date; sending back needs a reason; published is final", () => {
    expect(moveProblem({ ...base, from: "approved", to: "scheduled", roles: ["marketing_manager"] })).toMatch(/date/);
    expect(moveProblem({ ...base, from: "design", to: "drafting", roles: ["marketing_contributor"] })).toMatch(/why/);
    expect(moveProblem({ ...base, from: "published", to: "drafting", roles: ["admin"], note: "x" })).toMatch(/can't/);
    expect(isLocked("approved")).toBe(true);
    expect(isLocked("design")).toBe(false);
  });
  it("week starts on Monday", () => {
    expect(weekStart(new Date("2026-10-08T12:00:00Z"))).toBe("2026-10-05");
    expect(weekStart(new Date("2026-10-11T12:00:00Z"))).toBe("2026-10-05");
  });
});
