/**
 * View As - server-side authorization perspective (read-only).
 * Never uses, mints or substitutes a client token; never touches client sign-in
 * history or security settings. Every call re-validates staff authority, the
 * sign-in session and the canonical relationship. Client-supplied IDs are used
 * only to pick among server-listed perspectives and are always re-checked.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { onboardingActor, assertStaff, investmentReadiness, fundReadiness } from "@/lib/investor-onboarding.server";
import { recordAccessEvent } from "@/lib/access-control.server";
import { editContextIsLive, sessionIsLive, subjectAllowed, VIEW_AS_MINUTES, PERSPECTIVE_LABEL, type Perspective } from "@/lib/view-as";

const db = () => supabaseAdmin as any;
const deny = (m: string): never => { throw new Error(`View As refused: ${m}`); };

async function nameOf(userId: string) {
  const { data } = await db().from("profiles").select("legal_name").eq("user_id", userId).maybeSingle();
  return (data?.legal_name as string | null) ?? "Unnamed person";
}

/** Canonical relationship check - fund_managers row or the investment's own investor. */
async function relationshipHolds(p: { perspective: Perspective; subjectUserId: string; offeringId: string | null; onboardingId: string | null }) {
  const subject = await onboardingActor(p.subjectUserId);
  if (!subjectAllowed(subject)) return false;
  if (p.perspective === "fund_manager") return !!p.offeringId && subject.managedOfferingIds.includes(p.offeringId);
  if (!p.onboardingId) return false;
  const { data } = await db().from("investor_onboardings").select("investor_user_id, offering_id").eq("id", p.onboardingId).maybeSingle();
  return !!data && data.investor_user_id === p.subjectUserId && data.offering_id === p.offeringId;
}

/** Perspectives that actually exist for an investment or fund. Staff only. */
export async function listPerspectives(staffUserId: string, input: { onboardingId?: string | null; offeringId?: string | null }) {
  await assertStaff(staffUserId);
  let offeringId = input.offeringId ?? null;
  const out: { perspective: Perspective; subjectUserId: string; name: string; offeringId: string; onboardingId: string | null }[] = [];
  if (input.onboardingId) {
    const { data } = await db().from("investor_onboardings").select("investor_user_id, offering_id").eq("id", input.onboardingId).maybeSingle();
    if (!data) deny("that investment was not found.");
    offeringId = data.offering_id;
    const subject = await onboardingActor(data.investor_user_id);
    if (subjectAllowed(subject)) out.push({ perspective: "investor", subjectUserId: data.investor_user_id, name: await nameOf(data.investor_user_id), offeringId: data.offering_id, onboardingId: input.onboardingId });
  }
  if (offeringId) {
    const { data } = await db().from("fund_managers").select("user_id").eq("offering_id", offeringId);
    for (const m of (data ?? []) as any[]) {
      const subject = await onboardingActor(m.user_id);
      if (subjectAllowed(subject)) out.push({ perspective: "fund_manager", subjectUserId: m.user_id, name: await nameOf(m.user_id), offeringId, onboardingId: null });
    }
  }
  return out;
}

export async function startViewAs(staffUserId: string, authSessionId: string | null, p: { perspective: Perspective; subjectUserId: string; offeringId: string; onboardingId: string | null }) {
  await assertStaff(staffUserId);
  if (!(await relationshipHolds(p))) {
    await recordAccessEvent({ actorUserId: staffUserId, actorIdentity: null, targetUserId: p.subjectUserId, action: "view_as.start", outcome: "denied", scopeType: "offering", scopeId: p.offeringId, reason: "no canonical relationship" });
    deny("that perspective does not exist.");
  }
  // One perspective at a time: switching clears the previous context (and any edit context).
  await closeEditContext(staffUserId, "switched");
  await db().from("view_as_sessions").update({ ended_at: new Date().toISOString(), end_reason: "switched" }).eq("staff_user_id", staffUserId).is("ended_at", null);
  const { data, error } = await db().from("view_as_sessions").insert({
    staff_user_id: staffUserId, auth_session_id: authSessionId, perspective: p.perspective, subject_user_id: p.subjectUserId,
    offering_id: p.offeringId, onboarding_id: p.onboardingId,
    expires_at: new Date(Date.now() + VIEW_AS_MINUTES * 60000).toISOString(),
  }).select("id").single();
  if (error) deny("could not start.");
  await recordAccessEvent({ actorUserId: staffUserId, actorIdentity: null, targetUserId: p.subjectUserId, action: "view_as.start", scopeType: p.onboardingId ? "investment" : "offering", scopeId: p.onboardingId ?? p.offeringId, next: { perspective: p.perspective, mode: "read_only" }, correlationId: data.id });
  return { ok: true };
}

export async function endViewAs(staffUserId: string, reason = "exit") {
  const { data } = await db().from("view_as_sessions").update({ ended_at: new Date().toISOString(), end_reason: reason }).eq("staff_user_id", staffUserId).is("ended_at", null).select("id, subject_user_id");
  for (const s of (data ?? []) as any[]) {
    await recordAccessEvent({ actorUserId: staffUserId, actorIdentity: null, targetUserId: s.subject_user_id, action: "view_as.end", correlationId: s.id, reason });
  }
  return { ok: true };
}

/** Resolve the live perspective, re-checking staff, sign-in and relationship every time. Read-only. */
export async function resolvePerspective(staffUserId: string, authSessionId: string | null) {
  const actor = await onboardingActor(staffUserId);
  if (!actor.isStaff) return null;
  const { data: row } = await db().from("view_as_sessions").select("*").eq("staff_user_id", staffUserId).is("ended_at", null).maybeSingle();
  if (!row || !sessionIsLive(row, staffUserId, authSessionId)) return null;
  const p = { perspective: row.perspective as Perspective, subjectUserId: row.subject_user_id, offeringId: row.offering_id, onboardingId: row.onboarding_id };
  if (!(await relationshipHolds(p))) return null;
  return { ...p, sessionId: row.id as string };
}

/** Banner context. Returns null when no live perspective (no writes either way). */
export async function activeViewAs(staffUserId: string, authSessionId: string | null) {
  const p = await resolvePerspective(staffUserId, authSessionId);
  if (!p) return null;
  const [{ data: off }, name, onb] = await Promise.all([
    db().from("offerings").select("name").eq("id", p.offeringId).maybeSingle(),
    nameOf(p.subjectUserId),
    p.onboardingId ? db().from("investor_onboardings").select("requested_amount_cents").eq("id", p.onboardingId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    perspective: p.perspective,
    roleLabel: PERSPECTIVE_LABEL[p.perspective],
    subjectName: name,
    fundName: (off?.name as string | null) ?? "Fund",
    offeringId: p.offeringId,
    onboardingId: p.onboardingId,
    amountCents: ((onb as any)?.data?.requested_amount_cents ?? null) as number | null,
  };
}

/**
 * The real client screens, rendered through the subject's own server-side
 * authorization (same functions, same role-safe views). The subject's view is
 * always narrower than staff, so staff authority ∩ client view = client view.
 */
export async function viewAsInvestment(staffUserId: string, authSessionId: string | null) {
  const p = await resolvePerspective(staffUserId, authSessionId);
  if (!p || p.perspective !== "investor" || !p.onboardingId) deny("no active investor view.");
  return investmentReadiness(p!.subjectUserId, p!.onboardingId!);
}

export async function viewAsFund(staffUserId: string, authSessionId: string | null) {
  const p = await resolvePerspective(staffUserId, authSessionId);
  if (!p || p.perspective !== "fund_manager") deny("no active fund manager view.");
  return fundReadiness(p!.subjectUserId, p!.offeringId);
}

/**
 * Switch explicitly from View As (read-only) to Edit as Harmonious. Ends the
 * perspective and records which client view was being inspected, so the
 * following edit - made through the existing Operations form and save path,
 * under the staff member's own account - is traceable to View As.
 */
export async function beginEditAsHarmonious(staffUserId: string, authSessionId: string | null) {
  const p = await resolvePerspective(staffUserId, authSessionId);
  if (!p) deny("no active client view.");
  await recordAccessEvent({ actorUserId: staffUserId, actorIdentity: null, targetUserId: p!.subjectUserId, action: "view_as.edit_as_harmonious", scopeType: p!.onboardingId ? "investment" : "offering", scopeId: p!.onboardingId ?? p!.offeringId, previous: { perspective: p!.perspective, mode: "read_only" }, next: { mode: "edit_as_harmonious", attributed_to: "staff" }, correlationId: p!.sessionId });
  await endViewAs(staffUserId, "edit_as_harmonious");
  return { onboardingId: p!.onboardingId, offeringId: p!.offeringId };
}

/**
 * Edit-as-Harmonious context banner. Display only: grants no permission and is
 * never used by any save path. Re-validated on every call; a stale or no-longer
 * authorized context is closed (end_reason edit_context_stale) and hidden.
 */
async function latestEditRow(staffUserId: string) {
  const { data } = await db().from("view_as_sessions").select("*").eq("staff_user_id", staffUserId).eq("end_reason", "edit_as_harmonious").order("ended_at", { ascending: false }).limit(1).maybeSingle();
  return data as any;
}

async function closeEditContext(staffUserId: string, reason: string) {
  const { data } = await db().from("view_as_sessions").update({ end_reason: reason }).eq("staff_user_id", staffUserId).eq("end_reason", "edit_as_harmonious").select("id, subject_user_id");
  for (const s of (data ?? []) as any[]) {
    await recordAccessEvent({ actorUserId: staffUserId, actorIdentity: null, targetUserId: s.subject_user_id, action: "view_as.edit_context_end", correlationId: s.id, reason });
  }
}

export async function activeEditContext(staffUserId: string, authSessionId: string | null) {
  const actor = await onboardingActor(staffUserId);
  if (!actor.isStaff) return null;
  const row = await latestEditRow(staffUserId);
  if (!row) return null;
  const p = { perspective: row.perspective as Perspective, subjectUserId: row.subject_user_id, offeringId: row.offering_id, onboardingId: row.onboarding_id };
  if (!editContextIsLive(row, staffUserId, authSessionId) || !(await relationshipHolds(p))) {
    await closeEditContext(staffUserId, "edit_context_stale");
    return null;
  }
  const [{ data: off }, name, { data: onb }] = await Promise.all([
    db().from("offerings").select("name, client_id").eq("id", p.offeringId).maybeSingle(),
    nameOf(p.subjectUserId),
    p.onboardingId ? db().from("investor_onboardings").select("requested_amount_cents, accepted_amount_cents, investment_profile_id").eq("id", p.onboardingId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const [{ data: client }, { data: profile }] = await Promise.all([
    off?.client_id ? db().from("clients").select("name").eq("id", off.client_id).maybeSingle() : Promise.resolve({ data: null }),
    (onb as any)?.investment_profile_id ? db().from("investment_profiles").select("display_label").eq("id", (onb as any).investment_profile_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    perspective: p.perspective,
    roleLabel: PERSPECTIVE_LABEL[p.perspective],
    subjectName: name,
    clientName: ((client as any)?.name ?? null) as string | null,
    fundName: (off?.name as string | null) ?? "Fund",
    offeringId: p.offeringId as string,
    onboardingId: p.onboardingId as string | null,
    investmentProfileLabel: ((profile as any)?.display_label ?? null) as string | null,
    amountCents: ((onb as any)?.accepted_amount_cents ?? (onb as any)?.requested_amount_cents ?? null) as number | null,
  };
}

export async function exitEditContext(staffUserId: string) {
  await closeEditContext(staffUserId, "edit_context_exited");
  return { ok: true };
}

/** Return to the originating Client View; startViewAs re-checks staff and relationship. */
export async function returnToClientView(staffUserId: string, authSessionId: string | null) {
  const ctx = await activeEditContext(staffUserId, authSessionId);
  if (!ctx) deny("the edit context is no longer active.");
  const subjectUserId = (await latestEditRow(staffUserId)).subject_user_id as string;
  await closeEditContext(staffUserId, "edit_context_returned");
  await startViewAs(staffUserId, authSessionId, { perspective: ctx!.perspective, subjectUserId, offeringId: ctx!.offeringId, onboardingId: ctx!.onboardingId });
  return { ok: true };
}
