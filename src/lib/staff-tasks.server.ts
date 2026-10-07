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
  const fundIds = [...new Set(rows.map((r) => r.offering_id).filter(Boolean))];
  const invIds = [...new Set(rows.map((r) => r.related_investor_id).filter(Boolean))];
  const [{ data: funds }, { data: engs }, { data: invs }] = await Promise.all([
    fundIds.length ? db.from("offerings").select("id, name").in("id", fundIds) : Promise.resolve({ data: [] }),
    fundIds.length ? db.from("service_engagements").select("fund_id, service_level, primary_administrator_user_id, relationship_lead_user_id, service_status").in("fund_id", fundIds).not("service_status", "in", "(CANCELLED,EXPIRED)") : Promise.resolve({ data: [] }),
    invIds.length ? db.from("investment_profiles").select("id, legal_name").in("id", invIds) : Promise.resolve({ data: [] }),
  ]);
  const fm = new Map(((funds ?? []) as any[]).map((f) => [f.id, f.name]));
  const em = new Map<string, any>(); for (const e of (engs ?? []) as any[]) if (!em.has(e.fund_id)) em.set(e.fund_id, e);
  const im = new Map(((invs ?? []) as any[]).map((i) => [i.id, i.legal_name]));
  return {
    viewer, canWrite, seeAll,
    staff: [...staff.keys()].map((id) => ({ id, name: nm.get(id) ?? "Staff member" })).sort((a, b) => a.name.localeCompare(b.name)),
    rows: rows.map((t) => ({ ...t, assigneeName: t.assignee_user_id ? nm.get(t.assignee_user_id) ?? "Staff member" : null, creatorName: t.created_by ? nm.get(t.created_by) ?? "" : "", clientName: t.client_id ? cm.get(t.client_id) ?? null : null,
      fundName: t.offering_id ? fm.get(t.offering_id) ?? null : null,
      serviceLevel: t.offering_id ? em.get(t.offering_id)?.service_level ?? null : null,
      primaryAdministratorId: t.offering_id ? em.get(t.offering_id)?.primary_administrator_user_id ?? null : null,
      relationshipLeadId: t.offering_id ? em.get(t.offering_id)?.relationship_lead_user_id ?? null : null,
      investorName: t.related_investor_id ? im.get(t.related_investor_id) ?? null : null })),
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

const THIRD = ["BANK","AUDITOR","TAX_PREPARER","ATTORNEY","CUSTODIAN","TRANSFER_AGENT","REGISTERED_AGENT","VALUATION_PROVIDER","ISSUER","OTHER"];

/** Manual responsibility correction — Harmonious staff with write access only; reason required and logged. */
export async function setResponsibility(viewer: string, d: {
  id: string; status: string; reason: string; responsibleUserId?: string | null | undefined; responsibleTeam?: string | null | undefined;
  waitingOnType?: string | null | undefined; waitingOnName?: string | null | undefined; relatedInvestorId?: string | null | undefined;
  noteInternal?: string | null | undefined; noteClient?: string | null | undefined; clientVisible?: boolean | undefined; slaDueDate?: string | null | undefined;
}) {
  const { db, staff, canWrite } = await ctx(viewer);
  if (!canWrite) throw new Error("Only Harmonious staff can change who an item is waiting on.");
  const { asResponsibility } = await import("@/lib/responsibility");
  if (asResponsibility(d.status) !== d.status) throw new Error("Unknown responsibility status.");
  if (d.reason.trim().length < 5) throw new Error("Give a short reason for the change.");
  if (d.responsibleUserId && !staff.has(d.responsibleUserId)) throw new Error("Responsible person must be Harmonious staff.");
  if (d.waitingOnType && !THIRD.includes(d.waitingOnType)) throw new Error("Unknown third-party type.");
  const { data: t } = await db.from("staff_tasks").select("*").eq("id", d.id).maybeSingle();
  if (!t) throw new Error("Task not found.");
  if (d.status === "COMPLETED" && !["done", "cancelled"].includes(t.status)) throw new Error("Mark the task Done to complete it.");
  if (d.status !== "COMPLETED" && ["done", "cancelled"].includes(t.status)) throw new Error("Reopen the task before changing who it is waiting on.");
  const patch: any = {
    responsibility_status: d.status, responsibility_manual: true, updated_at: new Date().toISOString(),
    waiting_on_type: d.status === "WAITING_ON_THIRD_PARTY" ? d.waitingOnType ?? null : null,
    waiting_on_name: ["WAITING_ON_THIRD_PARTY", "WAITING_ON_INVESTOR"].includes(d.status) ? d.waitingOnName?.trim() || null : null,
  };
  if (d.responsibleUserId !== undefined) patch.responsible_user_id = d.responsibleUserId;
  if (d.responsibleTeam !== undefined) patch.responsible_team = d.responsibleTeam;
  if (d.relatedInvestorId !== undefined) patch.related_investor_id = d.relatedInvestorId;
  if (d.noteInternal !== undefined) patch.responsibility_note_internal = d.noteInternal?.trim() || null;
  if (d.noteClient !== undefined) patch.responsibility_note_client = d.noteClient?.trim() || null;
  if (d.clientVisible !== undefined) patch.client_visibility = d.clientVisible;
  if (d.slaDueDate !== undefined) patch.sla_due_date = d.slaDueDate || null;
  const { error } = await db.from("staff_tasks").update(patch).eq("id", d.id);
  if (error) throw new Error(error.message);
  await log(db, d.id, viewer, "responsibility", { from: t.responsibility_status, to: d.status, reason: d.reason.trim().slice(0, 1000), manual: true, waiting_on: patch.waiting_on_name ?? patch.waiting_on_type ?? null });
  const { responsibilityAlerts } = await import("@/lib/responsibility");
  return { ok: true, alerts: responsibilityAlerts({ ...t, ...patch }, t.responsibility_status) };
}

/** Client-safe task list for one fund: only client-visible tasks, no internal notes or third-party names. */
export async function listClientFundTasks(viewer: string, fundId: string) {
  const { assertFund } = await import("@/lib/fund-tabs.server");
  await assertFund(viewer, fundId);
  const { db } = await ctx(viewer).catch(async () => ({ db: (await import("@/integrations/supabase/client.server")).supabaseAdmin as any }));
  const { data } = await db.from("staff_tasks")
    .select("id, title, status, priority, due_date, sla_due_date, responsibility_status, waiting_on_type, responsibility_note_client, related_investor_id, approval_type, approval_amount, approval_due_date, information_request_type, requested_information, updated_at")
    .eq("offering_id", fundId).eq("client_visibility", true).order("due_date", { ascending: true, nullsFirst: false }).limit(500);
  const rows = (data ?? []) as any[];
  const invIds = [...new Set(rows.map((r) => r.related_investor_id).filter(Boolean))];
  const { data: invs } = invIds.length ? await db.from("investment_profiles").select("id, legal_name").in("id", invIds) : { data: [] };
  const im = new Map(((invs ?? []) as any[]).map((i) => [i.id, i.legal_name]));
  return rows.map(({ related_investor_id, ...r }) => ({ ...r, investorName: related_investor_id ? im.get(related_investor_id) ?? null : null }));
}

export { isLeader };
