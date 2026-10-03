/**
 * Harmonious employee directory, reporting lines, activity and team dashboards.
 * Server-only. Reporting lines reuse sales_reporting_lines (user_id -> manager_user_id)
 * as the single staff manager relationship. Everything here is read-only except
 * setManager (leadership only) and logActivity (self only, append-only).
 */
import { MANAGED_ROLES } from "@/lib/staff-role-hierarchy";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export const STAFF_ROLE_SET = [...MANAGED_ROLES, "admin", "operations", "finance", "tax", "compliance", "legal", "fund_administration", "client_success"];
const LEADERSHIP = ["super_admin", "executive", "admin"];

export const TEAMS = {
  operations: { title: "Operations", roles: ["operations", "fund_administration"] },
  finance: { title: "Accounting & Finance", roles: ["finance", "tax", "fund_administration"] },
  compliance: { title: "Compliance", roles: ["compliance", "legal"] },
  marketing: { title: "Marketing", roles: ["marketing_manager", "marketing_specialist"] },
  leadership: { title: "Leadership", roles: [] as string[] },
} as const;
export type TeamKey = keyof typeof TEAMS;

async function rolesOf(db: any, userId: string): Promise<string[]> {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

export const isLeader = (roles: string[]) => roles.some((r) => LEADERSHIP.includes(r));
/** Leaders plus the view-only Leadership role: may see, never change. */
export const isLeaderViewer = (roles: string[]) => isLeader(roles) || roles.includes("leadership");

async function allStaff(db: any) {
  const { data } = await db.from("user_roles").select("user_id, role").in("role", STAFF_ROLE_SET);
  const map = new Map<string, string[]>();
  for (const r of (data ?? []) as any[]) map.set(r.user_id, [...(map.get(r.user_id) ?? []), String(r.role)]);
  return map;
}

async function lines(db: any) {
  const { data } = await db.from("sales_reporting_lines").select("user_id, manager_user_id");
  return new Map<string, string | null>(((data ?? []) as any[]).map((l) => [l.user_id, l.manager_user_id]));
}

function downline(managerOf: Map<string, string | null>, root: string): Set<string> {
  const out = new Set<string>();
  const queue = [root];
  while (queue.length) {
    const m = queue.shift()!;
    for (const [u, mgr] of managerOf) if (mgr === m && !out.has(u) && u !== root) { out.add(u); queue.push(u); }
  }
  return out;
}

/** Who the viewer may see: leadership sees all staff; others see themselves and everyone below them. */
async function viewerScope(viewer: string) {
  const db = await admin();
  const roles = await rolesOf(db, viewer);
  const staff = await allStaff(db);
  if (!staff.has(viewer)) throw new Error("Only Harmonious staff can view employees.");
  const managerOf = await lines(db);
  const leader = isLeader(roles);
  const visible = isLeaderViewer(roles) ? new Set(staff.keys()) : new Set([viewer, ...downline(managerOf, viewer)]);
  return { db, roles, staff, managerOf, leader, visible };
}

export async function listEmployees(viewer: string) {
  const { db, staff, managerOf, leader, visible } = await viewerScope(viewer);
  const ids = [...visible].filter((id) => staff.has(id));
  const allIds = [...staff.keys()];
  const { data: profs } = allIds.length ? await db.from("profiles").select("user_id, email, legal_name").in("user_id", allIds) : { data: [] };
  const pm = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p]));
  const authInfo = await Promise.all(ids.map(async (id) => {
    const { data } = await db.auth.admin.getUserById(id);
    return [id, { lastSignIn: data?.user?.last_sign_in_at ?? null, email: data?.user?.email ?? null }] as const;
  }));
  const am = new Map(authInfo);
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: recent } = ids.length ? await db.from("staff_activity_events").select("user_id, created_at").in("user_id", ids).gte("created_at", since).order("created_at", { ascending: false }).limit(5000) : { data: [] };
  const lastSeen = new Map<string, string>(); const weekCount = new Map<string, number>();
  for (const r of (recent ?? []) as any[]) { if (!lastSeen.has(r.user_id)) lastSeen.set(r.user_id, r.created_at); weekCount.set(r.user_id, (weekCount.get(r.user_id) ?? 0) + 1); }
  const name = (id: string | null | undefined) => (id ? pm.get(id)?.legal_name || pm.get(id)?.email || "" : "");
  const people = ids.map((id) => ({
    userId: id,
    name: name(id),
    email: am.get(id)?.email ?? pm.get(id)?.email ?? "",
    roles: staff.get(id) ?? [],
    managerId: managerOf.get(id) ?? null,
    managerName: name(managerOf.get(id)),
    lastSignIn: am.get(id)?.lastSignIn ?? null,
    lastActive: lastSeen.get(id) ?? null,
    actionsThisWeek: weekCount.get(id) ?? 0,
    reports: downline(managerOf, id).size,
  })).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const managerOptions = leader ? allIds.map((id) => ({ userId: id, name: name(id) || id })).sort((a, b) => a.name.localeCompare(b.name)) : [];
  return { me: viewer, canAssignManagers: leader, people, managerOptions };
}

export async function employeeActivity(viewer: string, employeeId: string) {
  const { db, staff, visible } = await viewerScope(viewer);
  if (!visible.has(employeeId) || !staff.has(employeeId)) throw new Error("You can only see the activity of people who report to you.");
  const [{ data: prof }, { data: auth }, { data: pages }, { data: audits }] = await Promise.all([
    db.from("profiles").select("legal_name, email").eq("user_id", employeeId).maybeSingle(),
    db.auth.admin.getUserById(employeeId),
    db.from("staff_activity_events").select("id, kind, path, label, created_at").eq("user_id", employeeId).order("created_at", { ascending: false }).limit(300),
    db.from("access_audit_events").select("id, action, created_at").eq("actor_user_id", employeeId).order("created_at", { ascending: false }).limit(100),
  ]);
  const events = [
    ...((pages ?? []) as any[]).map((p) => ({ id: p.id, when: p.created_at, kind: p.kind === "page" ? "Viewed" : "Action", what: p.label || p.path || "" , path: p.kind === "page" ? p.path : null })),
    ...((audits ?? []) as any[]).map((a) => ({ id: a.id, when: a.created_at, kind: "Access change", what: String(a.action).replace(/_/g, " "), path: null })),
  ].sort((a, b) => b.when.localeCompare(a.when));
  return {
    name: prof?.legal_name || prof?.email || auth?.user?.email || "",
    email: auth?.user?.email ?? prof?.email ?? "",
    roles: staff.get(employeeId) ?? [],
    lastSignIn: auth?.user?.last_sign_in_at ?? null,
    createdAt: auth?.user?.created_at ?? null,
    events,
  };
}

export async function setManager(viewer: string, employeeId: string, managerId: string | null) {
  const { db, staff, managerOf, leader } = await viewerScope(viewer);
  if (!leader) throw new Error("Only Super admin, CEO or an administrator can assign managers.");
  if (!staff.has(employeeId)) throw new Error("That person is not Harmonious staff.");
  if (managerId) {
    if (!staff.has(managerId)) throw new Error("The manager must be Harmonious staff.");
    if (managerId === employeeId || downline(managerOf, employeeId).has(managerId)) throw new Error("That would make someone their own manager.");
  }
  const { error } = await db.from("sales_reporting_lines").upsert({ user_id: employeeId, manager_user_id: managerId, updated_by: viewer, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function logActivity(userId: string, kind: "page" | "action", path: string, label: string | null) {
  const db = await admin();
  const staff = await rolesOf(db, userId);
  if (!staff.some((r) => STAFF_ROLE_SET.includes(r))) return { ok: false };
  await db.from("staff_activity_events").insert({ user_id: userId, kind, path: path.slice(0, 300), label: label?.slice(0, 200) ?? null });
  return { ok: true };
}

const countBy = (rows: any[], key: string) => rows.reduce<Record<string, number>>((m, r) => { const k = String(r[key] ?? "unknown").replace(/_/g, " "); m[k] = (m[k] ?? 0) + 1; return m; }, {});

export async function teamDashboard(viewer: string, team: TeamKey) {
  const db = await admin();
  const roles = await rolesOf(db, viewer);
  const leader = isLeaderViewer(roles);
  if (!leader && !TEAMS[team].roles.some((r) => roles.includes(r))) throw new Error(`Only the ${TEAMS[team].title} team and leadership can view this dashboard.`);
  const today = new Date().toISOString().slice(0, 10);
  const q = async (table: string, cols: string, f?: (b: any) => any) => { let b = db.from(table).select(cols).limit(5000); if (f) b = f(b); const { data } = await b; return (data ?? []) as any[]; };

  const staff = await allStaff(db);
  const members = [...staff.entries()].filter(([, r]) => team === "leadership" || TEAMS[team].roles.some((x) => r.includes(x))).map(([id]) => id);
  const since = new Date(Date.now() - 864e5).toISOString();
  const active = members.length ? await q("staff_activity_events", "user_id", (b) => b.in("user_id", members).gte("created_at", since)) : [];
  const teamStats = { members: members.length, activeToday: new Set(active.map((a) => a.user_id)).size };

  const ops = async () => {
    const [setups, onb, closes] = await Promise.all([
      q("fund_setups", "id, launched_at, created_at"),
      q("investor_onboardings", "id, stage, closed_at, removed_at", (b) => b.is("removed_at", null).is("closed_at", null)),
      q("fund_close_requests", "id, status"),
    ]);
    const inSetup = setups.filter((s) => !s.launched_at);
    return {
      stats: [
        { label: "Funds in setup", value: inSetup.length },
        { label: "Stuck over 21 days", value: inSetup.filter((s) => Date.now() - Date.parse(s.created_at) > 21 * 864e5).length },
        { label: "Open investor onboardings", value: onb.length },
        { label: "Close requests", value: closes.length },
      ],
      charts: [{ title: "Investor onboardings by stage", data: countBy(onb, "stage") }, { title: "Close requests by status", data: countBy(closes, "status") }],
    };
  };
  const finance = async () => {
    const [inv, recs, exc, k1, rev] = await Promise.all([
      q("invoices", "id, status, due_date, total_cents"),
      q("bank_reconciliations", "id, status"),
      q("accounting_exceptions", "id, kind, resolved_at", (b) => b.is("resolved_at", null)),
      q("k1_forms", "id, status"),
      q("financial_review_memos", "id, status"),
    ]);
    const unpaid = inv.filter((i) => !["paid", "void", "draft"].includes(String(i.status)));
    return {
      stats: [
        { label: "Unpaid invoices", value: unpaid.length, cents: unpaid.reduce((s, i) => s + Number(i.total_cents ?? 0), 0) },
        { label: "Overdue invoices", value: unpaid.filter((i) => i.due_date && i.due_date < today).length },
        { label: "Open accounting exceptions", value: exc.length },
        { label: "K-1s not delivered", value: k1.filter((k) => !["delivered", "superseded"].includes(String(k.status))).length },
      ],
      charts: [{ title: "Bank reconciliations", data: countBy(recs, "status") }, { title: "K-1s by status", data: countBy(k1, "status") }, { title: "Financial reviews", data: countBy(rev, "status") }, { title: "Open exceptions by kind", data: countBy(exc, "kind") }],
    };
  };
  const compliance = async () => {
    const [kyc, holds, filings, closes] = await Promise.all([
      q("account_identity_checks", "id, status"),
      q("compliance_holds", "id, status"),
      q("fund_regulatory_filings", "id, filing_type, created_at", (b) => b.is("removed_at", null).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString())),
      q("fund_close_requests", "id, status"),
    ]);
    return {
      stats: [
        { label: "Identity checks needing review", value: kyc.filter((k) => !["verified", "approved", "cleared"].includes(String(k.status))).length },
        { label: "Compliance holds", value: holds.filter((h) => !["released", "resolved", "closed"].includes(String(h.status))).length },
        { label: "Filings recorded (30 days)", value: filings.length },
        { label: "Close requests", value: closes.length },
      ],
      charts: [{ title: "Identity checks by status", data: countBy(kyc, "status") }, { title: "Holds by status", data: countBy(holds, "status") }, { title: "Recent filings by type", data: countBy(filings, "filing_type") }],
    };
  };

  if (team === "operations") return { team, title: TEAMS[team].title, teamStats, ...(await ops()) };
  if (team === "finance") return { team, title: TEAMS[team].title, teamStats, ...(await finance()) };
  if (team === "marketing") { const { marketingTeamStats } = await import("@/lib/marketing.server"); return { team, title: TEAMS[team].title, teamStats, ...(await marketingTeamStats()) }; }
  if (team === "compliance") return { team, title: TEAMS[team].title, teamStats, ...(await compliance()) };
  const [o, f, c] = await Promise.all([ops(), finance(), compliance()]);
  const byTeam: Record<string, number> = {};
  for (const [, r] of staff) for (const [k, t] of Object.entries(TEAMS)) if (t.roles.some((x) => r.includes(x))) byTeam[t.title] = (byTeam[t.title] ?? 0) + 1;
  return {
    team, title: TEAMS[team].title, teamStats,
    stats: [o.stats[0]!, o.stats[1]!, f.stats[0]!, f.stats[1]!, c.stats[0]!, c.stats[1]!],
    charts: [{ title: "Staff by team", data: byTeam }, o.charts[0]!, f.charts[1]!, c.charts[0]!],
  };
}

/** Finance overview: revenue (paid invoices) by client and month, invoices, pending quotes, team activity. Read-only. */
export async function financeOverview(viewer: string) {
  const db = await admin();
  const roles = await rolesOf(db, viewer);
  if (!isLeaderViewer(roles) && !TEAMS.finance.roles.some((r) => roles.includes(r))) throw new Error("Only the Accounting & Finance team and leadership can view this dashboard.");
  const yearAgo = new Date(); yearAgo.setMonth(yearAgo.getMonth() - 11, 1);
  const startMonth = yearAgo.toISOString().slice(0, 7);
  const [{ data: inv }, { data: quotes }, { data: clients }] = await Promise.all([
    db.from("invoices").select("id, number, client_id, status, issue_date, due_date, paid_on, total_cents, voided_at").order("issue_date", { ascending: false }).limit(5000),
    db.from("sales_quotes").select("id, quote_number, version, title, client_id, status, total_cents, valid_until, created_at").in("status", ["draft", "pending_approval", "approved", "sent"]).order("created_at", { ascending: false }).limit(500),
    db.from("clients").select("id, name, is_test_demo"),
  ]);
  const testIds = new Set(((clients ?? []) as any[]).filter((c) => c.is_test_demo).map((c) => c.id));
  if (testIds.size) {
    (inv as any[] | null)?.splice(0, (inv as any[]).length, ...((inv as any[]).filter((r) => !testIds.has(r.client_id))));
    (quotes as any[] | null)?.splice(0, (quotes as any[]).length, ...((quotes as any[]).filter((r) => !testIds.has(r.client_id))));
  }
  const name = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name as string]));
  const invoices = ((inv ?? []) as any[]).filter((i) => !i.voided_at && i.status !== "void");
  const paid = invoices.filter((i) => i.paid_on || i.status === "paid");
  const months: string[] = [];
  for (let d = new Date(yearAgo); months.length < 12; d.setMonth(d.getMonth() + 1)) months.push(d.toISOString().slice(0, 7));
  const byMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  const byClient: Record<string, { client: string; paid: number; outstanding: number; invoices: number }> = {};
  const today = new Date().toISOString().slice(0, 10);
  for (const i of invoices) {
    const c = (byClient[i.client_id ?? "none"] ??= { client: name.get(i.client_id) ?? "No client", paid: 0, outstanding: 0, invoices: 0 });
    c.invoices++;
    const cents = Number(i.total_cents ?? 0);
    if (paid.includes(i)) {
      c.paid += cents;
      const m = String(i.paid_on ?? i.issue_date ?? "").slice(0, 7);
      if (m >= startMonth && m in byMonth) byMonth[m]! += cents;
    } else if (i.status !== "draft") c.outstanding += cents;
  }
  const unpaid = invoices.filter((i) => !paid.includes(i) && i.status !== "draft");
  const q = (quotes ?? []) as any[];
  const staff = await allStaff(db);
  const members = [...staff.entries()].filter(([, r]) => TEAMS.finance.roles.some((x) => r.includes(x))).map(([id]) => id);
  const { data: acts } = members.length ? await db.from("staff_activity_events").select("id, user_id, kind, path, label, created_at").in("user_id", members).order("created_at", { ascending: false }).limit(40) : { data: [] };
  const ids = [...new Set(((acts ?? []) as any[]).map((a) => a.user_id))];
  const { data: profs } = ids.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
  const who = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Staff member"]));
  return {
    totals: {
      revenue12m: Object.values(byMonth).reduce((s, v) => s + v, 0),
      outstanding: unpaid.reduce((s, i) => s + Number(i.total_cents ?? 0), 0),
      overdue: unpaid.filter((i) => i.due_date && i.due_date < today).reduce((s, i) => s + Number(i.total_cents ?? 0), 0),
      pendingQuotes: q.reduce((s, x) => s + Number(x.total_cents ?? 0), 0),
    },
    byMonth: months.map((m) => ({ month: m, cents: byMonth[m]! })),
    byClient: Object.values(byClient).sort((a, b) => b.paid + b.outstanding - (a.paid + a.outstanding)),
    invoices: invoices.slice(0, 25).map((i) => ({ id: i.id, number: i.number, client: name.get(i.client_id) ?? "No client", status: paid.includes(i) ? "paid" : i.due_date && i.due_date < today && i.status !== "draft" ? "overdue" : i.status, issued: i.issue_date, due: i.due_date, paidOn: i.paid_on, cents: Number(i.total_cents ?? 0) })),
    payments: paid.filter((i) => i.paid_on).sort((a, b) => String(b.paid_on).localeCompare(String(a.paid_on))).slice(0, 15).map((i) => ({ id: i.id, number: i.number, client: name.get(i.client_id) ?? "No client", paidOn: i.paid_on, cents: Number(i.total_cents ?? 0) })),
    quotes: q.slice(0, 25).map((x) => ({ id: x.id, label: `Q-${x.quote_number}${x.version > 1 ? ` v${x.version}` : ""}`, title: x.title, client: name.get(x.client_id) ?? "Prospect", status: x.status, validUntil: x.valid_until, cents: Number(x.total_cents ?? 0) })),
    activity: ((acts ?? []) as any[]).map((a) => ({ id: a.id, who: who.get(a.user_id) ?? "Staff member", kind: a.kind, label: a.label ?? a.path, at: a.created_at })),
  };
}
