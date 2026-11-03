import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>, calls: [] as { table: string; op: string; args: any[] }[], failures: new Set<string>(),
  roles: ["operations"], visible: new Set(["viewer"]), rpc: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/staff-directory.server", () => ({
  STAFF_ROLE_SET: ["operations", "leadership"],
  TEAMS: { operations: { roles: ["operations"] } },
  isLeader: () => false,
  viewerScope: async () => ({
    db, roles: fixture.roles, staff: new Map([["viewer", ["operations"]], ["colleague", ["operations"]]]),
    visible: fixture.visible, leader: false,
  }),
}));
const db = {
  rpc: fixture.rpc,
  from(table: string) {
    let rows = [...(fixture.tables[table] ?? [])];
    const q: any = {
      select: () => q,
      eq: (key: string, value: any) => { rows = rows.filter((r) => r[key] === value); return q; },
      neq: (key: string, value: any) => { fixture.calls.push({ table, op: "neq", args: [key, value] }); rows = rows.filter((r) => r[key] !== value); return q; },
      in: (key: string, values: any[]) => { rows = rows.filter((r) => values.includes(r[key])); return q; },
      not: (key: string, op: string, value: any) => {
        rows = rows.filter((r) => op === "is" ? r[key] != null : !String(value).replace(/[()]/g, "").split(",").includes(r[key])); return q;
      },
      order: () => q,
      limit: (n: number) => { rows = rows.slice(0, n); return q; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: fixture.failures.has(table) ? { message: "failed" } : null }),
      update: () => { fixture.calls.push({ table, op: "update", args: [] }); return q; },
      insert: () => q,
      then: (resolve: any) => resolve({ data: rows, error: fixture.failures.has(table) ? { message: "failed" } : null }),
    };
    return q;
  },
};
import { listTasks, myActionAlerts, taskHistory, transitionTask, updateTask, setResponsibility } from "./staff-tasks.server";
import { listIssues } from "./software-issues.server";

beforeEach(() => {
  fixture.tables = { staff_tasks: [{ id: "private", created_by: "other", assignee_user_id: "other", status: "open" }], profiles: [], software_issues: [], software_issue_events: [] };
  fixture.calls = []; fixture.failures.clear(); fixture.roles = ["operations"]; fixture.visible = new Set(["viewer"]); fixture.rpc.mockClear();
});
describe("task access is consistent across readers and actions", () => {
  it("withholds unrelated task history", async () => {
    await expect(taskHistory("viewer", "private")).rejects.toThrow("outside your work access");
  });
  it("withholds unrelated task edits", async () => {
    await expect(updateTask("viewer", { id: "private", status: "cancelled" })).rejects.toThrow("outside your work access");
    expect(fixture.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });
  it("withholds unrelated responsibility edits", async () => {
    await expect(setResponsibility("viewer", { id: "private", status: "HARMONIOUS_HANDLING", reason: "Follow up" })).rejects.toThrow("outside your work access");
  });
  it("checks visibility before calling the privileged transition", async () => {
    await expect(transitionTask("viewer", { id: "private", action: "complete", payload: { note: "Done" } })).rejects.toThrow("outside your work access");
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("rejects a handoff to a non-staff recipient", async () => {
    fixture.tables["staff_tasks"] = [{ id: "owned", created_by: "viewer", status: "open" }];
    await expect(transitionTask("viewer", { id: "owned", action: "request_handoff", payload: { to: "outsider" } })).rejects.toThrow("Harmonious staff");
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("does not let closed history displace older open tasks", async () => {
    fixture.tables["staff_tasks"] = [...Array.from({ length: 2100 }, (_, n) => ({ id: `closed-${n}`, created_by: "viewer", status: "done" })), { id: "old-open", created_by: "viewer", status: "open" }];
    const result = await listTasks("viewer");
    expect(result.rows.some((r) => r.id === "old-open")).toBe(true);
    expect(result.partial).toBe(true);
  });
});
describe("daily alerts and software issue reads", () => {
  it("pending handoff alerts open the exact task and disappear when closed", async () => {
    fixture.tables["staff_tasks"] = [{ id: "handoff-1", title: "Review statement", handoff_to_user_id: "viewer", handoff_from_user_id: "colleague", status: "open" }];
    const result = await myActionAlerts("viewer");
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.search).toEqual({ task: "handoff-1" });
    fixture.tables["staff_tasks"][0].status = "done";
    expect((await myActionAlerts("viewer")).alerts).toHaveLength(0);
  });
  it("fails visibly instead of presenting partial alert counts as clear", async () => {
    fixture.failures.add("software_issues");
    await expect(myActionAlerts("viewer")).rejects.toThrow("couldn't load");
  });
  it("older open software issues survive resolved history", async () => {
    fixture.tables["software_issues"] = [...Array.from({ length: 600 }, (_, n) => ({ id: `closed-${n}`, stage: "resolved" })), { id: "open-issue", stage: "reported", technical_owner_user_id: "viewer" }];
    const result = await listIssues("viewer");
    expect(result.issues.map((i) => i.id)).toEqual(["open-issue"]);
    expect(fixture.calls).toContainEqual({ table: "software_issues", op: "neq", args: ["stage", "resolved"] });
  });
  it("loads a selected resolved issue even when the open filter is active", async () => {
    fixture.tables["software_issues"] = [{ id: "selected", stage: "resolved" }];
    expect((await listIssues("viewer", { issue: "selected" })).issues.map((i) => i.id)).toEqual(["selected"]);
  });
  it("does not hide issue-history failures", async () => {
    fixture.tables["software_issues"] = [{ id: "selected", stage: "reported" }]; fixture.failures.add("software_issue_events");
    await expect(listIssues("viewer")).rejects.toThrow("history couldn't load");
  });
  it("does not offer issue transitions to view-only staff", async () => {
    fixture.roles = ["leadership"];
    fixture.tables["software_issues"] = [{ id: "selected", stage: "reported", technical_owner_user_id: "viewer" }];
    expect((await listIssues("viewer")).issues[0]?.steps_allowed).toEqual([]);
  });
});