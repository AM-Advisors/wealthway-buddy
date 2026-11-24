/**
 * Power of attorney records (server-only). Kept on file for an investing profile or a client:
 * the document, who it names and what it says it covers, with one Harmonious review.
 *
 * An accepted record grants exactly what the document lists and nothing more. The
 * listed powers become a canonical delegation (see src/lib/poa-authority.ts), so the
 * single authority engine decides what the named person may actually do. A record
 * without a linked account, or one the named person has not accepted, opens nothing.
 * Money movement, bank or wire detail changes, identity screening, sign-in security
 * and access grants are never carried by a power of attorney.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { poaDisplayStatus, poaInputBlocker, poaReviewBlocker, type PoaInput, type PoaStatus } from "@/lib/power-of-attorney-model";
import {
  poaAuthorityLevel,
  poaAuthorityView,
  poaCapabilities,
  poaCoveredTypesBlocker,
  poaPlainPowers,
} from "@/lib/poa-authority";
import { FUND_OPERATIONS_ROLES } from "@/lib/staff-roles";

const db = () => supabaseAdmin as any;
const BUCKET = "power-of-attorney";
const AUTHORITY_BUCKET = "authority-documents";
const URL_TTL = 60;
const STAFF_ROLES: readonly string[] = FUND_OPERATIONS_ROLES;
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
const dayStart = (d: string) => new Date(`${d}T00:00:00Z`).toISOString();
const dayEnd = (d: string) => new Date(`${d}T23:59:59Z`).toISOString();

/** The account the authority attaches to: the investing profile's owner. */
async function principalFor(s: PoaSubject): Promise<{ userId: string | null; reason: string | null }> {
  if (s.kind === "client") {
    return { userId: null, reason: "Company authority is granted by Harmonious through the client's team access, so this document stays on file for review." };
  }
  const { data: p } = await db().from("investment_profiles").select("owner_user_id").eq("id", s.id).maybeSingle();
  if (!p?.owner_user_id) return { userId: null, reason: "This investing profile has no sign-in account yet, so there is nothing to open for the named person." };
  return { userId: String(p.owner_user_id), reason: null };
}

/** Exactly one account must match the email in the document, or nothing is linked. */
async function accountByEmail(email: string): Promise<string | null> {
  const esc = email.trim().toLowerCase().replace(/[\\%_]/g, "\\$&");
  const { data } = await db().from("profiles").select("user_id").ilike("email", esc).limit(2);
  const rows = (data ?? []) as any[];
  return rows.length === 1 ? String(rows[0].user_id) : null;
}

async function linkAgent(recordId: string, agentUserId: string, actor: string, how: string) {
  const { error } = await db().from("power_of_attorney_records").update({ agent_user_id: agentUserId }).eq("id", recordId).is("agent_user_id", null);
  if (error) throw new Error("The person named couldn't be linked to their account.");
  await logEvent(recordId, "agent_linked", actor, how);
}

/** Best effort at save time: an exact email match links the named person. */
async function autoLinkAgent(recordId: string, agentEmail: string | null | undefined, actor: string) {
  if (!agentEmail?.trim()) return;
  const found = await accountByEmail(agentEmail);
  if (found) await linkAgent(recordId, found, actor, `Matched the account using ${agentEmail.trim().toLowerCase()}`);
}

export async function listPowersOfAttorney(userId: string, s: PoaSubject) {
  const a = await access(userId, s);
  if (!a.canView) deny();
  const { data, error } = await db().from("power_of_attorney_records").select("*").eq(subjectColumn(s), s.id).order("created_at", { ascending: false });
  if (error) throw new Error("Powers of attorney couldn't load.");
  const rows = (data ?? []) as any[];
  const { data: ev } = rows.length ? await db().from("power_of_attorney_events").select("record_id, event, actor_user_id, note, created_at").in("record_id", rows.map((r) => r.id)).neq("event", "downloaded").order("created_at") : { data: [] };
  const { loadAccountLabels } = await import("@/lib/profile-name.server");
  const names = await loadAccountLabels([...new Set([...rows.flatMap((r) => [r.submitted_by, r.reviewed_by, r.revoked_by, r.agent_user_id]), ...((ev ?? []) as any[]).map((e) => e.actor_user_id)].filter(Boolean))]);
  const { data: dels } = rows.some((r) => r.delegation_id)
    ? await db().from("delegations").select("id, status, revoked_at, effective_at, expires_at, acceptance_state").in("id", rows.map((r) => r.delegation_id).filter(Boolean))
    : { data: [] };
  const byDelegation = new Map(((dels ?? []) as any[]).map((d) => [String(d.id), d]));
  const today = new Date().toISOString().slice(0, 10);
  return {
    label: a.label,
    can: { add: a.canAdd, revoke: a.canRevoke, review: a.staff, link: a.staff },
    me: userId,
    records: rows.map((r) => {
      const powers = (r.covered_powers ?? []) as string[];
      const delegation = r.delegation_id ? byDelegation.get(String(r.delegation_id)) ?? null : null;
      const view = poaAuthorityView(r, delegation);
      return {
        id: r.id, agentName: r.agent_name, agentEmail: r.agent_email, agentRelationship: r.agent_relationship,
        poaKind: r.poa_kind, durable: r.durable, coveredPowers: powers, limitsNote: r.limits_note,
        coveredDocumentTypes: (r.covered_document_types ?? []) as string[],
        effectiveOn: r.effective_on, expiresOn: r.expires_on, fileName: r.file_name, status: r.status as PoaStatus,
        displayStatus: poaDisplayStatus(r, today), submittedBy: r.submitted_by, submittedByName: names.get(r.submitted_by) ?? null, createdAt: r.created_at,
        reviewedByName: r.reviewed_by ? names.get(r.reviewed_by) ?? "Harmonious" : null, reviewedAt: r.reviewed_at, reviewNote: r.review_note,
        revokedAt: r.revoked_at, revokeReason: r.revoke_reason, replacesId: r.replaces_id,
        agentUserId: r.agent_user_id ?? null, agentName2: r.agent_user_id ? names.get(r.agent_user_id) ?? null : null,
        mayDo: poaPlainPowers(powers, r.limits_note),
        authority: { state: view.state, label: view.label, detail: view.detail },
        history: ((ev ?? []) as any[]).filter((e) => e.record_id === r.id).map((e) => ({ event: e.event, by: names.get(e.actor_user_id) ?? null, note: e.note, at: e.created_at })),
      };
    }),
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

export async function submitPowerOfAttorney(
  userId: string,
  s: PoaSubject,
  input: PoaInput & {
    agentRelationship?: string | null | undefined;
    durable: boolean;
    fileName: string;
    storagePath: string;
    documentHash?: string | null | undefined;
    replacesId?: string | null | undefined;
    coveredDocumentTypes?: string[] | undefined;
  },
) {
  const a = await access(userId, s);
  if (!a.canAdd) deny();
  const blocker = poaInputBlocker(input);
  if (blocker) throw new Error(blocker);
  const types = input.coveredDocumentTypes ?? [];
  const typeBlocker = poaCoveredTypesBlocker(input.coveredPowers, types);
  if (typeBlocker) throw new Error(typeBlocker);
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
    covered_document_types: types,
    effective_on: input.effectiveOn, expires_on: input.expiresOn || null,
    file_name: input.fileName.slice(0, 200), storage_path: input.storagePath, document_hash: input.documentHash ?? null,
    submitted_by: userId, replaces_id: input.replacesId ?? null,
  }).select("id").single();
  if (error) throw new Error("The power of attorney couldn't be saved.");
  await logEvent(rec.id, "submitted", userId, input.replacesId ? "Replacement for an earlier power of attorney" : null);
  await autoLinkAgent(rec.id, input.agentEmail, userId);
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

/** Staff or the account holder links the named person to their sign-in account. */
export async function linkPowerOfAttorneyAgent(userId: string, id: string, agentEmail: string) {
  const r = await loadRecord(id);
  const a = await access(userId, subjectOf(r));
  if (!a.staff && !a.canRevoke) throw new Error("Only Harmonious or the account holder can link the person named.");
  if (r.agent_user_id) throw new Error("This power of attorney is already linked to an account.");
  const found = await accountByEmail(agentEmail);
  if (!found) throw new Error("No single account matches that email yet. The person needs a sign-in account first.");
  await linkAgent(id, found, userId, `Linked by ${a.staff ? "Harmonious" : "the account holder"} using ${agentEmail.trim().toLowerCase()}`);
  // An already-accepted document can now carry its authority.
  if (r.status === "accepted") await grantPoaAuthority(userId, await loadRecord(id));
  return { ok: true };
}

/**
 * Turn an accepted document's listed powers into one canonical delegation.
 * Nothing here is inferred: the capabilities come only from the powers the
 * document lists, and the named person must accept before anything opens.
 */
async function grantPoaAuthority(reviewerId: string, r: any) {
  if (r.delegation_id) return { granted: false, why: null as string | null };
  if (!r.agent_user_id) return { granted: false, why: "The person named isn't linked to an account yet, so nothing was opened for them." };
  const subject = subjectOf(r);
  const principal = await principalFor(subject);
  if (!principal.userId) return { granted: false, why: principal.reason };
  if (principal.userId === r.agent_user_id) return { granted: false, why: "The person named is the account holder, so there is nothing to grant." };
  const capabilities = poaCapabilities(r.covered_powers ?? []);
  const level = poaAuthorityLevel(r.covered_powers ?? []);
  if (!capabilities.length || !level) return { granted: false, why: "The powers this document lists don't open anything in the platform." };

  const effectiveAt = dayStart(r.effective_on);
  const expiresAt = r.expires_on ? dayEnd(r.expires_on) : null;
  // Only an investing profile can carry authority here: a company subject has no
  // principal account to attach to, so principalFor has already refused it.
  const { data: delegation, error } = await db().from("delegations").insert({
    principal_user_id: principal.userId,
    delegate_user_id: r.agent_user_id,
    scope_type: "investment_profile",
    scope_id: subject.id,
    authority_level: level,
    status: "active",
    // Nothing opens until the named person accepts exactly what was granted.
    acceptance_state: "awaiting_acceptance",
    effective_at: effectiveAt,
    expires_at: expiresAt,
    covered_document_types: r.covered_document_types ?? [],
    granted_by: reviewerId,
  }).select("id").single();
  if (error) throw new Error("The authorization couldn't be created from this document.");
  const delegationId = String(delegation.id);

  const { error: permError } = await db().from("delegation_permissions").insert(
    capabilities.map((capability) => ({ delegation_id: delegationId, capability, granted_by: reviewerId })),
  );
  if (permError) {
    await db().from("delegations").update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: reviewerId, revoke_reason: "Permissions could not be saved" }).eq("id", delegationId);
    throw new Error("The authorization couldn't be completed.");
  }

  // The document itself becomes the authority document behind the grant, so the
  // existing signing chain can require it. It is copied, never moved.
  const needsAuthorityDoc = capabilities.includes("sign_specified_documents");
  const dest = `authority/${delegationId}/${Date.now()}-${safeName(r.file_name)}`;
  const { error: copyError } = await db().storage.from(BUCKET).copy(r.storage_path, dest, { destinationBucket: AUTHORITY_BUCKET });
  let authorityDocOk = false;
  if (!copyError) {
    const { error: docError } = await db().from("authority_documents").insert({
      delegation_id: delegationId,
      principal_user_id: principal.userId,
      delegate_user_id: r.agent_user_id,
      document_type: "power_of_attorney",
      file_name: r.file_name,
      storage_path: dest,
      document_hash: r.document_hash ?? null,
      scope_type: "investment_profile",
      scope_id: subject.id,
      covered_actions: capabilities.includes("sign_specified_documents") ? ["sign_specified_documents"] : [],
      covered_document_types: r.covered_document_types ?? [],
      effective_at: effectiveAt,
      expires_at: expiresAt,
      // Harmonious has already reviewed this document; that review is the acceptance.
      review_status: "accepted",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      submitted_by: reviewerId,
    });
    authorityDocOk = !docError;
    if (authorityDocOk) {
      await db().from("delegations").update({ authority_document_path: dest, authority_document_name: r.file_name }).eq("id", delegationId);
    }
  }
  if (needsAuthorityDoc && !authorityDocOk) {
    // Signing is never allowed without the document behind it, so the grant is
    // taken back rather than left standing without its authority file.
    await db().from("delegation_permissions").delete().eq("delegation_id", delegationId);
    await db().from("delegations").update({
      status: "revoked", revoked_at: new Date().toISOString(), revoked_by: reviewerId,
      revoke_reason: "The power of attorney file couldn't be attached to the grant",
    }).eq("id", delegationId);
    throw new Error("The power of attorney file couldn't be attached to the grant, so nothing was opened. Please try again.");
  }

  await db().from("power_of_attorney_records").update({ delegation_id: delegationId }).eq("id", r.id);
  await logEvent(r.id, "authority_granted", reviewerId, `Opened: ${capabilities.length} permission${capabilities.length === 1 ? "" : "s"} from the listed powers`);
  const { notify } = await import("@/lib/signatory-authority.server");
  await notify(String(r.agent_user_id), "professional", "delegation_created", {
    message: `You have been granted access for ${subject.kind === "client" ? "a client" : "an investor"} you hold a power of attorney for. Open your grants to accept it.`,
    delegationId,
  });
  const { recordDelegationAudit } = await import("@/lib/delegated-access.server");
  await recordDelegationAudit({
    actorUserId: reviewerId,
    action: "poa_authority_granted",
    delegationId,
    principalUserId: principal.userId,
    delegateUserId: String(r.agent_user_id),
    outcome: "awaiting_acceptance",
    after: { capabilities, authority_level: level, powers: r.covered_powers },
  });
  return { granted: true, why: null as string | null };
}

/** End the authority a document created: the grant and its authority document. */
async function endPoaAuthority(actorId: string, r: any, reason: string) {
  if (!r.delegation_id) return;
  const delegationId = String(r.delegation_id);
  await db().from("delegations").update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: actorId, revoke_reason: reason }).eq("id", delegationId).eq("status", "active");
  await db().from("authority_documents").update({ review_status: "revoked", revoked_at: new Date().toISOString(), revoked_by: actorId }).eq("delegation_id", delegationId).in("review_status", ["uploaded", "in_review", "accepted"]);
  const { recordDelegationAudit } = await import("@/lib/delegated-access.server");
  await recordDelegationAudit({
    actorUserId: actorId,
    action: "poa_authority_revoked",
    delegationId,
    principalUserId: null,
    delegateUserId: r.agent_user_id ?? null,
    outcome: "revoked",
    after: { reason },
  });
  await logEvent(r.id, "authority_revoked", actorId, reason);
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
  let why: string | null = null;
  if (decision === "accept") {
    if (r.replaces_id) {
      const prior = await loadRecord(r.replaces_id);
      if (prior.status === "accepted" || prior.status === "pending_review") {
        await endPoaAuthority(userId, prior, "Replaced by a newer power of attorney");
        await db().from("power_of_attorney_records").update({ status: "revoked", revoked_by: userId, revoked_at: new Date().toISOString(), revoke_reason: "Replaced by a newer power of attorney" }).eq("id", prior.id);
        await logEvent(prior.id, "replaced", userId, "Replaced by a newer power of attorney");
      }
    }
    why = (await grantPoaAuthority(userId, await loadRecord(id))).why;
  }
  await closeReviewTask(id, userId, decision === "accept" ? "Accepted" : "Not accepted");
  return { ok: true, why };
}

export async function revokePowerOfAttorney(userId: string, id: string, reason: string) {
  const r = await loadRecord(id);
  const a = await access(userId, subjectOf(r));
  if (!a.canRevoke) throw new Error("Only the investor, the client's administrators or Harmonious can revoke a power of attorney.");
  if (!reason.trim()) throw new Error("Say why it is being revoked.");
  if (r.status === "revoked" || r.status === "rejected") throw new Error("This power of attorney is no longer active.");
  await endPoaAuthority(userId, r, reason.trim());
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
