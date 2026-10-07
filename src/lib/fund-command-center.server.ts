/**
 * Fund Manager Command Center data — one aggregate call (parallel queries, no per-row lookups).
 * Clients get client-visible tasks/items only, no internal notes, no third-party names. Staff additionally
 * receive internal counts (internal tasks, SLA risk). Read-only: never changes state.
 */
import { fundHealth } from "@/lib/fund-command-health";
import { responsibilityCounts, waitingOnDetail, daysOverdue, isOpenTask } from "@/lib/responsibility";

const TEAM = [
  ["primary_administrator_user_id", "Primary Administrator"], ["relationship_lead_user_id", "Relationship Lead"],
  ["secondary_administrator_user_id", "Administrator"], ["accounting_lead_user_id", "Accounting Lead"],
  ["tax_coordinator_user_id", "Tax Coordinator"], ["compliance_coordinator_user_id", "Compliance Coordinator"],
] as const;

export async function commandCenter(uid: string, fundId: string) {
  const { assertFund } = await import("@/lib/fund-tabs.server");
  const { staff } = await assertFund(uid, fundId);
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);

  let tq = db.from("staff_tasks").select("id, title, status, priority, due_date, sla_due_date, responsibility_status, waiting_on_type, waiting_on_name, responsibility_note_client, related_investor_id, approval_amount, client_visibility, updated_at").eq("offering_id", fundId).limit(1000);
  let cq = db.from("fund_calendar_items").select("id, title, category, due_date, status, report_status, responsible_party, period_label, task_id, client_visibility").eq("fund_id", fundId).neq("status", "CANCELLED").gte("due_date", from).lte("due_date", to).order("due_date").limit(1000);
  if (!staff) { tq = tq.eq("client_visibility", true); cq = cq.eq("client_visibility", true); }

  const [{ data: fund }, { data: engs }, { data: tasksRaw }, { data: itemsRaw }, { data: calls }] = await Promise.all([
    db.from("offerings").select("id, name, legal_entity_name").eq("id", fundId).maybeSingle(),
    db.from("service_engagements").select(`service_product, service_level, service_status, ${TEAM.map((t) => t[0]).join(", ")}`).eq("fund_id", fundId).not("service_status", "in", "(CANCELLED,EXPIRED)").order("created_at", { ascending: false }).limit(1),
    tq, cq,
    db.from("capital_calls").select("id, title, call_number, due_date, status, total_called_cents, total_received_cents, superseded_at, closed_at").eq("offering_id", fundId).is("superseded_at", null).is("closed_at", null).not("status", "in", "(cancelled,closed,draft,superseded)").order("due_date", { ascending: false }).limit(3),
  ]);
  const tasks = (tasksRaw ?? []) as any[]; const items = (itemsRaw ?? []) as any[];
  const eng = ((engs ?? []) as any[])[0] ?? null;

  const callIds = ((calls ?? []) as any[]).map((c) => c.id);
  const invIds = [...new Set(tasks.map((t) => t.related_investor_id).filter(Boolean))];
  const teamIds = eng ? TEAM.map(([k]) => eng[k]).filter(Boolean) : [];
  const [{ data: lines }, { data: invs }, { data: profs }] = await Promise.all([
    callIds.length ? db.from("capital_call_lines").select("capital_call_id, called_cents, received_cents, status").in("capital_call_id", callIds) : Promise.resolve({ data: [] }),
    invIds.length ? db.from("investment_profiles").select("id, legal_name").in("id", invIds) : Promise.resolve({ data: [] }),
    teamIds.length ? db.from("profiles").select("user_id, legal_name, email").in("user_id", teamIds) : Promise.resolve({ data: [] }),
  ]);
  const inv = new Map(((invs ?? []) as any[]).map((i) => [i.id, i.legal_name]));
  const nm = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email]));

  const audience = staff ? "internal" : "client";
  const shaped = tasks.map((t) => ({
    id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date, responsibility_status: t.responsibility_status,
    approval_amount: t.approval_amount, note: t.responsibility_note_client ?? null, overdueDays: daysOverdue(t, today),
    waitingOn: waitingOnDetail(t, audience, t.related_investor_id ? inv.get(t.related_investor_id) : null),
    ...(staff ? { client_visibility: t.client_visibility, sla_due_date: t.sla_due_date } : {}),
  }));
  const open = shaped.filter(isOpenTask);
  const prio = (p: string) => ({ urgent: 0, high: 1, normal: 2, low: 3 } as Record<string, number>)[p] ?? 2;
  const attention = open.filter((t) => t.responsibility_status === "CLIENT_APPROVAL_REQUIRED" || t.responsibility_status === "CLIENT_INFORMATION_REQUIRED")
    .sort((a, b) => (b.overdueDays > 0 ? 1 : 0) - (a.overdueDays > 0 ? 1 : 0) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || prio(a.priority) - prio(b.priority));

  const capital = ((calls ?? []) as any[]).map((c) => {
    const ls = ((lines ?? []) as any[]).filter((l) => l.capital_call_id === c.id);
    return {
      id: c.id, title: c.title || `Capital call ${c.call_number ?? ""}`.trim(), due_date: c.due_date, status: c.status,
      calledCents: Number(c.total_called_cents ?? ls.reduce((s, l) => s + Number(l.called_cents ?? 0), 0)),
      receivedCents: Number(c.total_received_cents ?? ls.reduce((s, l) => s + Number(l.received_cents ?? 0), 0)),
      investors: ls.length, funded: ls.filter((l) => Number(l.received_cents ?? 0) >= Number(l.called_cents ?? 0) && Number(l.called_cents ?? 0) > 0).length,
    };
  });
  const capitalOverdue = capital.some((c) => c.due_date && c.due_date < today && c.receivedCents < c.calledCents);

  const deadlines = [
    ...open.filter((t) => t.due_date).map((t) => ({ kind: "task" as const, id: t.id, title: t.title, due: t.due_date as string, category: null as string | null, responsibility: t.responsibility_status })),
    ...items.filter((i) => (i.status === "SCHEDULED" || i.status === "IN_PROGRESS") && !(i.task_id && tasks.some((t) => t.id === i.task_id)))
      .map((i) => ({ kind: "calendar" as const, id: i.id, title: i.title, due: i.due_date, category: i.category, responsibility: i.responsible_party })),
    ...capital.filter((c) => c.due_date).map((c) => ({ kind: "capital" as const, id: c.id, title: c.title, due: c.due_date, category: "CAPITAL", responsibility: "WAITING_ON_INVESTOR" })),
  ].sort((a, b) => a.due.localeCompare(b.due));

  const reports = items.filter((i) => (i.category === "REPORTING" || i.category === "NAV") && i.status !== "DONE" && i.due_date >= today);
  const nextReport = reports[0] ? { title: reports[0].title, period: reports[0].period_label, due: reports[0].due_date, status: reports[0].report_status ?? (reports[0].status === "IN_PROGRESS" ? "PREPARING" : "SCHEDULED") } : null;

  return {
    staff, today,
    fund: { id: fundId, name: fund?.name ?? fund?.legal_entity_name ?? "Fund" },
    engagement: eng ? { product: eng.service_product, level: eng.service_level, status: eng.service_status } : null,
    team: eng ? TEAM.filter(([k]) => eng[k]).map(([k, role]) => ({ role, name: nm.get(eng[k]) ?? "Harmonious team member" })) : [],
    counts: responsibilityCounts(open), openCount: open.length, attention,
    handling: open.filter((t) => t.responsibility_status === "HARMONIOUS_HANDLING").sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")),
    waiting: open.filter((t) => t.responsibility_status === "WAITING_ON_INVESTOR" || t.responsibility_status === "WAITING_ON_THIRD_PARTY"),
    tasks: shaped, deadlines, capital, nextReport,
    health: fundHealth(tasks, items, capital.length ? { overdue: capitalOverdue } : null, today),
    internal: staff ? {
      internalOnly: tasks.filter((t) => isOpenTask(t) && !t.client_visibility).length,
      slaRisk: tasks.filter((t) => isOpenTask(t) && t.sla_due_date && t.sla_due_date <= new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)).length,
    } : null,
  };
}
