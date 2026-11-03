/** Browser-safe projections shared by the task list and authorized task readers. */
export type TaskFacts = {
  created_by: string; assignee_user_id?: string | null; handoff_to_user_id?: string | null;
  team?: string | null; status: string; next_action?: string | null; follow_up_date?: string | null;
};

export function canViewTask(t: TaskFacts, viewer: string, visible: Set<string>, seeAll: boolean, teams: string[]) {
  return seeAll || t.created_by === viewer || t.handoff_to_user_id === viewer
    || Boolean(t.assignee_user_id && visible.has(t.assignee_user_id))
    || Boolean(!t.assignee_user_id && t.team && teams.includes(t.team));
}

export const ownsTask = (t: TaskFacts, viewer: string) => (t.assignee_user_id ?? t.created_by) === viewer;
export const openTask = (t: TaskFacts) => !["done", "cancelled"].includes(t.status);
export const taskNeedsNext = (t: TaskFacts, viewer: string) => openTask(t) && ownsTask(t, viewer) && !t.next_action?.trim() && !t.handoff_to_user_id;
export const taskFollowUpDue = (t: TaskFacts, viewer: string, today: string) => openTask(t) && ownsTask(t, viewer) && Boolean(t.follow_up_date && t.follow_up_date <= today);
export const assignedToViewer = (t: TaskFacts, viewer: string) => ownsTask(t, viewer) || t.handoff_to_user_id === viewer;

export function actionAlertTarget(kind: string, id: string) {
  return kind === "handoff" || kind === "handoff_issue"
    ? { href: "/ops/tasks", search: { task: id } }
    : { href: "/ops/software-issues", search: { issue: id } };
}