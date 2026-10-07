/**
 * Approval Center. Server-only; one approval system built on staff_tasks responsibility.
 * Staff prepare → a different staff member completes internal review → the fund's managers decide.
 * Harmonious staff can never approve on a client's behalf. Approved/closed versions are frozen (DB trigger);
 * material changes create a new version and supersede the old one. Every action is in append-only approval_events.
 * Approval never moves money: payments/distributions stay in their separate controlled workflows.
 */
import { approvalType, requiredApproversByPolicy, CLIENT_VISIBLE_APPROVAL_STATUSES } from "@/lib/approval-types";
import { staffWriter } from "@/lib/fund-calendar.server";
import { notifyFundManagers } from "@/lib/client-work-notify.server";

async function admin() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any; }

const CLIENT_COLS = "id, fund_id, task_id, approval_type, title, description, status, approval_amount, currency, effective_date, due_date, requested_at, approved_at, client_visible_summary, calculation_summary, supporting_documents, related_workflow_type, version, root_id, supersedes_id, required_approver_count, prepared_by, reviewed_by, service_request_id, created_at, updated_at";

async function isFundManager(db: any, uid: string, fundId: string) {
  const { data } = await db.from("fund_managers").select("id").eq("user_id", uid).eq("offering_id", fundId).maybeSingle();
  return !!data;
}
/** Approver count from configurable approval_policies (client-specific override first). */
async function approversFor(db: any, type: string, amount: number | null | undefined, fundId: string) {
  const [{ data: pol }, { data: f }] = await Promise.all([db.from("approval_policies").select("*").eq("active", true), db.from("offerings").select("client_id").eq("id", fundId).maybeSingle()]);
  return requiredApproversByPolicy(type, amount, (pol ?? []) as any, f?.client_id ?? null).approvers;
}

async function names(db: any, ids: (string | null | undefined)[]) {
  const u = [...new Set(ids.filter(Boolean))] as string[];
  if (!u.length) return new Map<string, string>();
  const { data } = await db.from("profiles").select("user_id, legal_name, email").in("user_id", u);
  return new Map<string, string>(((data ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email]));
}
const log = (db: any, a: { id: string; fund_id: string; version: number }, actor: string | null, action: string, comment?: string | null, clientVisible = true, detail: any = {}) =>
  db.from("approval_events").insert({ approval_id: a.id, fund_id: a.fund_id, version: a.version, actor_user_id: actor, action, comment: comment ?? null, client_visible: clientVisible, detail });

/** Keep the linked task's responsibility in step (automatic transition, logged by the task trigger). */
async function syncTask(db: any, a: any, responsibility: string, extra: Record<string, unknown> = {}) {
  if (!a.task_id) return;
  await db.from("staff_tasks").update({
    responsibility_status: responsibility, responsibility_manual: false, approval_type: a.approval_type, approval_record_id: a.id,
    approval_amount: a.approval_amount, approval_due_date: a.due_date, approval_status: a.status, prepared_by: a.prepared_by,
    reviewed_by: a.reviewed_by, updated_at: new Date().toISOString(), ...extra,
  }).eq("id", a.task_id);
}

export async function listApprovals(uid: string, fundId: string) {
  const { assertFund } = await import("@/lib/fund-tabs.server");
  const { staff } = await assertFund(uid, fundId);
  const db = await admin();
  let q = db.from("approvals").select(staff ? `${CLIENT_COLS}, internal_notes` : CLIENT_COLS).eq("fund_id", fundId).order("created_at", { ascending: false }).limit(500);
  if (!staff) q = q.in("status", CLIENT_VISIBLE_APPROVAL_STATUSES);
  const { data } = await q;
  const rows = (data ?? []) as any[];
  const nm = await names(db, rows.flatMap((r) => [r.prepared_by, r.reviewed_by]));
  return { staff, canDecide: !staff && (await isFundManager(db, uid, fundId)), rows: rows.map((r) => ({ ...r, preparedByName: staff ? nm.get(r.prepared_by) ?? null : "Harmonious Fund Administration", reviewedByName: staff ? nm.get(r.reviewed_by) ?? null : r.reviewed_by ? "Harmonious" : null })) };
}

/** Staff cross-fund list with filters (Operations). */
export async function listAllApprovals(uid: string) {
  await staffWriter(uid);
  const db = await admin();
  const { data } = await db.from("approvals").select(`${CLIENT_COLS}, internal_notes`).not("status", "in", "(SUPERSEDED)").order("created_at", { ascending: false }).limit(1000);
  const rows = (data ?? []) as any[];
  const fundIds = [...new Set(rows.map((r) => r.fund_id))];
  const [{ data: funds }, { data: engs }] = await Promise.all([
    fundIds.length ? db.from("offerings").select("id, name").in("id", fundIds) : Promise.resolve({ data: [] }),
    fundIds.length ? db.from("service_engagements").select("fund_id, service_level, primary_administrator_user_id, relationship_lead_user_id").in("fund_id", fundIds).not("service_status", "in", "(CANCELLED,EXPIRED)") : Promise.resolve({ data: [] }),
  ]);
  const fm = new Map(((funds ?? []) as any[]).map((f) => [f.id, f.name]));
  const em = new Map(((engs ?? []) as any[]).map((e) => [e.fund_id, e]));
  const nm = await names(db, [...rows.flatMap((r) => [r.prepared_by, r.reviewed_by]), ...((engs ?? []) as any[]).flatMap((e) => [e.primary_administrator_user_id, e.relationship_lead_user_id])]);
  return rows.map((r) => {
    const e: any = em.get(r.fund_id);
    return { ...r, fundName: fm.get(r.fund_id) ?? "Fund", serviceLevel: e?.service_level ?? null, primaryAdministrator: nm.get(e?.primary_administrator_user_id) ?? null, relationshipLead: nm.get(e?.relationship_lead_user_id) ?? null, preparedByName: nm.get(r.prepared_by) ?? null };
  });
}

export async function getApproval(uid: string, id: string) {
  const db = await admin();
  const { data: a } = await db.from("approvals").select("*").eq("id", id).maybeSingle();
  if (!a) throw new Error("Approval not found.");
  const { assertFund } = await import("@/lib/fund-tabs.server");
  const { staff } = await assertFund(uid, a.fund_id);
  if (!staff && !CLIENT_VISIBLE_APPROVAL_STATUSES.includes(a.status)) throw new Error("Approval not found.");
  let ev = db.from("approval_events").select("id, version, actor_user_id, action, comment, client_visible, created_at").eq("approval_id", id).order("created_at");
  if (!staff) ev = ev.eq("client_visible", true);
  const [{ data: events }, { data: decisions }, { data: versions }] = await Promise.all([
    ev,
    db.from("approval_decisions").select("user_id, decision, certified, comment, version, created_at").eq("approval_id", id).order("created_at"),
    db.from("approvals").select("id, version, status, approval_amount, created_at").eq("root_id", a.root_id).order("version"),
  ]);
  const nm = await names(db, [a.prepared_by, a.reviewed_by, ...((events ?? []) as any[]).map((e) => e.actor_user_id), ...((decisions ?? []) as any[]).map((d) => d.user_id)]);
  const canDecide = !staff && a.status === "AWAITING_APPROVAL" && (await isFundManager(db, uid, a.fund_id));
  if (!staff) {
    const already = ((events ?? []) as any[]).some((e) => e.action === "client_viewed" && e.actor_user_id === uid && e.version === a.version);
    if (!already && a.status === "AWAITING_APPROVAL") await log(db, a, uid, "client_viewed", null, false);
  }
  const cfg = approvalType(a.approval_type);
  const { internal_notes, ...safe } = a;
  return {
    staff, canDecide, certification: cfg.certification, highRisk: cfg.highRisk,
    approval: { ...(staff ? a : safe), preparedByName: staff ? nm.get(a.prepared_by) ?? null : "Harmonious Fund Administration", reviewedByName: a.reviewed_by ? (staff ? nm.get(a.reviewed_by) ?? null : "Harmonious") : null },
    events: ((events ?? []) as any[]).map((e) => ({ ...e, who: e.actor_user_id ? (staff ? nm.get(e.actor_user_id) ?? "User" : nm.get(e.actor_user_id) ?? "Harmonious") : "System" })),
    decisions: ((decisions ?? []) as any[]).filter((d) => d.version === a.version).map((d) => ({ ...d, who: nm.get(d.user_id) ?? "Fund manager" })),
    versions: (versions ?? []) as any[],
  };
}

export type ApprovalInput = {
  fundId: string; type: string; title: string; description?: string | null | undefined; amount?: number | null | undefined; effectiveDate?: string | null | undefined;
  dueDate?: string | null | undefined; summary?: string | null | undefined; calculation?: { label: string; value: string }[] | undefined;
  documents?: { name: string; path?: string | null | undefined }[] | undefined; internalNotes?: string | null | undefined; taskId?: string | null | undefined; serviceRequestId?: string | null | undefined;
};

export async function createApproval(uid: string, d: ApprovalInput) {
  await staffWriter(uid);
  const db = await admin();
  const { data: eng } = await db.from("service_engagements").select("id").eq("fund_id", d.fundId).not("service_status", "in", "(CANCELLED,EXPIRED)").limit(1).maybeSingle();
  let taskId = d.taskId ?? null;
  if (!taskId) {
    const { data: t } = await db.from("staff_tasks").insert({
      title: `${approvalType(d.type).label} approval: ${d.title}`, priority: "high", status: "open", team: "operations", offering_id: d.fundId,
      due_date: d.dueDate || null, created_by: uid, source: "workflow", responsibility_status: "HARMONIOUS_HANDLING", client_visibility: true,
      related_workflow_type: "approval", approval_type: d.type, approval_amount: d.amount ?? null, prepared_by: uid,
    }).select("id").single();
    taskId = t?.id ?? null;
  }
  const { data: a, error } = await db.from("approvals").insert({
    fund_id: d.fundId, task_id: taskId, service_engagement_id: eng?.id ?? null, service_request_id: d.serviceRequestId ?? null,
    approval_type: d.type, title: d.title, description: d.description || null, approval_amount: d.amount ?? null,
    effective_date: d.effectiveDate || null, due_date: d.dueDate || null, client_visible_summary: d.summary || null,
    calculation_summary: d.calculation ?? [], supporting_documents: d.documents ?? [], internal_notes: d.internalNotes || null,
    prepared_by: uid, requested_by: uid, status: "DRAFT", required_approver_count: await approversFor(db, d.type, d.amount, d.fundId),
  }).select("*").single();
  if (error) throw new Error(error.message);
  if (taskId) await db.from("staff_tasks").update({ related_workflow_id: a.id, approval_record_id: a.id, approval_status: "DRAFT" }).eq("id", taskId);
  await log(db, a, uid, "created", null, false);
  return { id: a.id as string };
}

export async function submitForReview(uid: string, id: string) {
  await staffWriter(uid);
  const db = await admin();
  const { data: a } = await db.from("approvals").select("*").eq("id", id).maybeSingle();
  if (!a || a.status !== "DRAFT") throw new Error("Only drafts can be sent for internal review.");
  await db.from("approvals").update({ status: "INTERNAL_REVIEW" }).eq("id", id);
  await log(db, a, uid, "internal_review_requested", null, false);
  return { ok: true };
}

/** Maker-checker: the reviewer must differ from the preparer (Super Admin may self-review with a logged reason). */
export async function completeReview(uid: string, id: string, reason?: string | null) {
  const s = await staffWriter(uid);
  const db = await admin();
  const { data: a } = await db.from("approvals").select("*").eq("id", id).maybeSingle();
  if (!a || a.status !== "INTERNAL_REVIEW") throw new Error("This approval isn't waiting for internal review.");
  if (a.prepared_by === uid) {
    if (!s.roles.includes("super_admin")) throw new Error("A different Harmonious team member must complete the internal review.");
    if (!reason || reason.trim().length < 10) throw new Error("Give a reason (10+ characters) to review your own work.");
    await db.from("self_approval_overrides").insert({ user_id: uid, action: "approval_internal_review", resource_id: id, reason: reason.trim() } as any).then(() => undefined, () => undefined);
  }
  const now = new Date().toISOString();
  const { data: upd, error } = await db.from("approvals").update({ status: "AWAITING_APPROVAL", reviewed_by: uid, requested_at: now }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  await log(db, upd, uid, "internal_review_completed", reason ?? null, false);
  await log(db, upd, uid, "approval_requested");
  await syncTask(db, upd, "CLIENT_APPROVAL_REQUIRED");
  await notifyFundManagers(a.fund_id, "approval_required", a.title, `/manager/fund/${a.fund_id}/approvals`);
  return { ok: true };
}

export async function decide(uid: string, d: { id: string; decision: "APPROVE" | "REQUEST_CHANGES"; certified: boolean; confirmText?: string | null | undefined; comment?: string | null | undefined; version: number }) {
  const db = await admin();
  const { data: a } = await db.from("approvals").select("*").eq("id", d.id).maybeSingle();
  if (!a) throw new Error("Approval not found.");
  const { isStaff } = await import("@/lib/fund-tabs.server");
  if (await isStaff(uid)) throw new Error("Harmonious staff cannot approve on a client's behalf.");
  if (!(await isFundManager(db, uid, a.fund_id))) throw new Error("Only an authorized fund manager can decide this approval.");
  if (a.status !== "AWAITING_APPROVAL") throw new Error("This approval is no longer waiting for a decision.");
  if (d.version !== a.version) throw new Error("This approval was updated. Please review the latest version.");
  const cfg = approvalType(a.approval_type);
  if (d.decision === "REQUEST_CHANGES") {
    if (!d.comment || d.comment.trim().length < 3) throw new Error("Tell Harmonious what should change.");
    await db.from("approval_decisions").insert({ approval_id: a.id, version: a.version, user_id: uid, decision: "REQUEST_CHANGES", comment: d.comment.trim() });
    const { data: upd } = await db.from("approvals").update({ status: "CHANGES_REQUESTED", rejected_at: new Date().toISOString(), rejected_by: uid, decision_notes: d.comment.trim() }).eq("id", a.id).select("*").single();
    await log(db, upd, uid, "changes_requested", d.comment.trim());
    await syncTask(db, upd, "HARMONIOUS_HANDLING");
    return { status: "CHANGES_REQUESTED" };
  }
  if (cfg.certification && !d.certified) throw new Error("Please confirm the certification to approve.");
  if (cfg.highRisk) {
    const { data: f } = await db.from("offerings").select("name").eq("id", a.fund_id).maybeSingle();
    if ((d.confirmText ?? "").trim().toLowerCase() !== String(f?.name ?? "").trim().toLowerCase()) throw new Error("Type the fund name exactly to confirm this approval.");
  }
  const { error } = await db.from("approval_decisions").insert({ approval_id: a.id, version: a.version, user_id: uid, decision: "APPROVE", certified: !!d.certified, certification_text: cfg.certification, comment: d.comment?.trim() || null });
  if (error) throw new Error("You have already approved this version.");
  const { data: all } = await db.from("approval_decisions").select("user_id").eq("approval_id", a.id).eq("version", a.version).eq("decision", "APPROVE");
  const count = new Set(((all ?? []) as any[]).map((x) => x.user_id)).size;
  if (count < a.required_approver_count) {
    await log(db, a, uid, "partial_approval", `Approval ${count} of ${a.required_approver_count} recorded. Another authorized fund manager must also approve.`);
    return { status: "AWAITING_APPROVAL", remaining: a.required_approver_count - count };
  }
  const { data: upd } = await db.from("approvals").update({ status: "APPROVED", approved_at: new Date().toISOString(), approved_by: uid, decision_notes: d.comment?.trim() || null }).eq("id", a.id).select("*").single();
  await log(db, upd, uid, "approved", d.comment ?? null);
  await syncTask(db, upd, "HARMONIOUS_HANDLING");
  return { status: "APPROVED" };
}

/** Material change → new version; prior open/approved version is superseded, never edited. */
export async function revise(uid: string, d: ApprovalInput & { id: string; reason: string }) {
  await staffWriter(uid);
  const db = await admin();
  const { data: a } = await db.from("approvals").select("*").eq("id", d.id).maybeSingle();
  if (!a || ["COMPLETED", "SUPERSEDED", "WITHDRAWN"].includes(a.status)) throw new Error("This approval can't be revised.");
  if (!d.reason || d.reason.trim().length < 5) throw new Error("Give a reason for the new version.");
  await db.from("approvals").update({ status: "SUPERSEDED" }).eq("id", a.id);
  await log(db, a, uid, "superseded", d.reason.trim());
  const { data: n, error } = await db.from("approvals").insert({
    fund_id: a.fund_id, task_id: a.task_id, service_engagement_id: a.service_engagement_id, service_request_id: a.service_request_id,
    approval_type: a.approval_type, title: d.title || a.title, description: d.description ?? a.description,
    approval_amount: d.amount !== undefined ? d.amount : a.approval_amount, effective_date: d.effectiveDate ?? a.effective_date, due_date: d.dueDate ?? a.due_date,
    client_visible_summary: d.summary ?? a.client_visible_summary, calculation_summary: d.calculation ?? a.calculation_summary,
    supporting_documents: d.documents ?? a.supporting_documents, internal_notes: d.internalNotes ?? a.internal_notes,
    prepared_by: uid, requested_by: uid, status: "DRAFT", version: a.version + 1, supersedes_id: a.id, root_id: a.root_id,
    required_approver_count: await approversFor(db, a.approval_type, d.amount !== undefined ? d.amount : a.approval_amount, a.fund_id),
  }).select("*").single();
  if (error) throw new Error(error.message);
  await log(db, n, uid, "version_created", d.reason.trim(), true, { from_version: a.version });
  await syncTask(db, n, "HARMONIOUS_HANDLING", { approval_record_id: n.id, related_workflow_id: n.id });
  return { id: n.id as string };
}

export async function withdraw(uid: string, id: string, reason: string) {
  await staffWriter(uid);
  const db = await admin();
  const { data: a } = await db.from("approvals").select("*").eq("id", id).maybeSingle();
  if (!a || !["DRAFT", "INTERNAL_REVIEW", "AWAITING_APPROVAL", "CHANGES_REQUESTED"].includes(a.status)) throw new Error("This approval can't be withdrawn.");
  const { data: upd } = await db.from("approvals").update({ status: "WITHDRAWN" }).eq("id", id).select("*").single();
  await log(db, upd, uid, "withdrawn", reason);
  await syncTask(db, upd, "HARMONIOUS_HANDLING");
  return { ok: true };
}

export async function completeApproval(uid: string, id: string) {
  await staffWriter(uid);
  const db = await admin();
  const { data: a } = await db.from("approvals").select("*").eq("id", id).maybeSingle();
  if (!a || a.status !== "APPROVED") throw new Error("Only approved items can be marked complete.");
  const { data: upd } = await db.from("approvals").update({ status: "COMPLETED" }).eq("id", id).select("*").single();
  await log(db, upd, uid, "workflow_completed");
  if (a.task_id) await db.from("staff_tasks").update({ status: "done", completed_at: new Date().toISOString(), approval_status: "COMPLETED", responsibility_manual: false }).eq("id", a.task_id);
  return { ok: true };
}
