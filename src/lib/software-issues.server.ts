/** Software issue intake and verification. Server-only. Harmonious staff only; no notifications or external calls. */
import { viewerScope, STAFF_ROLE_SET } from "@/lib/staff-directory.server";
import { ISSUE_STAGES, nextSteps, sensitiveTextProblem, type IssueStage } from "@/lib/software-issue-model";

async function ctx(viewer: string) {
  const s = await viewerScope(viewer);
  const isStaff = s.roles.some((r) => STAFF_ROLE_SET.includes(r));
  if (!isStaff) throw new Error("Harmonious staff access is required.");
  const canWrite = s.roles.some((r) => r !== "leadership" && STAFF_ROLE_SET.includes(r));
  return { ...s, canWrite };
}

export async function listIssues(viewer: string, filters: { openOnly?: boolean; issue?: string } = {}) {
  const { db, staff, canWrite } = await ctx(viewer);
  let query = db.from("software_issues").select("*");
  if (filters.openOnly !== false) query = query.neq("stage", "resolved");
  const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error("Software issues couldn't load.");
  if (filters.issue && !(data ?? []).some((i: any) => i.id === filters.issue)) {
    const exact = await db.from("software_issues").select("*").eq("id", filters.issue).maybeSingle();
    if (exact.error) throw new Error("The selected software issue couldn't load.");
    if (exact.data) (data ?? []).unshift(exact.data);
  }
  const ids = ((data ?? []) as any[]).map((i) => i.id);
  const eventsResult = ids.length ? await db.from("software_issue_events").select("issue_id, actor_user_id, from_stage, to_stage, note, created_at").in("issue_id", ids).order("created_at") : { data: [], error: null };
  if (eventsResult.error) throw new Error("Software issue history couldn't load.");
  const ev = eventsResult.data;
  const people = [...staff.keys()];
  const { data: profs } = people.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", people) : { data: [] };
  const nm = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Staff member"]));
  const name = (id: string | null) => (id ? nm.get(id) ?? "Staff member" : null);
  return {
    viewer, canWrite, truncated: (data ?? []).length >= 500,
    staff: people.map((id) => ({ id, name: name(id) ?? "Staff member" })).sort((a, b) => a.name.localeCompare(b.name)),
    issues: ((data ?? []) as any[]).map((i) => ({
      ...i, ownerName: name(i.technical_owner_user_id), retesterName: name(i.retester_user_id), reporterName: name(i.reporter_user_id),
      steps_allowed: canWrite ? nextSteps(i.stage, { owner: i.technical_owner_user_id === viewer, retester: i.retester_user_id === viewer }) : [],
      events: ((ev ?? []) as any[]).filter((e) => e.issue_id === i.id).map((e) => ({ ...e, who: name(e.actor_user_id) })),
    })),
  };
}

export async function reportIssue(viewer: string, d: { title: string; expected: string; actual: string; steps: string; impact: string; page?: string | undefined; occurredAt?: string | undefined; recordRef?: string | undefined; owner: string; retester: string; priority?: string | undefined }) {
  const { db, staff, canWrite } = await ctx(viewer);
  if (!canWrite) throw new Error("Your role can view issues but not report them.");
  if (!staff.has(d.owner) || !staff.has(d.retester)) throw new Error("The technical owner and retester must be Harmonious staff.");
  for (const text of [d.title, d.expected, d.actual, d.steps, d.impact, d.page ?? "", d.recordRef ?? ""]) {
    const problem = sensitiveTextProblem(text);
    if (problem) throw new Error(problem);
  }
  if (d.recordRef && !/^\/[A-Za-z0-9/_\-.$?=&%]*$/.test(d.recordRef)) throw new Error("Use the page address within Harmonious (starting with /) for the record reference.");
  const { data, error } = await db.rpc("software_issue_report", { _actor: viewer, _p: d });
  if (error) throw new Error(error.message);
  return { id: data as string };
}

export async function moveIssue(viewer: string, d: { id: string; to: IssueStage; note?: string | undefined }) {
  const { db, canWrite } = await ctx(viewer);
  if (!canWrite) throw new Error("Your role can view issues but not change them.");
  if (!ISSUE_STAGES.includes(d.to)) throw new Error("Unknown stage.");
  const problem = d.note ? sensitiveTextProblem(d.note) : null;
  if (problem) throw new Error(problem);
  const { error } = await db.rpc("software_issue_move", { _issue: d.id, _actor: viewer, _to: d.to, _note: d.note ?? null });
  if (error) throw new Error(error.message);
  return { ok: true };
}
