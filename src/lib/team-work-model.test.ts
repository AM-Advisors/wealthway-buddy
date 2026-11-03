import { describe, expect, it } from "vitest";
import { actionAlertTarget, assignedToViewer, canViewTask, taskFollowUpDue, taskNeedsNext } from "./team-work-model";

const task = { created_by: "creator", assignee_user_id: "owner", status: "open" };
describe("daily team work", () => {
  it("includes pending handoffs in assigned-to-me work", () => {
    expect(assignedToViewer({ ...task, handoff_to_user_id: "receiver" }, "receiver")).toBe(true);
    expect(assignedToViewer(task, "receiver")).toBe(false);
  });
  it("keeps an unassigned task in its creator's work", () => {
    expect(assignedToViewer({ ...task, assignee_user_id: null }, "creator")).toBe(true);
    expect(assignedToViewer(task, "creator")).toBe(false);
  });
  it("requires next actions only on owned open tasks without pending handoffs", () => {
    expect(taskNeedsNext(task, "owner")).toBe(true);
    expect(taskNeedsNext({ ...task, next_action: "Call client" }, "owner")).toBe(false);
    expect(taskNeedsNext({ ...task, handoff_to_user_id: "receiver" }, "owner")).toBe(false);
    expect(taskNeedsNext({ ...task, status: "done" }, "owner")).toBe(false);
    expect(taskNeedsNext(task, "other")).toBe(false);
  });
  it("shows today's and overdue follow-ups, not future or completed work", () => {
    expect(taskFollowUpDue({ ...task, follow_up_date: "2026-11-03" }, "owner", "2026-11-03")).toBe(true);
    expect(taskFollowUpDue({ ...task, follow_up_date: "2026-11-02" }, "owner", "2026-11-03")).toBe(true);
    expect(taskFollowUpDue({ ...task, follow_up_date: "2026-11-04" }, "owner", "2026-11-03")).toBe(false);
    expect(taskFollowUpDue({ ...task, follow_up_date: "2026-11-03", status: "done" }, "owner", "2026-11-03")).toBe(false);
  });
  it("does not expose an unrelated task but preserves creator, receiver and team visibility", () => {
    expect(canViewTask(task, "outsider", new Set(["outsider"]), false, [])).toBe(false);
    expect(canViewTask(task, "creator", new Set(), false, [])).toBe(true);
    expect(canViewTask({ ...task, handoff_to_user_id: "receiver" }, "receiver", new Set(), false, [])).toBe(true);
    expect(canViewTask({ ...task, assignee_user_id: null, team: "finance" }, "finance-user", new Set(), false, ["finance"])).toBe(true);
  });
  it("alerts target the exact task and issue rather than just their lists", () => {
    expect(actionAlertTarget("handoff", "task-17")).toEqual({ href: "/ops/tasks", search: { task: "task-17" } });
    expect(actionAlertTarget("retest", "issue-23")).toEqual({ href: "/ops/software-issues", search: { issue: "issue-23" } });
  });
});