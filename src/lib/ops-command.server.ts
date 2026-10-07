/**
 * Operations Command Center data layer (server-only, service role, staff-gated).
 * One bounded batch of set-based queries per load — no per-fund loops.
 * All judgements (priority, SLA, capacity, limits) are pure in ops-command.ts.
 */
import {
  addDays, bulkAllowed, capacityLoad, capacityStatus, computeSla, daysBetween, DEFAULT_WEIGHTS, investorExceptionType, investorSeverity,
  limitStatus, packageLabel, prioritize, reportStatus, thirdPartyType, weightFor, type CapacityThresholds, type Responsibility, type WorkItem,
} from "@/lib/ops-command";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const LIMIT = 2000;
const ECONOMICS_ROLES = ["super_admin", "executive", "admin", "finance"];
const SENSITIVE_INVESTOR_ROLES = ["super_admin", "executive", "admin", "operations", "fund_administration", "compliance", "client_success"];
const SETTINGS_ADMIN = ["super_admin", "admin"];

async function staffScope(uid: string) {
  const { viewerScope, STAFF_ROLE_SET } = await import("@/lib/staff-directory.server");
  const s = await viewerScope(uid).catch(() => null);
  if (!s || !s.roles.some((r: string) => STAFF_ROLE_SET.includes(r))) throw new Error("Only Harmonious staff can open Operations.");
  return s;
}
const has = (roles: string[], set: string[]) => roles.some((r) => set.includes(r));

async function setting<T>(db: any, key: string, fallback: T): Promise<T> {
  const { data } = await db.from("ops_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value ?? fallback) as T;
}

const OPEN_REQ = ["SUBMITTED", "IN_REVIEW", "IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_INVESTOR", "WAITING_ON_THIRD_PARTY", "READY_FOR_APPROVAL", "CANCELLATION_REVIEW"];
const REQ_RESP: Record<string, Responsibility> = { WAITING_ON_CLIENT: "CLIENT_INFORMATION_REQUIRED", READY_FOR_APPROVAL: "CLIENT_APPROVAL_REQUIRED", WAITING_ON_INVESTOR: "WAITING_ON_INVESTOR", WAITING_ON_THIRD_PARTY: "WAITING_ON_THIRD_PARTY" };
const OPEN_APPROVAL = ["DRAFT", "INTERNAL_REVIEW", "AWAITING_APPROVAL", "CHANGES_REQUESTED", "APPROVED"];
const CLOSED_CAPITAL = ["closed", "cancelled", "superseded", "completed", "CLOSED", "CANCELLED", "SUPERSEDED", "COMPLETED"];

/** Loads every source once and returns all Operations views. Restricted fields are omitted unless the role allows them. */
export async function loadOperations(uid: string, opts: { includeTest?: boolean } = {}) {
  const scope = await staffScope(uid);
  const roles: string[] = scope.roles;
  const canEconomics = has(roles, ECONOMICS_ROLES);
  const canInvestorDetail = has(roles, SENSITIVE_INVESTOR_ROLES);
  const db = await admin();
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  const [weights, capT, limT] = await Promise.all([
    setting<Record<string, number>>(db, "workload_weights", DEFAULT_WEIGHTS),
    setting<CapacityThresholds>(db, "capacity_thresholds", { expected_load: 10, elevated_pct: 80, high_pct: 100, over_pct: 120 }),
    setting(db, "service_limit_thresholds", { approaching_pct: 80, review_pct: 100 }),
  ]);

  const [funds, clients, engs, tasks, reqs, apprs, cal, calls, dists, readiness, onboard, policies, exState, reviews, staffRoles] = await Promise.all([
    db.from("offerings").select("id, name, client_id, consolidated_into").is("consolidated_into", null).limit(LIMIT),
    db.from("clients").select("id, legal_name, is_test_demo, status").limit(LIMIT),
    db.from("service_engagements").select("id, fund_id, service_product, service_level, service_status, contracted_annual_value, billing_frequency, primary_administrator_user_id, relationship_lead_user_id, accounting_lead_user_id, investor_limit, investment_limit, entity_limit").not("service_status", "in", "(CANCELLED,EXPIRED)").limit(LIMIT),
    db.from("staff_tasks").select("id, title, status, priority, team, assignee_user_id, due_date, offering_id, client_id, source, responsibility_status, waiting_on_type, waiting_on_name, related_investor_id, approval_required, follow_up_date, last_reminder_at, waiting_since, requested_date, updated_at, completed_at, sla_due_date").not("status", "in", "(cancelled)").order("due_date", { ascending: true, nullsFirst: false }).limit(LIMIT),
    db.from("fund_service_requests").select("id, fund_id, title, request_type, status, responsibility_status, priority, entitlement_status, assigned_team, assigned_to, submitted_at, due_date, sla_hours, sla_due_at, sla_paused_at, sla_paused_minutes, first_response_at, sla_source, sla_policy_id, completed_at").limit(LIMIT),
    db.from("approvals").select("id, fund_id, title, approval_type, status, approval_amount, prepared_by, reviewed_by, required_approver_count, version, requested_at, due_date, created_at").neq("status", "SUPERSEDED").limit(LIMIT),
    db.from("fund_calendar_items").select("id, fund_id, title, category, due_date, status, report_status, responsible_party, responsible_team, client_visibility, period_label, task_id").neq("status", "CANCELLED").gte("due_date", addDays(today, -120)).lte("due_date", addDays(today, 120)).limit(LIMIT),
    db.from("capital_calls").select("id, offering_id, title, status, total_called_cents, total_received_cents, due_date, requested_at").limit(LIMIT),
    db.from("distribution_batches").select("id, offering_id, title, status, payment_status, total_gross_cents, payment_date, recipient_count, final_approved_at, completed_at").limit(LIMIT),
    db.from("investment_readiness_tasks").select("id, onboarding_id, offering_id, requirement_key, owner, status, created_at, became_actionable_at").eq("status", "open").limit(LIMIT * 2),
    db.from("investor_onboardings").select("id, offering_id, person_id, assigned_to, stage").is("removed_at", null).limit(LIMIT * 2),
    db.from("service_sla_policies").select("id, warning_threshold_percentage").limit(500),
    db.from("ops_exceptions").select("*").limit(LIMIT),
    db.from("service_reviews").select("*").order("created_at", { ascending: false }).limit(LIMIT),
    db.from("user_roles").select("user_id, role").limit(LIMIT),
  ]);

  const clientRows = (clients.data ?? []) as any[];
  const testClients = new Set(clientRows.filter((c) => c.is_test_demo).map((c) => c.id));
  const cm = new Map(clientRows.map((c) => [c.id, c.legal_name]));
  const fundRows = ((funds.data ?? []) as any[]).filter((f) => opts.includeTest || !testClients.has(f.client_id));
  const fm = new Map(fundRows.map((f) => [f.id, f]));
  const engRows = ((engs.data ?? []) as any[]).filter((e) => fm.has(e.fund_id));
  // Primary administration engagement per fund (SPV/Fund ladders win over add-on products).
  const em = new Map<string, any>();
  for (const e of engRows) {
    const cur = em.get(e.fund_id);
    const isAdmin = e.service_product === "SPV_ADMINISTRATION" || e.service_product === "FUND_ADMINISTRATION";
    if (!cur || (isAdmin && !(cur.service_product === "SPV_ADMINISTRATION" || cur.service_product === "FUND_ADMINISTRATION"))) em.set(e.fund_id, e);
  }
  const warnByPolicy = new Map(((policies.data ?? []) as any[]).map((p) => [p.id, Number(p.warning_threshold_percentage ?? 75)]));

  const staffIds = new Set<string>(((staffRoles.data ?? []) as any[]).filter((r) => r.role !== "investor" && r.role !== "fund_manager").map((r) => r.user_id));
  const roleOf = new Map<string, string[]>();
  for (const r of (staffRoles.data ?? []) as any[]) roleOf.set(r.user_id, [...(roleOf.get(r.user_id) ?? []), r.role]);

  const base = (fundId: string | null) => {
    const f: any = fundId ? fm.get(fundId) : null; const e = fundId ? em.get(fundId) : null;
    return { fundId, fundName: f?.name ?? null, clientName: f ? cm.get(f.client_id) ?? null : null, packageLabel: packageLabel(e?.service_product, e?.service_level), product: e?.service_product ?? null, level: e?.service_level ?? null };
  };
  const inScope = (fundId: string | null | undefined) => !fundId || fm.has(fundId);
  const pr = (p: string | null | undefined): WorkItem["priority"] => (p === "urgent" || p === "high" || p === "low" ? p : "normal");

  /* ---- Work items ---- */
  const items: Omit<WorkItem, "rank" | "reason">[] = [];
  const taskRows = ((tasks.data ?? []) as any[]).filter((t) => inScope(t.offering_id));
  for (const t of taskRows) {
    if (t.status === "done") continue;
    items.push({ kind: "task", id: t.id, title: t.title, href: `/ops/tasks?task=${t.id}`, ...base(t.offering_id), due: t.due_date, priority: pr(t.priority),
      responsibility: (t.responsibility_status ?? "HARMONIOUS_HANDLING") as Responsibility, assignedUserId: t.assignee_user_id, assignedName: null, team: t.team,
      category: t.source === "calendar" ? "calendar" : t.team ?? null, highRisk: false, sla: t.sla_due_date && t.sla_due_date < today ? "BREACHED" : null,
      waitingSince: t.waiting_since ?? t.requested_date ?? null, waitingOnName: t.waiting_on_name, waitingOnType: t.waiting_on_type, status: t.status });
  }
  const reqRows = ((reqs.data ?? []) as any[]).filter((r) => inScope(r.fund_id));
  const reqView = reqRows.map((r) => {
    const s = computeSla(r, warnByPolicy.get(r.sla_policy_id) ?? 75, now);
    const open = OPEN_REQ.includes(r.status);
    return { ...r, ...base(r.fund_id), slaStatus: open ? s.status : null, slaElapsedMin: s.elapsedMinutes, slaPausedMin: s.pausedMinutes, slaRemainingMin: s.remainingMinutes, slaDueAt: s.dueAt, open, responsibility: (REQ_RESP[r.status] ?? (open ? "HARMONIOUS_HANDLING" : "COMPLETED")) as Responsibility };
  });
  for (const r of reqView) if (r.open) items.push({ kind: "request", id: r.id, title: r.title, href: `/manager/fund/${r.fund_id}/requests?request=${r.id}`, ...base(r.fund_id), due: r.due_date ?? r.slaDueAt?.slice(0, 10) ?? null, priority: pr(r.priority),
    responsibility: r.responsibility, assignedUserId: r.assigned_to, assignedName: null, team: r.assigned_team, category: r.request_type, highRisk: ["CAPITAL_CALL", "DISTRIBUTION", "BANKING", "TRANSFER"].includes(r.request_type),
    sla: r.slaStatus, status: r.status });

  const apprRows = ((apprs.data ?? []) as any[]).filter((a) => inScope(a.fund_id));
  const { approvalType } = await import("@/lib/approval-types");
  for (const a of apprRows) {
    if (!OPEN_APPROVAL.includes(a.status)) continue;
    const resp: Responsibility = a.status === "AWAITING_APPROVAL" ? "CLIENT_APPROVAL_REQUIRED" : "HARMONIOUS_HANDLING";
    items.push({ kind: "approval", id: a.id, title: a.title, href: `/manager/fund/${a.fund_id}/approvals?approval=${a.id}`, ...base(a.fund_id), due: a.due_date, priority: approvalType(a.approval_type).highRisk ? "high" : "normal",
      responsibility: resp, assignedUserId: a.prepared_by, assignedName: null, team: "operations", category: a.approval_type, highRisk: approvalType(a.approval_type).highRisk, sla: null, status: a.status, amount: a.approval_amount });
  }
  const calRows = ((cal.data ?? []) as any[]).filter((c) => inScope(c.fund_id));
  for (const c of calRows) {
    if (c.status === "COMPLETED" || c.task_id) continue; // linked tasks already appear as tasks
    if (c.due_date > addDays(today, 14)) continue;
    items.push({ kind: "calendar", id: c.id, title: c.title, href: `/ops/fund/${c.fund_id}?tab=calendar`, ...base(c.fund_id), due: c.due_date, priority: "normal",
      responsibility: "HARMONIOUS_HANDLING", assignedUserId: null, assignedName: null, team: c.responsible_team, category: c.category, highRisk: false, sla: null, status: c.status });
  }

  /* ---- Investor exceptions (derived from open readiness tasks; no identity data) ---- */
  const obMap = new Map(((onboard.data ?? []) as any[]).map((o) => [o.id, o]));
  const personIds = [...new Set(((onboard.data ?? []) as any[]).map((o) => o.person_id).filter(Boolean))];
  const { data: persons } = personIds.length ? await db.from("persons").select("id, legal_first_name, legal_last_name, preferred_name").in("id", personIds.slice(0, 1000)) : { data: [] };
  const pm = new Map(((persons ?? []) as any[]).map((p) => [p.id, [p.preferred_name || p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") || "Investor"]));
  const invGroups = new Map<string, any>();
  for (const t of (readiness.data ?? []) as any[]) {
    if (!inScope(t.offering_id) || t.owner !== "investor" && t.owner !== "harmonious") continue;
    const type = investorExceptionType(t.requirement_key);
    const key = `${t.onboarding_id}:${type}`;
    if (invGroups.has(key)) continue;
    const ob: any = obMap.get(t.onboarding_id);
    const created = t.became_actionable_at ?? t.created_at;
    const age = daysBetween(created, today) ?? 0;
    invGroups.set(key, { id: key, onboardingId: t.onboarding_id, investor: canInvestorDetail ? pm.get(ob?.person_id) ?? "Investor" : "Investor (restricted)", ...base(t.offering_id), type, created, age,
      severity: investorSeverity(type, age), dueDate: null, team: "investor_operations", assignedUserId: ob?.assigned_to ?? null, nextAction: t.owner === "investor" ? "Follow up with investor" : "Harmonious review", clientVisible: t.owner === "investor" });
  }
  const investorExceptions = [...invGroups.values()].sort((a, b) => (b.severity === "high" ? 1 : 0) - (a.severity === "high" ? 1 : 0) || b.age - a.age);
  for (const x of investorExceptions.filter((x) => x.severity === "high").slice(0, 200)) items.push({ kind: "exception", id: x.id, title: `${x.type}: ${x.investor}`, href: `/ops/fund/${x.fundId}?tab=investors`, ...base(x.fundId),
    due: null, priority: "high", responsibility: "WAITING_ON_INVESTOR", assignedUserId: x.assignedUserId, assignedName: null, team: x.team, category: "investor", highRisk: false, sla: null, severity: "high" });

  /* ---- Capital ---- */
  const capitalCalls = ((calls.data ?? []) as any[]).filter((c) => fm.has(c.offering_id)).map((c) => ({ ...c, ...base(c.offering_id), requested: Number(c.total_called_cents ?? 0) / 100, funded: Number(c.total_received_cents ?? 0) / 100,
    outstanding: Math.max(0, (Number(c.total_called_cents ?? 0) - Number(c.total_received_cents ?? 0)) / 100), active: !CLOSED_CAPITAL.includes(c.status), administrator: em.get(c.offering_id)?.primary_administrator_user_id ?? null }));
  const distributions = ((dists.data ?? []) as any[]).filter((d) => fm.has(d.offering_id)).map((d) => ({ ...d, ...base(d.offering_id), gross: Number(d.total_gross_cents ?? 0) / 100,
    active: !d.completed_at && !CLOSED_CAPITAL.includes(d.status), administrator: em.get(d.offering_id)?.primary_administrator_user_id ?? null, reconciliation: "No Data" }));
  for (const c of capitalCalls.filter((c) => c.active)) items.push({ kind: "capital", id: c.id, title: `Capital call: ${c.title ?? ""}`, href: `/ops/fund/${c.offering_id}`, ...base(c.offering_id), due: c.due_date, priority: c.outstanding > 0 && c.due_date && c.due_date < today ? "high" : "normal",
    responsibility: c.outstanding > 0 ? "WAITING_ON_INVESTOR" : "HARMONIOUS_HANDLING", assignedUserId: c.administrator, assignedName: null, team: "fund_administration", category: "CAPITAL", highRisk: false, sla: null, status: c.status, amount: c.requested });
  for (const d of distributions.filter((d) => d.active)) items.push({ kind: "capital", id: d.id, title: `Distribution: ${d.title ?? ""}`, href: `/ops/distributions`, ...base(d.offering_id), due: d.payment_date, priority: "normal",
    responsibility: "HARMONIOUS_HANDLING", assignedUserId: d.administrator, assignedName: null, team: "fund_administration", category: "CAPITAL", highRisk: true, sla: null, status: d.status, amount: d.gross });

  /* ---- Service limits + reviews ---- */
  const invCount = new Map<string, number>();
  for (const o of (onboard.data ?? []) as any[]) invCount.set(o.offering_id, (invCount.get(o.offering_id) ?? 0) + 1);
  const serviceLimits = engRows.flatMap((e) => {
    const used = invCount.get(e.fund_id) ?? 0;
    const metrics = [{ metric: "Investor Count", used, included: e.investor_limit }, { metric: "Investment Count", used: null as number | null, included: e.investment_limit }, { metric: "Entity Count", used: null as number | null, included: e.entity_limit }];
    return metrics.filter((m) => m.included != null).map((m) => ({ engagementId: e.id, ...base(e.fund_id), metric: m.metric, used: m.used, included: m.included,
      ...(m.used == null ? { status: "NO_DATA", pct: null } : limitStatus(m.used, m.included, limT)) }));
  });
  const reviewRows = ((reviews.data ?? []) as any[]).filter((r) => inScope(r.fund_id)).map((r) => ({ ...r, ...base(r.fund_id), acv: canEconomics ? Number(em.get(r.fund_id)?.contracted_annual_value ?? 0) : null, relationshipLead: em.get(r.fund_id)?.relationship_lead_user_id ?? null }));
  const openReviews = reviewRows.filter((r) => !["RESOLVED", "NO_CHANGE"].includes(r.status));
  for (const r of openReviews) items.push({ kind: "review", id: r.id, title: `Service review: ${r.reason}`, href: `/ops/command-center?view=reviews`, ...base(r.fund_id), due: null, priority: "normal",
    responsibility: "HARMONIOUS_HANDLING", assignedUserId: r.owner_user_id, assignedName: null, team: "sales", category: "service_review", highRisk: false, sla: null, status: r.status });

  /* ---- Exceptions engine (deterministic; persisted state only for ack/resolve) ---- */
  const exStateMap = new Map(((exState.data ?? []) as any[]).map((x) => [`${x.exception_type}:${x.source_ref}`, x]));
  const derived: any[] = [];
  const addEx = (type: string, ref: string, fundId: string | null, title: string, severity: string, due: string | null, recordType: string) => {
    const st: any = exStateMap.get(`${type}:${ref}`);
    if (st && (st.status === "RESOLVED" || st.status === "DISMISSED")) return;
    derived.push({ exception_type: type, source_ref: ref, ...base(fundId), title, severity, due_date: due, related_record_type: recordType, related_record_id: ref, status: st?.status ?? "OPEN", id: st?.id ?? null, assigned_user_id: st?.assigned_user_id ?? null, follow_up_date: st?.follow_up_date ?? null, detected_at: st?.detected_at ?? null });
  };
  for (const i of items) {
    if (i.kind === "task" && i.due && i.due < today) addEx("OVERDUE_TASK", i.id, i.fundId, i.title, i.priority === "high" || i.priority === "urgent" ? "high" : "medium", i.due, "staff_task");
    if (i.kind === "task" && !i.assignedUserId && !i.team) addEx("MISSING_ASSIGNMENT", i.id, i.fundId, i.title, "medium", i.due, "staff_task");
    if (i.kind === "request" && i.sla === "BREACHED") addEx("SLA_BREACH", i.id, i.fundId, i.title, "high", i.due, "fund_service_request");
    if (i.kind === "request" && i.sla === "AT_RISK") addEx("SLA_RISK", i.id, i.fundId, i.title, "medium", i.due, "fund_service_request");
  }
  for (const c of capitalCalls) if (c.active && c.due_date && c.due_date < today && c.outstanding > 0) addEx("CAPITAL_CALL_OVERDUE", c.id, c.offering_id, `Capital call overdue: ${c.title ?? ""}`, "high", c.due_date, "capital_call");
  for (const c of calRows) {
    if (c.status === "COMPLETED" || c.due_date >= today) continue;
    addEx(c.category === "REPORTING" ? "REPORTING_OVERDUE" : "CALENDAR_DEADLINE_OVERDUE", c.id, c.fund_id, c.title, ["TAX", "REGULATORY"].includes(c.category) ? "high" : "medium", c.due_date, "fund_calendar_item");
  }
  for (const l of serviceLimits) {
    if (l.status === "APPROACHING") addEx("SERVICE_LIMIT_APPROACHING", `${l.engagementId}:${l.metric}`, l.fundId, `${l.metric} at ${l.pct}% of included`, "low", null, "service_engagement");
    if (l.status === "REVIEW_REQUIRED") addEx("SERVICE_LIMIT_EXCEEDED", `${l.engagementId}:${l.metric}`, l.fundId, `${l.metric} at ${l.pct}% of included`, "medium", null, "service_engagement");
  }
  for (const x of investorExceptions) {
    const t = ({ "KYC Incomplete": "MISSING_KYC", "KYB Incomplete": "MISSING_KYB", "Accreditation Incomplete": "MISSING_ACCREDITATION", "Subscription Unsigned": "MISSING_SUBSCRIPTION", "Funding Outstanding": "FUNDING_SHORTFALL" } as Record<string, string>)[x.type];
    if (t && x.severity === "high") addEx(t, x.id, x.fundId, `${x.type}: ${x.investor}`, "medium", null, "investor_onboarding");
  }

  /* ---- Names ---- */
  const ids = new Set<string>();
  for (const i of items) if (i.assignedUserId) ids.add(i.assignedUserId);
  for (const e of engRows) for (const k of ["primary_administrator_user_id", "relationship_lead_user_id", "accounting_lead_user_id"]) if (e[k]) ids.add(e[k]);
  for (const id of staffIds) ids.add(id);
  const { data: profs } = ids.size ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", [...ids].slice(0, 1500)) : { data: [] };
  const nm = new Map<string, string>(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email]));
  for (const i of items) i.assignedName = i.assignedUserId ? nm.get(i.assignedUserId) ?? null : null;

  const queue = prioritize(items, today);

  /* ---- Portfolio ---- */
  const byFund = <T,>(rows: T[], key: (r: T) => string | null) => { const m = new Map<string, T[]>(); for (const r of rows) { const k = key(r); if (k) m.set(k, [...(m.get(k) ?? []), r]); } return m; };
  const qByFund = byFund(queue, (q) => q.fundId);
  const invByFund = byFund(investorExceptions, (x) => x.fundId);
  const calByFund = byFund(calRows.filter((c) => c.status !== "COMPLETED" && c.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date)), (c) => c.fund_id);
  const revByFund = byFund(openReviews, (r) => r.fund_id);
  const limByFund = byFund(serviceLimits, (l) => l.fundId);
  const portfolio = fundRows.map((f) => {
    const e = em.get(f.id); const q = qByFund.get(f.id) ?? []; const c = calByFund.get(f.id) ?? [];
    const lim = limByFund.get(f.id) ?? [];
    const sla = q.filter((x) => x.kind === "request");
    const openTasks = q.filter((x) => x.kind === "task").length;
    const overdue = q.filter((x) => x.due && x.due < today).length;
    const breaches = sla.filter((x) => x.sla === "BREACHED").length;
    const health = breaches || q.some((x) => x.rank <= 2) ? "At Risk" : overdue > 3 ? "Needs Attention" : "On Track";
    return { fundId: f.id, fundName: f.name, clientName: cm.get(f.client_id) ?? null, isTest: testClients.has(f.client_id), packageLabel: packageLabel(e?.service_product, e?.service_level), product: e?.service_product ?? null, level: e?.service_level ?? null,
      primaryAdministrator: nm.get(e?.primary_administrator_user_id) ?? null, primaryAdministratorId: e?.primary_administrator_user_id ?? null, relationshipLead: nm.get(e?.relationship_lead_user_id) ?? null, relationshipLeadId: e?.relationship_lead_user_id ?? null,
      health, openTasks, overdueTasks: overdue, slaRisks: sla.filter((x) => x.sla === "AT_RISK").length, slaBreaches: breaches,
      approvals: q.filter((x) => x.kind === "approval").length, requests: sla.length, investorExceptions: (invByFund.get(f.id) ?? []).length,
      nextReport: c.find((x) => x.category === "REPORTING" || x.category === "NAV")?.due_date ?? null, nextCapitalEvent: c.find((x) => x.category === "CAPITAL")?.due_date ?? null, nextDeadline: c[0]?.due_date ?? null,
      acv: canEconomics && e ? Number(e.contracted_annual_value ?? 0) : null,
      serviceLimitStatus: lim.some((l) => l.status === "REVIEW_REQUIRED") ? "Review Required" : lim.some((l) => l.status === "APPROACHING") ? "Approaching" : lim.length ? "OK" : "No limits",
      serviceReviewStatus: (revByFund.get(f.id) ?? [])[0]?.status ?? null };
  });

  /* ---- Capacity ---- */
  const engByAdmin = byFund(engRows, (e) => e.primary_administrator_user_id);
  const capacity = [...staffIds].map((u) => {
    const mine = engByAdmin.get(u) ?? []; const q = queue.filter((x) => x.assignedUserId === u);
    const weighted = mine.reduce((s, e) => s + weightFor(weights, e.service_product, e.service_level), 0);
    const x = { weightedEngagements: weighted, openTasks: q.filter((i) => i.kind === "task").length, overdue: q.filter((i) => i.due && i.due < today).length, slaAtRisk: q.filter((i) => i.sla === "AT_RISK").length, slaBreached: q.filter((i) => i.sla === "BREACHED").length };
    const load = capacityLoad(x);
    return { userId: u, name: nm.get(u) ?? "Staff member", roles: roleOf.get(u) ?? [], spvs: mine.filter((e) => e.service_product === "SPV_ADMINISTRATION").length, funds: mine.filter((e) => e.service_product === "FUND_ADMINISTRATION").length,
      weightedLoad: Math.round(weighted * 100) / 100, investorCount: mine.reduce((s, e) => s + (invCount.get(e.fund_id) ?? 0), 0), ...x,
      approvalsToReview: q.filter((i) => i.kind === "approval").length, requestsAssigned: q.filter((i) => i.kind === "request").length,
      reportsDue: calRows.filter((c) => mine.some((e) => e.fund_id === c.fund_id) && c.category === "REPORTING" && c.status !== "COMPLETED" && c.due_date <= addDays(today, 30)).length,
      capitalEvents: q.filter((i) => i.kind === "capital").length, investorExceptions: investorExceptions.filter((v) => mine.some((e) => e.fund_id === v.fundId)).length,
      load, status: capacityStatus(load, capT) };
  }).filter((c) => c.weightedLoad > 0 || c.openTasks > 0 || c.requestsAssigned > 0).sort((a, b) => b.load - a.load);

  /* ---- Economics (restricted) ---- */
  const { data: spvTxn } = await db.from("spv_transaction_pricing").select("label, fee_usd").eq("is_current", true);
  void spvTxn;
  const ytd = `${today.slice(0, 4)}-01-01`;
  const economics = canEconomics ? engRows.map((e) => ({ ...base(e.fund_id), engagementId: e.id, acv: Number(e.contracted_annual_value ?? 0), annualServiceFee: Number(e.contracted_annual_value ?? 0), spvTransactionFee: e.service_product === "SPV_ADMINISTRATION" ? "No Data" : null,
    billingFrequency: e.billing_frequency, investorCount: invCount.get(e.fund_id) ?? 0, entityCount: "No Data", investmentCount: "No Data",
    requestsYtd: reqRows.filter((r) => r.fund_id === e.fund_id && (r.submitted_at ?? "") >= ytd).length, tasksYtd: taskRows.filter((t) => t.offering_id === e.fund_id).length,
    capitalEventsYtd: capitalCalls.filter((c) => c.offering_id === e.fund_id && (c.requested_at ?? "") >= ytd).length + distributions.filter((d) => d.offering_id === e.fund_id).length,
    reportingCycles: calRows.filter((c) => c.fund_id === e.fund_id && c.category === "REPORTING" && c.status === "COMPLETED").length,
    weightedWorkload: weightFor(weights, e.service_product, e.service_level), serviceReviewStatus: (revByFund.get(e.fund_id) ?? [])[0]?.status ?? null,
    hoursYtd: "No Data", laborCost: "No Data", vendorCost: "No Data", grossMargin: "No Data" })) : null;
  const acvBy = (k: (e: any) => string) => { const m: Record<string, number> = {}; for (const e of engRows) { if (e.service_status !== "ACTIVE") continue; const key = k(e); m[key] = (m[key] ?? 0) + Number(e.contracted_annual_value ?? 0); } return m; };
  const acv = canEconomics ? {
    total: engRows.filter((e) => e.service_status === "ACTIVE").reduce((s, e) => s + Number(e.contracted_annual_value ?? 0), 0),
    byProduct: acvBy((e) => (e.service_product === "SPV_ADMINISTRATION" ? "SPV" : e.service_product === "FUND_ADMINISTRATION" ? "Fund" : "Other")),
    byPackage: acvBy((e) => packageLabel(e.service_product, e.service_level)),
    byClient: acvBy((e) => cm.get((fm.get(e.fund_id) as any)?.client_id) ?? "Unknown"),
    byAdministrator: acvBy((e) => nm.get(e.primary_administrator_user_id) ?? "Unassigned"),
    byRelationshipLead: acvBy((e) => nm.get(e.relationship_lead_user_id) ?? "Unassigned"),
  } : null;

  /* ---- Packages ---- */
  const packages: Record<string, number> = {};
  for (const e of em.values()) { const k = packageLabel(e.service_product, e.service_level); packages[k] = (packages[k] ?? 0) + 1; }

  /* ---- Scoreboard ---- */
  const open = queue.filter((q) => q.responsibility !== "COMPLETED");
  const reportingDue = calRows.filter((c) => (c.category === "REPORTING" || c.category === "NAV") && c.status !== "COMPLETED" && c.due_date <= addDays(today, 14));
  const scoreboard = {
    needsAttention: open.filter((q) => q.rank <= 10).length,
    overdue: open.filter((q) => q.due && q.due < today).length,
    slaAtRisk: open.filter((q) => q.sla === "AT_RISK").length,
    slaBreached: open.filter((q) => q.sla === "BREACHED").length,
    clientAction: open.filter((q) => q.responsibility === "CLIENT_APPROVAL_REQUIRED" || q.responsibility === "CLIENT_INFORMATION_REQUIRED").length,
    investorBlockers: open.filter((q) => q.responsibility === "WAITING_ON_INVESTOR").length + investorExceptions.length,
    thirdPartyBlockers: open.filter((q) => q.responsibility === "WAITING_ON_THIRD_PARTY").length,
    approvalsPending: open.filter((q) => q.kind === "approval").length,
    reportingDue: reportingDue.length,
    capitalEvents: open.filter((q) => q.kind === "capital").length,
    serviceReviews: openReviews.length,
    unassigned: open.filter((q) => !q.assignedUserId).length,
  };

  /* ---- Queues ---- */
  const clientActions = open.filter((q) => q.responsibility === "CLIENT_APPROVAL_REQUIRED" || q.responsibility === "CLIENT_INFORMATION_REQUIRED").map((q) => {
    const t: any = q.kind === "task" ? taskRows.find((x) => x.id === q.id) : null;
    return { ...q, requestedDate: t?.requested_date ?? null, daysWaiting: daysBetween(q.waitingSince ?? t?.updated_at, today), lastReminder: t?.last_reminder_at ?? null, followUp: t?.follow_up_date ?? null };
  });
  const thirdParty = open.filter((q) => q.responsibility === "WAITING_ON_THIRD_PARTY").map((q) => {
    const t: any = q.kind === "task" ? taskRows.find((x) => x.id === q.id) : null;
    return { ...q, thirdPartyType: thirdPartyType(q.waitingOnType), thirdPartyName: q.waitingOnName ?? null, waitingSince: q.waitingSince ?? null, daysWaiting: daysBetween(q.waitingSince ?? t?.updated_at, today), followUp: t?.follow_up_date ?? null };
  });
  const reporting = calRows.filter((c) => c.category === "REPORTING" || c.category === "NAV").map((c) => ({ ...c, ...base(c.fund_id), reportState: reportStatus(c, today), administrator: nm.get(em.get(c.fund_id)?.primary_administrator_user_id) ?? null })).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const calendar = calRows.map((c) => ({ ...c, ...base(c.fund_id), administrator: nm.get(em.get(c.fund_id)?.primary_administrator_user_id) ?? null, administratorId: em.get(c.fund_id)?.primary_administrator_user_id ?? null })).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const approvals = apprRows.map((a) => ({ ...a, ...base(a.fund_id), preparedByName: nm.get(a.prepared_by) ?? null, reviewerName: nm.get(a.reviewed_by) ?? null, secondApproverRequired: Number(a.required_approver_count ?? 1) > 1,
    age: daysBetween(a.requested_at ?? a.created_at, today), overdue: !!a.due_date && a.due_date < today && OPEN_APPROVAL.includes(a.status), highRisk: approvalType(a.approval_type).highRisk }));
  const requests = reqView.map((r) => ({ ...r, assignedName: nm.get(r.assigned_to) ?? null }));

  return {
    today, viewer: { userId: uid, roles, canEconomics, canInvestorDetail, canSettings: has(roles, SETTINGS_ADMIN) },
    scoreboard, queue: queue.slice(0, 500), portfolio, approvals, requests, reporting, calendar, capitalCalls, distributions,
    investorExceptions: investorExceptions.slice(0, 1000), thirdParty, clientActions, exceptions: derived.slice(0, 1000),
    serviceLimits, serviceReviews: reviewRows, capacity, economics, acv, packages,
    leadership: { activeFunds: [...em.values()].filter((e) => e.service_product === "FUND_ADMINISTRATION").length, activeSpvs: [...em.values()].filter((e) => e.service_product === "SPV_ADMINISTRATION").length, openWork: open.length, ...scoreboard, capacityRisks: capacity.filter((c) => c.status === "HIGH" || c.status === "OVER_CAPACITY").length },
    settings: { weights: canEconomics || has(roles, SETTINGS_ADMIN) ? weights : null, capacity: capT, limits: limT },
  };
}

/** Data for a future daily digest (no delivery in Phase 1). */
export async function dailyDigest(uid: string) {
  const d = await loadOperations(uid);
  const today = d.today;
  return {
    dueToday: d.queue.filter((q) => q.due === today).length, overdue: d.scoreboard.overdue, slaAtRisk: d.scoreboard.slaAtRisk, slaBreached: d.scoreboard.slaBreached,
    approvalsPending: d.scoreboard.approvalsPending, clientActions: d.scoreboard.clientAction, investorExceptions: d.investorExceptions.length,
    reportsDue: d.scoreboard.reportingDue, capitalEvents: d.scoreboard.capitalEvents, serviceReviews: d.scoreboard.serviceReviews,
  };
}

/* ---------------- Writes ---------------- */

export async function bulkAction(uid: string, d: { action: string; items: { kind: string; id: string; ref?: string; type?: string; fundId?: string | null; title?: string }[]; value?: string | null }) {
  const s = await staffScope(uid);
  if (d.items.length > 200) throw new Error("Select at most 200 items at a time.");
  const db = await admin();
  let done = 0; const skipped: string[] = [];
  for (const it of d.items) {
    if (!bulkAllowed(d.action, it.kind)) { skipped.push(it.title ?? it.id); continue; }
    if (it.kind === "task") {
      const patch: any = { updated_at: new Date().toISOString() };
      if (d.action === "assign") patch.assignee_user_id = d.value || null;
      if (d.action === "team") patch.team = d.value || null;
      if (d.action === "priority") { if (!["low", "normal", "high", "urgent"].includes(String(d.value))) throw new Error("Pick a priority."); patch.priority = d.value; }
      if (d.action === "follow_up") patch.follow_up_date = d.value || null;
      const { error } = await db.from("staff_tasks").update(patch).eq("id", it.id);
      if (error) { skipped.push(it.title ?? it.id); continue; }
      await db.from("staff_task_events").insert({ task_id: it.id, actor_id: uid, event: `bulk_${d.action}`, detail: { value: d.value ?? null } }).then(() => null, () => null);
      done++;
    } else if (it.kind === "exception" && d.action === "acknowledge") {
      const { data: row } = await db.from("ops_exceptions").upsert({ exception_type: it.type, source_ref: it.ref ?? it.id, fund_id: it.fundId ?? null, title: it.title ?? "Exception", status: "ACKNOWLEDGED", updated_at: new Date().toISOString() }, { onConflict: "exception_type,source_ref" }).select("id").single();
      if (row) { await db.from("ops_exception_events").insert({ exception_id: row.id, event: "acknowledged", actor_id: uid }); done++; }
    }
  }
  void s;
  return { done, skipped };
}

export async function setExceptionStatus(uid: string, d: { type: string; ref: string; fundId?: string | null; title: string; status: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED"; resolution?: string | null }) {
  await staffScope(uid);
  if ((d.status === "RESOLVED" || d.status === "DISMISSED") && (!d.resolution || d.resolution.trim().length < 5)) throw new Error("Add a short resolution note.");
  const db = await admin();
  const now = new Date().toISOString();
  const { data: row, error } = await db.from("ops_exceptions").upsert({ exception_type: d.type, source_ref: d.ref, fund_id: d.fundId ?? null, title: d.title, status: d.status, resolution: d.resolution ?? null,
    resolved_by: d.status === "RESOLVED" || d.status === "DISMISSED" ? uid : null, resolved_at: d.status === "RESOLVED" || d.status === "DISMISSED" ? now : null, updated_at: now }, { onConflict: "exception_type,source_ref" }).select("id").single();
  if (error) throw new Error(error.message);
  await db.from("ops_exception_events").insert({ exception_id: row.id, event: d.status.toLowerCase(), detail: { resolution: d.resolution ?? null }, actor_id: uid });
  return { ok: true };
}

/** Client-action follow-ups: records a reminder/follow-up/escalation. Never sends anything automatically. */
export async function clientActionStep(uid: string, d: { taskId: string; step: "reminder" | "follow_up" | "escalate"; date?: string | null; note?: string | null }) {
  await staffScope(uid);
  const db = await admin();
  const now = new Date().toISOString();
  const patch: any = { updated_at: now };
  if (d.step === "reminder") patch.last_reminder_at = now;
  if (d.step === "follow_up") patch.follow_up_date = d.date || null;
  if (d.step === "escalate") { patch.escalated_at = now; patch.priority = "high"; }
  const { error } = await db.from("staff_tasks").update(patch).eq("id", d.taskId);
  if (error) throw new Error(error.message);
  await db.from("staff_task_events").insert({ task_id: d.taskId, actor_id: uid, event: `client_${d.step}`, detail: { note: d.note ?? null, date: d.date ?? null } }).then(() => null, () => null);
  return { ok: true, note: d.step === "reminder" ? "Reminder logged. Send it to the client from the task or your mailbox — nothing is sent automatically." : null };
}

export async function setServiceReviewStatus(uid: string, d: { id: string; status: string; note?: string | null; ownerUserId?: string | null }) {
  await staffScope(uid);
  if (!["REVIEW_REQUIRED", "IN_REVIEW", "CLIENT_DISCUSSION", "QUOTE_PREPARED", "RESOLVED", "NO_CHANGE"].includes(d.status)) throw new Error("Unknown status.");
  const db = await admin();
  const { data: r } = await db.from("service_reviews").select("status").eq("id", d.id).maybeSingle();
  if (!r) throw new Error("Review not found.");
  const patch: any = { status: d.status, updated_at: new Date().toISOString() };
  if (d.ownerUserId !== undefined) patch.owner_user_id = d.ownerUserId;
  if (d.status === "RESOLVED" || d.status === "NO_CHANGE") patch.resolution = d.note ?? null;
  await db.from("service_reviews").update(patch).eq("id", d.id);
  await db.from("service_review_events").insert({ review_id: d.id, event: "status", from_status: r.status, to_status: d.status, note: d.note ?? null, actor_id: uid });
  return { ok: true };
}

/** Upserts service reviews from deterministic triggers (out-of-scope requests, limits). Idempotent. Never changes price. */
export async function syncServiceReviews(uid: string) {
  await staffScope(uid);
  const db = await admin();
  const d = await loadOperations(uid, { includeTest: true });
  const rows: any[] = [];
  for (const r of d.requests) if (r.entitlement_status === "REVIEW_REQUIRED") rows.push({ fund_id: r.fund_id, service_engagement_id: null, trigger_type: "OUT_OF_SCOPE_REQUEST", source_ref: r.id, reason: `Out-of-scope request: ${r.title}`, usage_detail: { request_type: r.request_type } });
  for (const l of d.serviceLimits) {
    if (l.status === "APPROACHING") rows.push({ fund_id: l.fundId, service_engagement_id: l.engagementId, trigger_type: "SERVICE_LIMIT_APPROACHING", source_ref: `${l.engagementId}:${l.metric}`, reason: `${l.metric} approaching included limit`, usage_detail: { used: l.used, included: l.included, pct: l.pct } });
    if (l.status === "REVIEW_REQUIRED") rows.push({ fund_id: l.fundId, service_engagement_id: l.engagementId, trigger_type: "SERVICE_LIMIT_EXCEEDED", source_ref: `${l.engagementId}:${l.metric}`, reason: `${l.metric} exceeded included limit`, usage_detail: { used: l.used, included: l.included, pct: l.pct } });
  }
  if (rows.length) await db.from("service_reviews").upsert(rows, { onConflict: "trigger_type,source_ref", ignoreDuplicates: true });
  return { checked: rows.length };
}

export async function updateOpsSetting(uid: string, d: { key: string; value: any; reason: string }) {
  const s = await staffScope(uid);
  if (!has(s.roles, SETTINGS_ADMIN)) throw new Error("Only a Harmonious Admin can change Operations settings.");
  if (!["workload_weights", "capacity_thresholds", "service_limit_thresholds"].includes(d.key)) throw new Error("Unknown setting.");
  if (!d.reason || d.reason.trim().length < 10) throw new Error("Give a reason (10+ characters).");
  const db = await admin();
  const { data: old } = await db.from("ops_settings").select("value").eq("key", d.key).maybeSingle();
  await db.from("ops_settings").upsert({ key: d.key, value: d.value, updated_at: new Date().toISOString(), updated_by: uid });
  await db.from("ops_settings_events").insert({ key: d.key, old_value: old?.value ?? null, new_value: d.value, reason: d.reason, actor_id: uid });
  return { ok: true };
}

export async function savedViews(uid: string) {
  await staffScope(uid);
  const db = await admin();
  const { data } = await db.from("ops_saved_views").select("id, view, name, filters").eq("user_id", uid).order("created_at");
  return (data ?? []) as any[];
}
export async function saveView(uid: string, d: { view: string; name: string; filters: Record<string, string> }) {
  await staffScope(uid);
  const db = await admin();
  const { count } = await db.from("ops_saved_views").select("id", { count: "exact", head: true }).eq("user_id", uid);
  if ((count ?? 0) >= 30) throw new Error("You can save up to 30 views.");
  await db.from("ops_saved_views").insert({ user_id: uid, view: d.view, name: d.name.slice(0, 80), filters: d.filters });
  return { ok: true };
}
export async function deleteView(uid: string, id: string) {
  await staffScope(uid);
  const db = await admin();
  await db.from("ops_saved_views").delete().eq("id", id).eq("user_id", uid);
  return { ok: true };
}
