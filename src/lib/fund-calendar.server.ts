/**
 * Fund Operating Calendar. Server-only. Reads re-check fund access; clients only see client-visible items
 * without internal notes. Writes (items, rules, schedule generation, task generation) are Harmonious staff only.
 * Generation is an explicit staff action — page views never change state. Dedupe: recurring items by
 * (fund, source, source_ref = rule:period); tasks by (source='calendar', source_ref = item id) + item.task_id.
 */
import { CALENDAR_TEMPLATES, occurrences, taskDue, type Cadence } from "@/lib/fund-calendar-templates";

async function admin() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any; }

export async function staffWriter(uid: string) {
  const { viewerScope, STAFF_ROLE_SET } = await import("@/lib/staff-directory.server");
  const s = await viewerScope(uid).catch(() => null);
  if (!s || !s.roles.some((r) => r !== "leadership" && STAFF_ROLE_SET.includes(r))) throw new Error("Only Harmonious staff can change the operating calendar.");
  return s;
}

const CLIENT_COLS = "id, fund_id, title, category, due_date, start_date, period_label, responsible_party, status, report_status, notes_client, source, task_id";
const STAFF_COLS = `${CLIENT_COLS}, responsible_team, client_visibility, notes_internal, rule_id, generate_task, task_lead_days, workflow_type, workflow_id, source_ref, created_at`;

export async function listCalendar(uid: string, fundId: string) {
  const { assertFund } = await import("@/lib/fund-tabs.server");
  const { staff } = await assertFund(uid, fundId);
  const db = await admin();
  let q = db.from("fund_calendar_items").select(staff ? STAFF_COLS : CLIENT_COLS).eq("fund_id", fundId).neq("status", "CANCELLED").order("due_date").limit(1000);
  if (!staff) q = q.eq("client_visibility", true);
  const [{ data: items }, rules] = await Promise.all([
    q,
    staff ? db.from("fund_calendar_rules").select("*").eq("fund_id", fundId).order("created_at") : Promise.resolve({ data: [] }),
  ]);
  return { staff, items: (items ?? []) as any[], rules: ((rules as any).data ?? []) as any[] };
}

export async function calendarHistory(uid: string, itemId: string) {
  await staffWriter(uid);
  const db = await admin();
  const { data } = await db.from("fund_calendar_events").select("*").eq("item_id", itemId).order("created_at");
  return (data ?? []) as any[];
}

export async function saveItem(uid: string, d: {
  id?: string | undefined; fundId: string; title: string; category: string; dueDate: string; startDate?: string | null | undefined;
  responsibleParty: string; responsibleTeam?: string | null | undefined; clientVisible: boolean; status?: string | undefined; reportStatus?: string | null | undefined;
  notesInternal?: string | null | undefined; notesClient?: string | null | undefined; generateTask?: boolean | undefined; taskLeadDays?: number | undefined;
}) {
  await staffWriter(uid);
  const db = await admin();
  const row: any = {
    title: d.title, category: d.category, due_date: d.dueDate, start_date: d.startDate || null, responsible_party: d.responsibleParty,
    responsible_team: d.responsibleTeam || null, client_visibility: d.clientVisible, notes_internal: d.notesInternal || null,
    notes_client: d.notesClient || null, report_status: d.reportStatus || null, updated_at: new Date().toISOString(),
  };
  if (d.status) row.status = d.status;
  if (d.generateTask !== undefined) row.generate_task = d.generateTask;
  if (d.taskLeadDays !== undefined) row.task_lead_days = d.taskLeadDays;
  if (d.id) {
    const { data: cur } = await db.from("fund_calendar_items").select("fund_id").eq("id", d.id).maybeSingle();
    if (!cur || cur.fund_id !== d.fundId) throw new Error("Calendar item not found.");
    const { error } = await db.from("fund_calendar_items").update(row).eq("id", d.id);
    if (error) throw new Error(error.message);
    await db.from("fund_calendar_events").insert({ item_id: d.id, fund_id: d.fundId, actor_user_id: uid, kind: "edited_by", detail: {} });
    return { id: d.id };
  }
  const { data, error } = await db.from("fund_calendar_items").insert({ ...row, fund_id: d.fundId, source: "MANUAL", created_by: uid }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function saveRule(uid: string, d: {
  id: string; fundId: string; cadence: Cadence; dueDayOffset: number; annualMonth?: number | null | undefined; annualDay?: number | null | undefined;
  generateTask: boolean; taskLeadDays: number; active: boolean; clientVisible: boolean;
}) {
  await staffWriter(uid);
  const db = await admin();
  const { data: cur } = await db.from("fund_calendar_rules").select("fund_id").eq("id", d.id).maybeSingle();
  if (!cur || cur.fund_id !== d.fundId) throw new Error("Rule not found.");
  const { error } = await db.from("fund_calendar_rules").update({
    cadence: d.cadence, due_day_offset: d.dueDayOffset, annual_month: d.annualMonth ?? null, annual_day: d.annualDay ?? null,
    generate_task: d.generateTask, task_lead_days: d.taskLeadDays, active: d.active, client_visibility: d.clientVisible,
    created_by: uid, updated_at: new Date().toISOString(),
  }).eq("id", d.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Feature keys this fund is entitled to through its active Service Engagement(s). */
export async function entitledFeatures(db: any, fundId: string) {
  const { data: engs } = await db.from("service_engagements").select("id, service_product, service_level").eq("fund_id", fundId).not("service_status", "in", "(CANCELLED,EXPIRED)");
  const set = new Set<string>();
  for (const e of (engs ?? []) as any[]) {
    const [{ data: defs }, { data: ov }] = await Promise.all([
      db.from("service_level_entitlements").select("feature_key").eq("service_product", e.service_product).eq("service_level", e.service_level),
      db.from("service_engagement_entitlements").select("feature_key, mode").eq("engagement_id", e.id),
    ]);
    const removed = new Set(((ov ?? []) as any[]).filter((o) => o.mode === "REMOVE").map((o) => o.feature_key));
    for (const x of (defs ?? []) as any[]) if (!removed.has(x.feature_key)) set.add(x.feature_key);
    for (const o of (ov ?? []) as any[]) if (o.mode === "ADD") set.add(o.feature_key);
  }
  return { features: set, engagements: (engs ?? []) as any[] };
}

/** Staff action: add missing entitlement-based rules, then materialize the next 12 months of items. Idempotent. */
export async function generateSchedule(uid: string, fundId: string, today = new Date().toISOString().slice(0, 10)) {
  await staffWriter(uid);
  const db = await admin();
  const { features } = await entitledFeatures(db, fundId);
  const { data: existing } = await db.from("fund_calendar_rules").select("template_key").eq("fund_id", fundId);
  const have = new Set(((existing ?? []) as any[]).map((r) => r.template_key));
  const toAdd = CALENDAR_TEMPLATES.filter((t) => features.has(t.feature) && !have.has(t.key)).map((t) => ({
    fund_id: fundId, template_key: t.key, feature_key: t.feature, title: t.title, category: t.category, cadence: t.cadence,
    due_day_offset: t.offset ?? 0, annual_month: t.month ?? null, annual_day: t.day ?? null, responsible_team: t.team,
    generate_task: t.task, task_lead_days: t.lead, source: "ENTITLEMENT", created_by: uid,
  }));
  if (toAdd.length) { const { error } = await db.from("fund_calendar_rules").insert(toAdd); if (error) throw new Error(error.message); }
  const { data: rules } = await db.from("fund_calendar_rules").select("*").eq("fund_id", fundId).eq("active", true);
  const horizon = new Date(Date.parse(today) + 366 * 86_400_000).toISOString().slice(0, 10);
  const rows: any[] = [];
  for (const r of (rules ?? []) as any[]) {
    for (const o of occurrences(r, today, horizon)) rows.push({
      fund_id: fundId, title: `${r.title} — ${o.period}`, category: r.category, due_date: o.due, rule_id: r.id, period_label: o.period,
      responsible_party: r.responsible_party, responsible_team: r.responsible_team, client_visibility: r.client_visibility,
      generate_task: r.generate_task, task_lead_days: r.task_lead_days, source: "RECURRING", source_ref: `${r.id}:${o.period}`,
      report_status: r.category === "REPORTING" ? "SCHEDULED" : null, created_by: uid,
    });
  }
  let created = 0;
  if (rows.length) {
    const { data, error } = await db.from("fund_calendar_items").upsert(rows, { onConflict: "fund_id,source,source_ref", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(error.message);
    created = (data ?? []).length;
  }
  const tasks = await generateDueTasks(uid, fundId, today);
  return { rulesAdded: toAdd.length, itemsCreated: created, tasksCreated: tasks.created };
}

/** Create tasks for calendar items whose lead time has arrived. Never duplicates (item.task_id + unique source_ref). */
export async function generateDueTasks(uid: string, fundId: string, today = new Date().toISOString().slice(0, 10)) {
  await staffWriter(uid);
  const db = await admin();
  const { data } = await db.from("fund_calendar_items").select("*").eq("fund_id", fundId).eq("generate_task", true).is("task_id", null).eq("status", "SCHEDULED");
  let created = 0;
  for (const i of (data ?? []) as any[]) {
    if (!taskDue(i.due_date, i.task_lead_days, today)) continue;
    const { data: prior } = await db.from("staff_tasks").select("id").eq("source", "calendar").eq("source_ref", i.id).maybeSingle();
    let taskId = prior?.id as string | undefined;
    if (!taskId) {
      const { data: t, error } = await db.from("staff_tasks").insert({
        title: i.title, description: i.notes_client ?? null, priority: "normal", status: "open", team: i.responsible_team ?? "operations",
        offering_id: fundId, due_date: i.due_date, created_by: uid, source: "calendar", source_ref: i.id,
        responsibility_status: i.responsible_party === "COMPLETED" ? "HARMONIOUS_HANDLING" : i.responsible_party,
        client_visibility: i.client_visibility, related_workflow_type: "calendar_item", related_workflow_id: i.id,
      }).select("id").single();
      if (error) continue;
      taskId = t.id; created++;
      await db.from("staff_task_events").insert({ task_id: taskId, actor_user_id: uid, kind: "created", detail: { from_calendar: i.id } });
    }
    await db.from("fund_calendar_items").update({ task_id: taskId, updated_at: new Date().toISOString() }).eq("id", i.id).is("task_id", null);
  }
  return { created };
}
