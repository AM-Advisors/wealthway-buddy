/**
 * Fund verification link: staff-only view of identity-check sessions started
 * from a fund's own verification link (offerings.didit_workflow_id), compared
 * with the fund's investor records so nobody who finished the check is missed.
 * Reads stored provider notices; adds investors only through createInvestor +
 * syncProviderSession; staff "not an investor" decisions are append-only.
 */
import {
  classifyLinkSession, countLinkStates, needsFollowUp, sessionStatus,
  type LinkSessionEvent, type LinkSessionState,
} from "@/lib/fund-verification-link-model";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const DISMISS_PREFIX = "fund_link:";
const dismissRef = (offeringId: string, sessionId: string) => `${DISMISS_PREFIX}${offeringId}:${sessionId}`;

async function isStaff(userId: string) {
  try { await (await import("@/lib/investor-onboarding.server")).assertStaff(userId); return true; } catch { return false; }
}

function detailsFrom(decision: any) {
  const id = (Array.isArray(decision?.id_verifications) ? decision.id_verifications[0] : decision?.id_verification) ?? {};
  return {
    firstName: s(id?.first_name), lastName: s(id?.last_name),
    fullName: s(id?.full_name) ?? ([s(id?.first_name), s(id?.last_name)].filter(Boolean).join(" ") || null),
    email: s(decision?.email?.email)?.toLowerCase() ?? null,
  };
}

async function workflowFor(offeringId: string) {
  const { data } = await (await db()).from("offerings").select("id, name, didit_workflow_id").eq("id", offeringId).maybeSingle();
  return { name: (data?.name as string | undefined) ?? null, workflowId: s(data?.didit_workflow_id) };
}

async function loadSessions(offeringId: string, workflowId: string) {
  const d = await db();
  const [{ data: evs, error }, { data: dec }] = await Promise.all([
    d.from("didit_webhook_events").select("session_id, status, received_at, decision:payload->decision").eq("payload->>workflow_id", workflowId).not("session_id", "is", null).limit(5000),
    d.from("source_reconciliation_decisions").select("source_ref, decision, created_at").eq("source", "didit").like("source_ref", `${DISMISS_PREFIX}${offeringId}:%`).order("created_at"),
  ]);
  if (error) throw new Error(error.message);
  const by = new Map<string, { events: LinkSessionEvent[]; decision: any }>();
  for (const e of (evs ?? []) as any[]) {
    const r = by.get(e.session_id) ?? { events: [], decision: null };
    r.events.push({ sessionId: e.session_id, status: e.status, receivedAt: e.received_at });
    if (e.decision && (!r.decision || e.received_at > (r as any).decisionAt)) { r.decision = e.decision; (r as any).decisionAt = e.received_at; }
    by.set(e.session_id, r);
  }
  const dismissed = new Set<string>();
  for (const x of (dec ?? []) as any[]) {
    const sid = String(x.source_ref).slice(`${DISMISS_PREFIX}${offeringId}:`.length);
    if (x.decision === "reject_match") dismissed.add(sid); else if (x.decision === "mark_unresolved") dismissed.delete(sid);
  }
  const ids = [...by.keys()];
  const [{ data: onb }, { data: reqs }] = ids.length ? await Promise.all([
    d.from("investor_onboardings").select("id, person_id, questionnaire_didit_session_id").eq("offering_id", offeringId).is("removed_at", null).in("questionnaire_didit_session_id", ids),
    d.from("person_kyc_requests").select("person_id, session_id").in("session_id", ids),
  ]) : [{ data: [] }, { data: [] }];
  const { data: fundPeople } = await d.from("investor_onboardings").select("id, person_id, persons(email, legal_first_name, legal_last_name)").eq("offering_id", offeringId).is("removed_at", null).limit(2000);
  const onFundPerson = new Map<string, string>();
  const byEmail = new Map<string, { onboardingId: string; name: string }>();
  for (const o of (fundPeople ?? []) as any[]) {
    if (o.person_id) onFundPerson.set(o.person_id, o.id);
    const em = s(o.persons?.email)?.toLowerCase();
    if (em) byEmail.set(em, { onboardingId: o.id, name: [o.persons?.legal_first_name, o.persons?.legal_last_name].filter(Boolean).join(" ") || em });
  }
  const linked = new Map<string, string>();
  for (const o of (onb ?? []) as any[]) linked.set(o.questionnaire_didit_session_id, o.id);
  for (const r of (reqs ?? []) as any[]) { const ob = onFundPerson.get(r.person_id); if (ob && !linked.has(r.session_id)) linked.set(r.session_id, ob); }
  // Portal applications on this fund that recorded the session count as on the fund too.
  const { data: kv } = ids.length ? await d.from("kyc_verifications").select("session_id, application_id").in("session_id", ids).not("application_id", "is", null) : { data: [] };
  const appIds = [...new Set(((kv ?? []) as any[]).map((r) => r.application_id))];
  const { data: apps } = appIds.length ? await d.from("investor_applications").select("id").eq("offering_id", offeringId).in("id", appIds) : { data: [] };
  const onFundApp = new Set(((apps ?? []) as any[]).map((a) => a.id));
  const { data: appOnb } = onFundApp.size ? await d.from("investor_onboardings").select("id, application_id").eq("offering_id", offeringId).is("removed_at", null).in("application_id", [...onFundApp]) : { data: [] };
  const onbByApp = new Map(((appOnb ?? []) as any[]).map((o) => [o.application_id, o.id]));
  for (const r of (kv ?? []) as any[]) if (onFundApp.has(r.application_id) && !linked.has(r.session_id)) linked.set(r.session_id, onbByApp.get(r.application_id) ?? "");
  return { by, dismissed, linked, byEmail };
}

export async function fundLinkSessions(userId: string, offeringId: string) {
  if (!(await isStaff(userId))) return { staff: false as const };
  const f = await workflowFor(offeringId);
  if (!f.workflowId) return { staff: true as const, connected: false as const, fundName: f.name };
  const { by, dismissed, linked, byEmail } = await loadSessions(offeringId, f.workflowId);
  const now = new Date();
  const rows = [...by.entries()].map(([sessionId, r]) => {
    const state: LinkSessionState = classifyLinkSession({ sessionId, events: r.events, onFund: linked.has(sessionId), dismissed: dismissed.has(sessionId) }, now);
    const det = detailsFrom(r.decision);
    const last = r.events.reduce((m, e) => (e.receivedAt > m ? e.receivedAt : m), "");
    return { sessionId, ref: `••••${sessionId.slice(-6)}`, status: sessionStatus(r.events), state, lastActivity: last, ...det,
      onboardingId: linked.get(sessionId) || null, possibleMatch: det.email && !linked.has(sessionId) ? (byEmail.get(det.email) ?? null) : null };
  });
  // Unfinished sessions don't carry names in the notice; read up to 10 open ones from the provider.
  const { fetchDiditSessionDecision } = await import("@/lib/didit.server");
  for (const r of rows.filter((x) => x.state === "in_progress" && !x.fullName).slice(0, 10)) {
    try { Object.assign(r, Object.fromEntries(Object.entries(detailsFrom(await fetchDiditSessionDecision(r.sessionId))).filter(([, v]) => v))); } catch { /* name stays unknown */ }
  }
  rows.sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
  return { staff: true as const, connected: true as const, fundName: f.name, counts: countLinkStates(rows.map((r) => r.state)), rows };
}

/** Add someone who finished the fund's link as a new investor, then apply their check. */
export async function addLinkSessionInvestor(userId: string, input: { offeringId: string; sessionId: string; profileType: "individual" | "trust" | "entity"; legalName?: string | null | undefined }) {
  const { assertStaff } = await import("@/lib/investor-onboarding.server");
  await assertStaff(userId);
  const f = await workflowFor(input.offeringId);
  if (!f.workflowId) throw new Error("This fund has no verification link connected.");
  const { fetchDiditSessionDecision } = await import("@/lib/didit.server");
  const decision: any = await fetchDiditSessionDecision(input.sessionId);
  if (!decision) throw new Error("That verification session couldn't be read.");
  if (s(decision.workflow_id) !== f.workflowId) throw new Error("That session didn't come from this fund's verification link.");
  if (!needsFollowUp(decision.status)) throw new Error("This person hasn't finished the identity check yet.");
  const { linked } = await loadSessions(input.offeringId, f.workflowId);
  if (linked.has(input.sessionId)) throw new Error("This person is already on the fund.");
  const det = detailsFrom(decision);
  if (!det.firstName || !det.lastName) throw new Error("The check has no first and last name, so add this person with Add investor instead.");
  if (input.profileType !== "individual" && !s(input.legalName)) throw new Error("Enter the trust or company's legal name.");
  const { createInvestor } = await import("@/lib/investor-record.server");
  const created = await createInvestor(userId, {
    offeringId: input.offeringId,
    person: { firstName: det.firstName, lastName: det.lastName, ...(det.email ? { email: det.email } : {}) },
    profile: { type: input.profileType, legalName: input.profileType === "individual" ? null : s(input.legalName) },
    investment: { amountCents: null },
    source: "provider",
    allowMissingEmail: !det.email,
  });
  const { syncProviderSession } = await import("@/lib/prior-verification.server");
  const applied = await syncProviderSession(userId, created.onboardingId, input.sessionId);
  await closeFollowUp(input.offeringId, input.sessionId);
  return { onboardingId: created.onboardingId, applied: applied.applied, kyc: applied.kyc, aml: applied.aml };
}

/** Staff decision that a finished session is not an investor of this fund (append-only, reversible). */
export async function setLinkSessionDismissed(userId: string, input: { offeringId: string; sessionId: string; dismissed: boolean; reason: string }) {
  const { assertStaff } = await import("@/lib/investor-onboarding.server");
  await assertStaff(userId);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Add a short reason.");
  const { error } = await (await db()).from("source_reconciliation_decisions").insert({
    source: "didit", source_ref: dismissRef(input.offeringId, input.sessionId), decision: input.dismissed ? "reject_match" : "mark_unresolved",
    reason, actor_user_id: userId,
  });
  if (error) throw new Error(error.message);
  if (input.dismissed) await closeFollowUp(input.offeringId, input.sessionId);
  return { ok: true };
}

const taskRef = (sessionId: string) => `verification_link:${sessionId}`;

async function closeFollowUp(offeringId: string, sessionId: string) {
  await (await db()).from("staff_tasks").update({ status: "done" }).eq("offering_id", offeringId).eq("source_ref", taskRef(sessionId)).in("status", ["open", "in_progress", "blocked"]);
}

/**
 * Webhook hook: a finished session from a fund's link that nobody on the fund
 * holds opens one Operations task on that fund (deduplicated by session).
 */
export async function noteFundLinkSession(input: { workflowId: string | null; sessionId: string | null; status: string | null }) {
  if (!input.workflowId || !input.sessionId || !needsFollowUp(input.status)) return { opened: 0 };
  const d = await db();
  const { data: funds } = await d.from("offerings").select("id, name, client_id").eq("didit_workflow_id", input.workflowId);
  let opened = 0;
  for (const f of (funds ?? []) as any[]) {
    const { linked, dismissed } = await loadSessions(f.id, input.workflowId);
    if (linked.has(input.sessionId) || dismissed.has(input.sessionId)) continue;
    const { data: existing } = await d.from("staff_tasks").select("id").eq("offering_id", f.id).eq("source_ref", taskRef(input.sessionId)).limit(1);
    if ((existing ?? []).length) continue;
    const { error } = await d.from("staff_tasks").insert({
      title: `Verification link: someone finished the identity check but isn't on ${f.name} yet`.slice(0, 300),
      description: `A person completed the identity check from this fund's verification link (session ••••${input.sessionId.slice(-6)}, ${input.status}). Open the fund's Investors tab, section "From the fund's verification link", to add them or mark them as not an investor.`,
      status: "open", priority: "normal", team: "operations", source: "workflow", source_ref: taskRef(input.sessionId),
      offering_id: f.id, client_id: f.client_id ?? null, responsible_party_type: "HARMONIOUS", responsibility_status: "HARMONIOUS_HANDLING", client_visibility: false,
    });
    if (!error) opened += 1; else console.error("[fund-link] task", error.message);
  }
  return { opened };
}
