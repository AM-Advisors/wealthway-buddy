/**
 * Service Request Center (fund operational requests). Server-only. Clients choose an outcome; Harmonious routes it
 * by configurable team, creates the internal task, checks entitlements (never blocks; flags Service Review Required),
 * runs an SLA clock that pauses while the client/investor/third party is blocking, and keeps client-visible vs
 * internal messages, files and events separate. Distinct from the commercial service_requests (scope amendments).
 */
import { requestType, requestResponsibility, SLA_PAUSED, entitlementFor, missingFields, isOpenRequest, TEAM_ROUTING, REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/service-request-types";
import { staffWriter, entitledFeatures } from "@/lib/fund-calendar.server";
import { notifyFundManagers } from "@/lib/client-work-notify.server";

async function admin() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any; }
const BUCKET = "fund-formation";
const CLIENT_COLS = "id, fund_id, request_type, title, description, details, status, responsibility_status, stage, priority, entitlement_status, submitted_at, due_date, completed_at, client_notes, created_at, updated_at, requested_by";

const ev = (db: any, r: { id: string; fund_id: string }, actor: string | null, kind: string, clientVisible: boolean, detail: any = {}) =>
  db.from("fund_request_events").insert({ request_id: r.id, fund_id: r.fund_id, actor_user_id: actor, kind, client_visible: clientVisible, detail });

async function access(uid: string, fundId: string) {
  const { assertFund } = await import("@/lib/fund-tabs.server");
  return (await assertFund(uid, fundId)).staff;
}

export async function listRequests(uid: string, fundId: string) {
  const staff = await access(uid, fundId);
  const db = await admin();
  let q = db.from("fund_service_requests").select(staff ? "*" : CLIENT_COLS).eq("fund_id", fundId).order("created_at", { ascending: false }).limit(500);
  if (!staff) q = q.eq("client_visibility", true).neq("status", "DRAFT");
  const { data } = await q;
  return { staff, rows: (data ?? []) as any[] };
}

export async function listAllRequests(uid: string) {
  await staffWriter(uid);
  const db = await admin();
  const { data } = await db.from("fund_service_requests").select("*").order("created_at", { ascending: false }).limit(1000);
  const rows = (data ?? []) as any[];
  const fundIds = [...new Set(rows.map((r) => r.fund_id))];
  const [{ data: funds }, { data: engs }] = await Promise.all([
    fundIds.length ? db.from("offerings").select("id, name, client_id").in("id", fundIds) : Promise.resolve({ data: [] }),
    fundIds.length ? db.from("service_engagements").select("fund_id, service_level").in("fund_id", fundIds).not("service_status", "in", "(CANCELLED,EXPIRED)") : Promise.resolve({ data: [] }),
  ]);
  const clientIds = [...new Set(((funds ?? []) as any[]).map((f) => f.client_id).filter(Boolean))];
  const { data: clients } = clientIds.length ? await db.from("clients").select("id, name").in("id", clientIds) : { data: [] };
  const cm = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));
  const fm = new Map(((funds ?? []) as any[]).map((f) => [f.id, f]));
  const em = new Map(((engs ?? []) as any[]).map((e) => [e.fund_id, e.service_level]));
  const ids = [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))];
  const { data: profs } = ids.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
  const nm = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email]));
  return rows.map((r) => ({ ...r, fundName: (fm.get(r.fund_id) as any)?.name ?? "Fund", clientName: cm.get((fm.get(r.fund_id) as any)?.client_id) ?? null, serviceLevel: em.get(r.fund_id) ?? null, assignedName: nm.get(r.assigned_to) ?? null, sla: slaState(r) }));
}

/** SLA: Harmonious-controlled time only (paused minutes excluded). */
export function slaState(r: any, now = Date.now()) {
  if (!r.sla_due_at || !isOpenRequest(r.status)) return null;
  const pausedNow = r.sla_paused_at ? Math.round((now - Date.parse(r.sla_paused_at)) / 60000) : 0;
  const due = Date.parse(r.sla_due_at) + (Number(r.sla_paused_minutes ?? 0) + pausedNow) * 60000;
  const hoursLeft = Math.round((due - now) / 3_600_000);
  return { paused: !!r.sla_paused_at, dueAt: new Date(due).toISOString(), hoursLeft, breached: !r.first_response_at && hoursLeft < 0, atRisk: !r.first_response_at && hoursLeft >= 0 && hoursLeft <= 4 };
}

export async function getRequest(uid: string, id: string) {
  const db = await admin();
  const { data: r } = await db.from("fund_service_requests").select("*").eq("id", id).maybeSingle();
  if (!r) throw new Error("Request not found.");
  const staff = await access(uid, r.fund_id);
  if (!staff && (!r.client_visibility || r.status === "DRAFT")) throw new Error("Request not found.");
  let mq = db.from("fund_request_messages").select("*").eq("request_id", id).order("created_at");
  let fq = db.from("fund_request_files").select("id, file_name, category, visibility, created_at, uploaded_by").eq("request_id", id).order("created_at");
  let eq = db.from("fund_request_events").select("id, kind, detail, client_visible, created_at, actor_user_id").eq("request_id", id).order("created_at");
  if (!staff) { mq = mq.eq("visibility", "CLIENT"); fq = fq.eq("visibility", "CLIENT"); eq = eq.eq("client_visible", true); }
  const [{ data: messages }, { data: files }, { data: events }, { data: approvals }] = await Promise.all([
    mq, fq, eq, db.from("approvals").select("id, title, status, version").eq("service_request_id", id).not("status", "in", "(SUPERSEDED,DRAFT)"),
  ]);
  const ids = [...new Set([...((messages ?? []) as any[]).map((m) => m.author_user_id), ...(staff ? [r.assigned_to] : [])].filter(Boolean))];
  const { data: profs } = ids.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
  const nm = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email]));
  const def = requestType(r.request_type);
  const safe = staff ? { ...r, sla: slaState(r), assignedName: nm.get(r.assigned_to) ?? null, teamLabel: TEAM_ROUTING[r.assigned_team]?.label ?? r.assigned_team }
    : Object.fromEntries(Object.entries(r).filter(([k]) => CLIENT_COLS.split(", ").includes(k)));
  return {
    staff, request: safe, stages: def.stages, irreversible: def.irreversible,
    messages: ((messages ?? []) as any[]).map((m) => ({ ...m, who: m.author_side === "HARMONIOUS" && !staff ? "Harmonious" : nm.get(m.author_user_id) ?? (m.author_side === "HARMONIOUS" ? "Harmonious" : "Fund manager") })),
    files: (files ?? []) as any[], events: ((events ?? []) as any[]).map(({ actor_user_id, ...e }) => e), approvals: (approvals ?? []) as any[],
  };
}

/** Obvious duplicate: another open request of the same type on this fund. */
export async function findDuplicate(db: any, fundId: string, type: string) {
  const { data } = await db.from("fund_service_requests").select("id, title").eq("fund_id", fundId).eq("request_type", type).not("status", "in", "(COMPLETED,CANCELLED,DRAFT)").limit(1);
  return ((data ?? []) as any[])[0] ?? null;
}

async function upload(db: any, fundId: string, requestId: string, uid: string, file: { name: string; base64: string; category?: string | undefined }, visibility: "CLIENT" | "INTERNAL") {
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const path = `service-requests/${fundId}/${requestId}/${Date.now()}-${safe}`;
  const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(file.base64, "base64"), { contentType: safe.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream" });
  if (error) throw new Error("Could not upload the file.");
  await db.from("fund_request_files").insert({ request_id: requestId, fund_id: fundId, storage_path: path, file_name: safe, category: file.category || "supporting", uploaded_by: uid, visibility });
}

export async function createRequest(uid: string, d: {
  fundId: string; type: string; details: Record<string, string>; priority: "normal" | "high" | "urgent"; urgentReason?: string | null | undefined;
  confirmDuplicate?: boolean | undefined; files?: { name: string; base64: string; category?: string | undefined }[] | undefined;
}) {
  const staff = await access(uid, d.fundId);
  const db = await admin();
  const def = requestType(d.type);
  const missing = missingFields(d.type, d.details);
  if (missing.length) throw new Error(`Please complete: ${missing.join(", ")}.`);
  if (d.priority === "urgent" && (!d.urgentReason || d.urgentReason.trim().length < 10)) throw new Error("Tell us why this is urgent (10+ characters).");
  if (!d.confirmDuplicate) {
    const dup = await findDuplicate(db, d.fundId, d.type);
    if (dup) return { duplicate: { id: dup.id, title: dup.title } };
  }
  const { features, engagements } = await entitledFeatures(db, d.fundId);
  const eng = engagements[0] ?? null;
  const { data: engFull } = eng ? await db.from("service_engagements").select("id, service_product, service_level, response_sla, sla_initial_response_hours, sla_resolution_target_hours").eq("id", eng.id).maybeSingle() : { data: null };
  const { data: policies } = await db.from("service_sla_policies").select("*").eq("active", true);
  const { resolveSla } = await import("@/lib/sla-policy");
  const sla = resolveSla(engFull as any, (policies ?? []) as any, d.type);
  const entitlement = entitlementFor(d.type, features);
  const hours = sla.hours;
  const now = new Date();
  const subject = d.details["subject"] || d.details["purpose"] || d.details["issuer"] || d.details["name"] || d.details["report"] || d.details["filing"] || d.details["document"] || "";
  const title = `${def.label.replace(/^Request an? /, "")}${subject ? `: ${String(subject).slice(0, 120)}` : ""}`;
  const route = TEAM_ROUTING[def.team] ?? TEAM_ROUTING["operations"]!;
  const dueDate = d.details["deadline"] || d.details["pay_date"] || d.details["due"] || d.details["date"] || null;
  const { data: r, error } = await db.from("fund_service_requests").insert({
    fund_id: d.fundId, service_engagement_id: eng?.id ?? null, request_type: d.type, title, description: d.details["notes"] || d.details["description"] || null,
    details: d.details, status: "SUBMITTED", responsibility_status: "HARMONIOUS_HANDLING", priority: d.priority, urgent_reason: d.urgentReason || null,
    entitlement_status: entitlement, requested_by: uid, assigned_team: def.team, submitted_at: now.toISOString(),
    due_date: dueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(dueDate)) ? dueDate : null, sla_hours: hours, sla_source: sla.source, sla_policy_id: sla.policyId,
    sla_due_at: hours == null ? null : new Date(now.getTime() + hours * 3_600_000).toISOString(), irreversible: def.irreversible,
  }).select("*").single();
  if (error) throw new Error(error.message);
  const { data: task } = await db.from("staff_tasks").insert({
    title: `Client request: ${title}`, description: `${def.label} submitted by the fund manager. Open it in the fund's Requests tab.`,
    priority: d.priority === "normal" ? "normal" : d.priority, status: "open", team: route.taskTeam, offering_id: d.fundId, due_date: r.due_date,
    created_by: uid, source: "workflow", source_ref: `fund_request:${r.id}`, responsibility_status: "HARMONIOUS_HANDLING", client_visibility: false,
    related_workflow_type: "fund_service_request", related_workflow_id: r.id, sla_due_date: r.sla_due_at ? r.sla_due_at.slice(0, 10) : null, service_engagement_id: eng?.id ?? null,
  }).select("id").single();
  let reviewTask: any = null;
  if (entitlement !== "INCLUDED") {
    ({ data: reviewTask } = await db.from("staff_tasks").insert({
      title: `Service review required: ${title}`, description: "This request may be outside the fund's current service scope. Review scope and pricing before work begins. Do not charge automatically.",
      priority: "high", status: "open", team: "sales", offering_id: d.fundId, created_by: uid, source: "workflow", source_ref: `fund_request_review:${r.id}`,
      responsibility_status: "HARMONIOUS_HANDLING", client_visibility: false, related_workflow_type: "fund_service_request", related_workflow_id: r.id,
    }).select("id").single());
  }
  await db.from("fund_service_requests").update({ task_id: task?.id ?? null, review_task_id: reviewTask?.id ?? null }).eq("id", r.id);
  for (const f of d.files ?? []) await upload(db, d.fundId, r.id, uid, f, "CLIENT");
  await ev(db, r, uid, staff ? "submitted_by_staff" : "submitted", true, { type: d.type });
  if (entitlement !== "INCLUDED") await ev(db, r, null, "service_review_required", false);
  return { id: r.id as string };
}

export async function postMessage(uid: string, d: { id: string; body: string; internal?: boolean | undefined; file?: { name: string; base64: string; category?: string | undefined } | null | undefined }) {
  const db = await admin();
  const { data: r } = await db.from("fund_service_requests").select("*").eq("id", d.id).maybeSingle();
  if (!r) throw new Error("Request not found.");
  const staff = await access(uid, r.fund_id);
  const visibility = staff && d.internal ? "INTERNAL" : "CLIENT";
  if (d.body.trim()) await db.from("fund_request_messages").insert({ request_id: r.id, author_user_id: uid, author_side: staff ? "HARMONIOUS" : "CLIENT", visibility, body: d.body.trim().slice(0, 8000) });
  if (d.file) await upload(db, r.fund_id, r.id, uid, d.file, visibility);
  if (staff && visibility === "CLIENT" && !r.first_response_at) await db.from("fund_service_requests").update({ first_response_at: new Date().toISOString() }).eq("id", r.id);
  if (!staff) {
    await ev(db, r, uid, r.status === "WAITING_ON_CLIENT" ? "client_provided_information" : "client_message", true);
    if (r.task_id) await db.from("staff_task_events").insert({ task_id: r.task_id, actor_user_id: uid, kind: "comment", detail: { text: r.status === "WAITING_ON_CLIENT" ? "Client provided information on the request." : "Client sent a message on the request." } });
  } else if (visibility === "CLIENT") await ev(db, r, uid, "harmonious_reply", true);
  await db.from("fund_service_requests").update({ updated_at: new Date().toISOString() }).eq("id", r.id);
  return { ok: true };
}

export async function updateRequest(uid: string, d: {
  id: string; status?: RequestStatus | undefined; stage?: number | undefined; assignedTo?: string | null | undefined; assignedTeam?: string | undefined;
  dueDate?: string | null | undefined; clientNotes?: string | null | undefined; internalNotes?: string | null | undefined; reason?: string | null | undefined;
}) {
  const s = await staffWriter(uid);
  const db = await admin();
  const { data: r } = await db.from("fund_service_requests").select("*").eq("id", d.id).maybeSingle();
  if (!r) throw new Error("Request not found.");
  if (d.assignedTo && !s.staff.has(d.assignedTo)) throw new Error("Assign requests to Harmonious staff only.");
  const now = new Date();
  const patch: any = { updated_at: now.toISOString() };
  if (d.stage !== undefined) patch.stage = Math.max(0, Math.min(d.stage, requestType(r.request_type).stages.length - 1));
  if (d.assignedTo !== undefined) patch.assigned_to = d.assignedTo;
  if (d.assignedTeam) patch.assigned_team = d.assignedTeam;
  if (d.dueDate !== undefined) patch.due_date = d.dueDate || null;
  if (d.clientNotes !== undefined) patch.client_notes = d.clientNotes || null;
  if (d.internalNotes !== undefined) patch.internal_notes = d.internalNotes || null;
  const statusChanged = d.status && d.status !== r.status;
  if (statusChanged) {
    patch.status = d.status; patch.responsibility_status = requestResponsibility(d.status!);
    const wasPaused = SLA_PAUSED.has(r.status), nowPaused = SLA_PAUSED.has(d.status!);
    if (!wasPaused && nowPaused) patch.sla_paused_at = now.toISOString();
    if (wasPaused && !nowPaused && r.sla_paused_at) { patch.sla_paused_minutes = Number(r.sla_paused_minutes ?? 0) + Math.round((now.getTime() - Date.parse(r.sla_paused_at)) / 60000); patch.sla_paused_at = null; }
    if (d.status === "COMPLETED") { patch.completed_at = now.toISOString(); patch.stage = requestType(r.request_type).stages.length - 1; }
    if (!r.first_response_at && d.status !== "SUBMITTED") patch.first_response_at = now.toISOString();
  }
  const { error } = await db.from("fund_service_requests").update(patch).eq("id", r.id);
  if (error) throw new Error(error.message);
  if (statusChanged) {
    await ev(db, r, uid, "status", true, { from: r.status, to: d.status, label: REQUEST_STATUS_LABEL[d.status!] });
    if (patch.sla_paused_at && !r.sla_paused_at) await ev(db, r, uid, "sla_paused", false, { status: d.status });
    if (patch.sla_paused_minutes !== undefined) await ev(db, r, uid, "sla_resumed", false, { paused_minutes_total: patch.sla_paused_minutes });
    if (r.task_id) {
      const done = d.status === "COMPLETED" || d.status === "CANCELLED";
      await db.from("staff_tasks").update(done ? { status: d.status === "COMPLETED" ? "done" : "cancelled", completed_at: now.toISOString(), responsibility_manual: false }
        : { responsibility_status: patch.responsibility_status, responsibility_manual: false, status: "in_progress", ...(d.status === "WAITING_ON_CLIENT" ? { information_request_type: r.request_type, requested_information: d.clientNotes ?? r.client_notes ?? null } : {}) }).eq("id", r.task_id);
    }
    if (d.status === "WAITING_ON_CLIENT") await notifyFundManagers(r.fund_id, "information_required", r.title, `/manager/fund/${r.fund_id}/requests`);
    if (d.status === "COMPLETED") await notifyFundManagers(r.fund_id, "request_completed", r.title, `/manager/fund/${r.fund_id}/requests`);
  } else if (d.stage !== undefined && d.stage !== r.stage) {
    await ev(db, r, uid, "stage", true, { stage: requestType(r.request_type).stages[patch.stage] });
  }
  if (d.reason) await ev(db, r, uid, "internal_note", false, { text: d.reason });
  return { ok: true };
}

/** Client cancellation: safe → cancelled; irreversible work already started → Harmonious cancellation review. */
export async function requestCancellation(uid: string, id: string, reason: string) {
  const db = await admin();
  const { data: r } = await db.from("fund_service_requests").select("*").eq("id", id).maybeSingle();
  if (!r) throw new Error("Request not found.");
  await access(uid, r.fund_id);
  if (!isOpenRequest(r.status) || r.status === "CANCELLATION_REVIEW") throw new Error("This request can't be cancelled.");
  const started = r.stage > 1 || ["IN_PROGRESS", "READY_FOR_APPROVAL", "WAITING_ON_INVESTOR", "WAITING_ON_THIRD_PARTY"].includes(r.status);
  if (r.irreversible && started) {
    await db.from("fund_service_requests").update({ status: "CANCELLATION_REVIEW", responsibility_status: "HARMONIOUS_HANDLING", updated_at: new Date().toISOString() }).eq("id", id);
    await ev(db, r, uid, "cancellation_requested", true, { reason });
    await db.from("staff_tasks").insert({ title: `Cancellation review: ${r.title}`, description: `The client asked to cancel. Some steps may be irreversible (payments, notices, filings). Reason: ${reason}`, priority: "high", status: "open", team: "operations", offering_id: r.fund_id, created_by: uid, source: "workflow", source_ref: `fund_request_cancel:${r.id}`, client_visibility: false, related_workflow_type: "fund_service_request", related_workflow_id: r.id }).then(() => undefined, () => undefined);
    return { status: "CANCELLATION_REVIEW" };
  }
  await db.from("fund_service_requests").update({ status: "CANCELLED", responsibility_status: "COMPLETED", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
  if (r.task_id) await db.from("staff_tasks").update({ status: "cancelled", responsibility_manual: false }).eq("id", r.task_id);
  await ev(db, r, uid, "cancelled", true, { reason });
  return { status: "CANCELLED" };
}

export async function fileUrl(uid: string, fileId: string) {
  const db = await admin();
  const { data: f } = await db.from("fund_request_files").select("*").eq("id", fileId).maybeSingle();
  if (!f) throw new Error("File not found.");
  const staff = await access(uid, f.fund_id);
  if (!staff && f.visibility !== "CLIENT") throw new Error("File not found.");
  const { data } = await db.storage.from(BUCKET).createSignedUrl(f.storage_path, 300);
  return { url: data?.signedUrl ?? null };
}
