/**
 * Staff task tickets. Server-only. Any Harmonious staff member (except view-only Leadership)
 * may create a task and assign it to any staff member. Visibility: your own, ones you created,
 * your reporting line's, and all for leaders. Every change appends to staff_task_events.
 * Tasks never grant access or gate other work.
 */
import { viewerScope, isLeader, STAFF_ROLE_SET, TEAMS } from "@/lib/staff-directory.server";

export const TASK_STATUSES = ["open", "in_progress", "blocked", "done", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

async function ctx(viewer: string) {
  const s = await viewerScope(viewer);
  const canWrite = s.roles.some((r) => r !== "leadership" && STAFF_ROLE_SET.includes(r));
  return { ...s, canWrite };
}

async function names(db: any, ids: string[]) {
  const u = [...new Set(ids.filter(Boolean))];
  if (!u.length) return new Map<string, string>();
  const { data } = await db.from("profiles").select("user_id, email, legal_name").in("user_id", u);
  return new Map<string, string>(((data ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Staff member"]));
}

export async function listTasks(viewer: string) {
  const { db, staff, visible, leader, roles, canWrite } = await ctx(viewer);
  const { data, error } = await db.from("staff_tasks").select("*").order("created_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  const all = (data ?? []) as any[];
  const seeAll = leader || roles.includes("leadership");
  const rows = all.filter((t) => seeAll || t.created_by === viewer || (t.assignee_user_id && visible.has(t.assignee_user_id)) || (!t.assignee_user_id && t.team && ((TEAMS as any)[t.team]?.roles ?? []).some((r: string) => roles.includes(r))));
  const nm = await names(db, [...staff.keys(), ...rows.map((r) => r.created_by)]);
  const clientIds = [...new Set(rows.map((r) => r.client_id).filter(Boolean))];
  const { data: cl } = clientIds.length ? await db.from("clients").select("id, name").in("id", clientIds) : { data: [] };
  const cm = new Map(((cl ?? []) as any[]).map((c) => [c.id, c.name]));
  return {
    viewer, canWrite, seeAll,
    staff: [...staff.keys()].map((id) => ({ id, name: nm.get(id) ?? "Staff member" })).sort((a, b) => a.name.localeCompare(b.name)),
    rows: rows.map((t) => ({ ...t, assigneeName: t.assignee_user_id ? nm.get(t.assignee_user_id) ?? "Staff member" : null, creatorName: t.created_by ? nm.get(t.created_by) ?? "" : "", clientName: t.client_id ? cm.get(t.client_id) ?? null : null })),
  };
}

const log = (db: any, task: string, actor: string, kind: string, detail: Record<string, unknown>) =>
  db.from("staff_task_events").insert({ task_id: task, actor_user_id: actor, kind, detail });

export async function createTask(viewer: string, d: { title: string; description?: string | null | undefined; priority: string; team?: string | null | undefined; assignee?: string | null | undefined; dueDate?: string | null | undefined }) {
  const { db, staff, canWrite } = await ctx(viewer);
  if (!canWrite) throw new Error("Your role can view tasks but not create them.");
  if (d.assignee && !staff.has(d.assignee)) throw new Error("Tasks can only be assigned to Harmonious staff.");
  const { data, error } = await db.from("staff_tasks").insert({
    title: d.title, description: d.description || null, priority: d.priority, team: d.team || null,
    assignee_user_id: d.assignee || null, due_date: d.dueDate || null, created_by: viewer,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await log(db, data.id, viewer, "created", { assignee: d.assignee ?? null });
  return { id: data.id as string };
}

export async function updateTask(viewer: string, d: { id: string; status?: string | undefined; priority?: string | undefined; assignee?: string | null | undefined; dueDate?: string | null | undefined; note?: string | null | undefined }) {
  const { db, staff, canWrite } = await ctx(viewer);
  if (!canWrite) throw new Error("Your role can view tasks but not change them.");
  const { data: t } = await db.from("staff_tasks").select("*").eq("id", d.id).maybeSingle();
  if (!t) throw new Error("Task not found.");
  const patch: any = { updated_at: new Date().toISOString() };
  const changes: any = {};
  if (d.status && d.status !== t.status) { patch.status = d.status; patch.completed_at = d.status === "done" ? new Date().toISOString() : null; changes.status = [t.status, d.status]; }
  if (d.priority && d.priority !== t.priority) { patch.priority = d.priority; changes.priority = [t.priority, d.priority]; }
  if (d.assignee !== undefined && d.assignee !== t.assignee_user_id) {
    if (d.assignee && !staff.has(d.assignee)) throw new Error("Tasks can only be assigned to Harmonious staff.");
    patch.assignee_user_id = d.assignee; changes.assignee = [t.assignee_user_id, d.assignee];
  }
  if (d.dueDate !== undefined && d.dueDate !== t.due_date) { patch.due_date = d.dueDate || null; changes.due = [t.due_date, d.dueDate]; }
  if (Object.keys(changes).length) {
    const { error } = await db.from("staff_tasks").update(patch).eq("id", d.id);
    if (error) throw new Error(error.message);
    await log(db, d.id, viewer, "updated", changes);
  }
  if (d.note?.trim()) await log(db, d.id, viewer, "comment", { text: d.note.trim().slice(0, 4000) });
  return { ok: true };
}

export async function taskHistory(viewer: string, id: string) {
  const { db } = await ctx(viewer);
  const { data } = await db.from("staff_task_events").select("*").eq("task_id", id).order("created_at");
  const rows = (data ?? []) as any[];
  const nm = await names(db, rows.map((r) => r.actor_user_id));
  return rows.map((r) => ({ id: r.id, kind: r.kind, detail: r.detail, at: r.created_at, who: nm.get(r.actor_user_id) ?? "System" }));
}

export { isLeader };
