/**
 * Power of attorney records (server-only). Kept on file for an investing profile or a client:
 * the document, who it names and what it says it covers, with one Harmonious review.
 * A record never grants signing, money, identity or access authority. Delegated signing
 * stays with the delegations/authority_documents engine.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { poaDisplayStatus, poaInputBlocker, poaReviewBlocker, type PoaInput, type PoaStatus } from "@/lib/power-of-attorney-model";

const db = () => supabaseAdmin as any;
const BUCKET = "power-of-attorney";
const URL_TTL = 60;
const STAFF_ROLES = ["admin", "super_admin", "operations", "compliance", "legal", "fund_administration"];
const CLIENT_ADMIN_ROLES = ["client_gp", "client_signatory", "client_finance", "client_legal", "client_compliance"];

export type PoaSubject = { kind: "investment_profile" | "client"; id: string };
type Access = { staff: boolean; roles: string[]; canView: boolean; canAdd: boolean; canRevoke: boolean; label: string | null };

function deny(): never { throw new Error("Forbidden: you can't see powers of attorney for this account."); }
const subjectColumn = (s: PoaSubject) => (s.kind === "client" ? "client_id" : "investment_profile_id");

async function access(userId: string, s: PoaSubject): Promise<Access> {
  const { data: roleRows } = await db().from("user_roles").select("role").eq("user_id", userId);
  const roles = ((roleRows ?? []) as any[]).map((r) => String(r.role));
  const staff = roles.some((r) => STAFF_ROLES.includes(r));
  if (s.kind === "investment_profile") {
    const { data: p } = await db().from("investment_profiles").select("id, owner_user_id, legal_name, display_label").eq("id", s.id).maybeSingle();
    if (!p) throw new Error("That investor profile was not found.");
    const owner = p.owner_user_id === userId;
    let manager = false;
    if (!staff && !owner) {
      const { data: managed } = await db().from("fund_managers").select("offering_id").eq("user_id", userId);
      const ids = ((managed ?? []) as any[]).map((m) => m.offering_id);
      if (ids.length) {
        const { data: onb } = await db().from("investor_onboardings").select("id").eq("investment_profile_id", s.id).in("offering_id", ids).is("removed_at", null).limit(1);
        manager = ((onb ?? []) as any[]).length > 0;
      }
    }
    const label = p.legal_name || p.display_label || null;
    // Managers may add one for their own fund's investor; only the investor or Harmonious may revoke.
    return { staff, roles, canView: staff || owner || manager, canAdd: staff || owner || manager, canRevoke: staff || owner, label };
  }
  const { data: c } = await db().from("clients").select("id, name").eq("id", s.id).maybeSingle();
  if (!c) throw new Error("That client was not found.");
  let clientAdmin = false;
  if (!staff) {
    const { data: m } = await db().from("client_users").select("client_role, can_approve").eq("client_id", s.id).eq("user_id", userId).is("revoked_at", null);
    clientAdmin = ((m ?? []) as any[]).some((r) => CLIENT_ADMIN_ROLES.includes(String(r.client_role)) || r.can_approve === true);
  }
  return { staff, roles, canView: staff || clientAdmin, canAdd: staff || clientAdmin, canRevoke: staff || clientAdmin, label: c.name ?? null };
}

async function logEvent(recordId: string, event: string, actor: string, note?: string | null) {
  const { error } = await db().from("power_of_attorney_events").insert({ record_id: recordId, event, actor_user_id: actor, note: note ?? null });
  if (error) throw new Error("The history entry couldn't be saved.");
}

const safeName = (n: string) => (n.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_").slice(-120) || "document").replace(/^[._]+/, "");
const prefixFor = (s: PoaSubject) => `${s.kind}/${s.id}/`;

export async function listPowersOfAttorney(userId: string, s: PoaSubject) {
  const a = await access(userId, s);
  if (!a.canView) deny();
  const { data, error } = await db().from("power_of_attorney_records").select("*").eq(subjectColumn(s), s.id).order("created_at", { ascending: false });
  if (error) throw new Error("Powers of attorney couldn't load.");
  const rows = (data ?? []) as any[];
  const { data: ev } = rows.length ? await db().from("power_of_attorney_events").select("record_id, event, actor_user_id, note, created_at").in("record_id", rows.map((r) => r.id)).neq("event", "downloaded").order("created_at") : { data: [] };
  const { loadAccountLabels } = await import("@/lib/profile-name.server");
  const names = await loadAccountLabels([...new Set([...rows.flatMap((r) => [r.submitted_by, r.reviewed_by, r.revoked_by]), ...((ev ?? []) as any[]).map((e) => e.actor_user_id)].filter(Boolean))]);
  const today = new Date().toISOString().slice(0, 10);
  return {
    label: a.label,
    can: { add: a.canAdd, revoke: a.canRevoke, review: a.staff },
    me: userId,
    records: rows.map((r) => ({
      id: r.id, agentName: r.agent_name, agentEmail: r.agent_email, agentRelationship: r.agent_relationship,
      poaKind: r.poa_kind, durable: r.durable, coveredPowers: r.covered_powers ?? [], limitsNote: r.limits_note,
      effectiveOn: r.effective_on, expiresOn: r.expires_on, fileName: r.file_name, status: r.status as PoaStatus,
      displayStatus: poaDisplayStatus(r, today), submittedBy: r.submitted_by, submittedByName: names.get(r.submitted_by) ?? null, createdAt: r.created_at,
      reviewedByName: r.reviewed_by ? names.get(r.reviewed_by) ?? "Harmonious" : null, reviewedAt: r.reviewed_at, reviewNote: r.review_note,
      revokedAt: r.revoked_at, revokeReason: r.revoke_reason, replacesId: r.replaces_id,
      history: ((ev ?? []) as any[]).filter((e) => e.record_id === r.id).map((e) => ({ event: e.event, by: names.get(e.actor_user_id) ?? null, note: e.note, at: e.created_at })),
    })),
  };
}

export async function startPoaUpload(userId: string, s: PoaSubject, fileName: string) {
  const a = await access(userId, s);
  if (!a.canAdd) deny();
  const path = `${prefixFor(s)}${crypto.randomUUID()}-${safeName(fileName)}`;
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error("The upload couldn't be prepared.");
  return { path, token: data.token as string };
}

export async function submitPowerOfAttorney(userId: string, s: PoaSubject, input: PoaInput & { agentRelationship?: string | null | undefined; durable: boolean; fileName: string; storagePath: string; documentHash?: string | null | undefined; replacesId?: string | null | undefined }) {
  const a = await access(userId, s);
  if (!a.canAdd) deny();
  const blocker = poaInputBlocker(input);
  if (blocker) throw new Error(blocker);
  if (!input.storagePath.startsWith(prefixFor(s)) || input.storagePath.includes("..")) throw new Error("Forbidden: that file does not belong to this account.");
  const probe = await db().storage.from(BUCKET).createSignedUrl(input.storagePath, 10);
  if (probe.error) throw new Error("The uploaded file wasn't found. Please upload it again.");
  if (input.replacesId) {
    const { data: prior } = await db().from("power_of_attorney_records").select("id, status").eq("id", input.replacesId).eq(subjectColumn(s), s.id).maybeSingle();
    if (!prior) throw new Error("The power of attorney being replaced was not found on this account.");
  }
  const { data: rec, error } = await db().from("power_of_attorney_records").insert({
    subject_kind: s.kind, [subjectColumn(s)]: s.id,
    agent_name: input.agentName.trim(), agent_email: input.agentEmail?.trim().toLowerCase() || null, agent_relationship: input.agentRelationship?.trim() || null,
    poa_kind: input.poaKind, durable: input.durable, covered_powers: input.coveredPowers, limits_note: input.limitsNote?.trim() || null,
    effective_on: input.effectiveOn, expires_on: input.expiresOn || null,
    file_name: input.fileName.slice(0, 200), storage_path: input.storagePath, document_hash: input.documentHash ?? null,
    submitted_by: userId, replaces_id: input.replacesId ?? null,
  }).select("id").single();
  if (error) throw new Error("The power of attorney couldn't be saved.");
  await logEvent(rec.id, "submitted", userId, input.replacesId ? "Replacement for an earlier power of attorney" : null);
  // One review task for Harmonious Operations; it routes work only and grants nothing.
  await db().from("staff_tasks").insert({
    title: `Review power of attorney for ${a.label ?? "account"}`,
    description: `${input.agentName.trim()} is named to act for ${a.label ?? "this account"}. Open the account to accept or reject the document.`,
    priority: "normal", team: "operations", created_by: userId, source: "workflow",
    related_workflow_type: "power_of_attorney", related_workflow_id: rec.id,
    client_id: s.kind === "client" ? s.id : null, related_investor_id: s.kind === "investment_profile" ? s.id : null,
  });
  return { id: rec.id as string };
}

async function loadRecord(id: string) {
  const { data } = await db().from("power_of_attorney_records").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("That power of attorney was not found.");
  return data as any;
}
const subjectOf = (r: any): PoaSubject => (r.subject_kind === "client" ? { kind: "client", id: r.client_id } : { kind: "investment_profile", id: r.investment_profile_id });

async function closeReviewTask(recordId: string, actor: string, note: string) {
  const { data: tasks } = await db().from("staff_tasks").select("id").eq("related_workflow_type", "power_of_attorney").eq("related_workflow_id", recordId).not("status", "in", "(done,cancelled)");
  for (const t of (tasks ?? []) as any[]) {
    await db().from("staff_tasks").update({ status: "done" }).eq("id", t.id);
    await db().from("staff_task_events").insert({ task_id: t.id, actor_user_id: actor, kind: "status", detail: { to: "done", note } });
  }
}

export async function reviewPowerOfAttorney(userId: string, id: string, decision: "accept" | "reject", note?: string | null) {
  const r = await loadRecord(id);
  const a = await access(userId, subjectOf(r));
  const blocker = poaReviewBlocker({ userId, roles: a.roles }, r);
  if (blocker) throw new Error(blocker);
  if (decision === "reject" && !note?.trim()) throw new Error("Say why it can't be accepted, so the account can fix it.");
  const status = decision === "accept" ? "accepted" : "rejected";
  const { error } = await db().from("power_of_attorney_records").update({ status, reviewed_by: userId, reviewed_at: new Date().toISOString(), review_note: note?.trim() || null }).eq("id", id).eq("status", "pending_review");
  if (error) throw new Error("The review couldn't be saved.");
  await logEvent(id, status, userId, note?.trim() || null);
  if (decision === "accept" && r.replaces_id) {
    const prior = await loadRecord(r.replaces_id);
    if (prior.status === "accepted" || prior.status === "pending_review") {
      await db().from("power_of_attorney_records").update({ status: "revoked", revoked_by: userId, revoked_at: new Date().toISOString(), revoke_reason: "Replaced by a newer power of attorney" }).eq("id", prior.id);
      await logEvent(prior.id, "replaced", userId, "Replaced by a newer power of attorney");
    }
  }
  await closeReviewTask(id, userId, decision === "accept" ? "Accepted" : "Not accepted");
  return { ok: true };
}

export async function revokePowerOfAttorney(userId: string, id: string, reason: string) {
  const r = await loadRecord(id);
  const a = await access(userId, subjectOf(r));
  if (!a.canRevoke) throw new Error("Only the investor, the client's administrators or Harmonious can revoke a power of attorney.");
  if (!reason.trim()) throw new Error("Say why it is being revoked.");
  if (r.status === "revoked" || r.status === "rejected") throw new Error("This power of attorney is no longer active.");
  const { error } = await db().from("power_of_attorney_records").update({ status: "revoked", revoked_by: userId, revoked_at: new Date().toISOString(), revoke_reason: reason.trim() }).eq("id", id);
  if (error) throw new Error("It couldn't be revoked.");
  await logEvent(id, "revoked", userId, reason.trim());
  await closeReviewTask(id, userId, "Revoked before review");
  return { ok: true };
}

export async function powerOfAttorneyFileUrl(userId: string, id: string) {
  const r = await loadRecord(id);
  const a = await access(userId, subjectOf(r));
  if (!a.canView) deny();
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(r.storage_path, URL_TTL, { download: r.file_name });
  if (error) throw new Error("The file couldn't be opened.");
  await logEvent(id, "downloaded", userId);
  return { url: data.signedUrl as string };
}

/** Investing profiles shown on an investor's 360 page (staff only). */
export async function investorProfilesForPoa(userId: string, investorUserId: string) {
  const { data: roleRows } = await db().from("user_roles").select("role").eq("user_id", userId);
  if (!((roleRows ?? []) as any[]).some((r) => STAFF_ROLES.includes(String(r.role)))) deny();
  const { data } = await db().from("investment_profiles").select("id, legal_name, display_label").eq("owner_user_id", investorUserId).order("created_at");
  return ((data ?? []) as any[]).map((p) => ({ id: p.id as string, label: (p.legal_name || p.display_label || "Investing profile") as string }));
}
