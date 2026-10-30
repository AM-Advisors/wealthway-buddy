import { describe, expect, it } from "vitest";
import { evaluateReadiness } from "./fund-setup-model";

describe("launch blockers", () => {
  it("reports unfinished required tasks once", () => {
    const result = evaluateReadiness({ conditions: [{ conditionKey: "blocking_tasks_complete", label: "All blocking setup tasks complete", required: true, satisfied: false }], tasks: [{ status: "review", blocking: true }, { status: "not_started", blocking: true }], harmoniousApproved: true });
    expect(result.unmet).toEqual([{ key: "blocking_tasks_complete", label: "2 blocking setup tasks outstanding" }]);
    expect(result.ready).toBe(false);
  });
  it("completed tasks are not blocked by a stale duplicate summary", () => {
    expect(evaluateReadiness({ conditions: [{ conditionKey: "blocking_tasks_complete", label: "All blocking setup tasks complete", required: true, satisfied: false }], tasks: [{ status: "complete", blocking: true }], harmoniousApproved: true }).ready).toBe(true);
  });
  it("still requires explicit economics approval", () => {
    expect(evaluateReadiness({ conditions: [{ conditionKey: "economics_approved", label: "Approved economic terms", required: true, satisfied: false }], tasks: [], harmoniousApproved: true }).ready).toBe(false);
  });
});