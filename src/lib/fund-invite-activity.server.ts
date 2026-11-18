/**
 * Invited-investor activity for one fund: every investor on the fund with when they
 * were invited and whether they clicked, signed in, started or finished their identity
 * check, plus people seen only on the fund's own verification link. Readable by staff
 * and that fund's own managers (server-checked). Reads recorded evidence only; link-only
 * people show neutral labels, never screening outcomes or session details.
 */
import { inviteActivity, linkOnlyLabel, countInviteLevels, type InviteLevel } from "@/lib/fund-invite-activity-model";
import { classifyLinkSession, latestEvent, sessionStatus } from "@/lib/fund-verification-link-model";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const INVITE_EVENTS = new Set(["personal_link_emailed", "personal_link_copied", "investor_invited", "investor_invitation_resent"]);
const OPEN_EVENT = "invitation_link_opened";
const ANON_WINDOW_DAYS = 30;

export async function fundInviteActivity(userId: string, offeringId: string) {
  const { onboardingActor } = await import("@/lib/investor-onboarding.server");
  const actor = await onboardingActor(userId);
  if (!actor.isStaff && !actor.managedOfferingIds.includes(offeringId)) throw new Error("Forbidden: you do not manage that fund.");
  const d = await db();
  const { data: obs, error } = await d.from("investor_onboardings")
    .select("id, person_id, investor_user_id, invitation_id, investment_profile_id, questionnaire_didit_session_id, created_at")
    .eq("offering_id", offeringId).is("removed_at", null).order("created_at").limit(2000);
  if (error) throw new Error(error.message);
  const O = (obs ?? []) as any[];
  const ids = O.map((o) => o.id);
  const pids = [...new Set(O.map((o) => o.person_id).filter(Boolean))];
  const prof = [...new Set(O.map((o) => o.investment_profile_id).filter(Boolean))];
  const invIds = [...new Set(O.map((o) => o.invitation_id).filter(Boolean))];
  const none = { data: [] as any[] };
  const [{ data: ppl }, { data: profiles }, { data: invs }, { data: sends }, { data: evs }, { data: checks }] = await Promise.all([
    pids.length ? d.from("persons").select("id, legal_first_name, legal_last_name, preferred_name, email, kyc_status").in("id", pids) : none,
    prof.length ? d.from("investment_profiles").select("id, legal_name, profile_type").in("id", prof) : none,
    invIds.length ? d.from("fund_invitations").select("id, created_at, last_sent_at, accepted_at").in("id", invIds) : none,
    ids.length ? d.from("investor_email_sends").select("onboarding_id, kind, sent_at, created_at").in("onboarding_id", ids).eq("outcome", "sent").limit(5000) : none,
    ids.length ? d.from("investor_onboarding_events").select("onboarding_id, event, actor_role, created_at").in("onboarding_id", ids).order("created_at").limit(20000) : none,
    pids.length ? d.from("kyc_verifications").select("person_id, completed_at").in("person_id", pids).eq("status", "approved").limit(5000) : none,
  ]);
  const person = new Map(((ppl ?? []) as any[]).map((p) => [p.id, p]));
  const profile = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));
  const invite = new Map(((invs ?? []) as any[]).map((i) => [i.id, i]));
  const checkAt = new Map<string, string>();
  for (const c of (checks ?? []) as any[]) if (c.completed_at && (!checkAt.has(c.person_id) || c.completed_at < checkAt.get(c.person_id)!)) checkAt.set(c.person_id, c.completed_at);
  const per = new Map<string, { invited: string[]; opened: string[]; started: string[] }>();
  const bucket = (id: string) => { let b = per.get(id); if (!b) { b = { invited: [], opened: [], started: [] }; per.set(id, b); } return b; };
  for (const x of (sends ?? []) as any[]) bucket(x.onboarding_id).invited.push(x.sent_at ?? x.created_at);
  for (const e of (evs ?? []) as any[]) {
    if (INVITE_EVENTS.has(e.event)) bucket(e.onboarding_id).invited.push(e.created_at);
    else if (e.event === OPEN_EVENT) bucket(e.onboarding_id).opened.push(e.created_at);
    else if (e.actor_role === "investor") bucket(e.onboarding_id).started.push(e.created_at);
  }

  // The fund's own verification link: opens and finished checks count for the investor holding the session.
  const { workflowFor, loadSessions, detailsFrom } = await import("@/lib/fund-verification-link.server");
  const wf = await workflowFor(offeringId);
  const linkFinished = new Map<string, string>();
  const linkOnly: { name: string; label: string; lastActivity: string }[] = [];
  let anonymousOpens = 0;
  const nameKey = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/);
  const onFundByName = new Map<string, string>();
  for (const o of O) { const p: any = person.get(o.person_id); if (p?.legal_first_name && p?.legal_last_name) onFundByName.set(`${nameKey(p.legal_first_name)[0]}|${nameKey(p.legal_last_name).at(-1)}`, o.id); }
  if (wf.workflowId) {
    const { by, dismissed, linked } = await loadSessions(offeringId, wf.workflowId);
    const now = new Date();
    for (const [sid, r] of by) {
      const ob = linked.get(sid);
      const first = [...r.events].sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1))[0]?.receivedAt;
      const st = String(sessionStatus(r.events) ?? "").toLowerCase();
      const finishedAt = ["approved", "in review", "declined", "resubmitted"].includes(st) ? latestEvent(r.events)?.receivedAt ?? null : null;
      if (ob) {
        if (first) bucket(ob).opened.push(first);
        if (finishedAt && (!linkFinished.has(ob) || finishedAt < linkFinished.get(ob)!)) linkFinished.set(ob, finishedAt);
        continue;
      }
      const state = classifyLinkSession({ sessionId: sid, events: r.events, onFund: false, dismissed: dismissed.has(sid) }, now);
      if (state === "not_investor") continue;
      const det = detailsFrom(r.decision);
      const last = latestEvent(r.events)?.receivedAt ?? "";
      // Another session from someone already on the fund (same first and last name) counts as their click.
      const same = det.firstName && det.lastName ? onFundByName.get(`${nameKey(det.firstName)[0]}|${nameKey(det.lastName).at(-1)}`) : undefined;
      if (same) { if (first) bucket(same).opened.push(first); continue; }
      if (det.fullName) linkOnly.push({ name: det.fullName, label: linkOnlyLabel(sessionStatus(r.events)), lastActivity: last });
      else if (last && now.getTime() - new Date(last).getTime() < ANON_WINDOW_DAYS * 86_400_000) anonymousOpens += 1;
    }
  }

  const rows = O.map((o) => {
    const p: any = person.get(o.person_id) ?? {};
    const pr: any = profile.get(o.investment_profile_id);
    const inv: any = invite.get(o.invitation_id);
    const b = per.get(o.id) ?? { invited: [], opened: [], started: [] };
    if (inv?.accepted_at) b.started.push(inv.accepted_at);
    const verifiedAt = linkFinished.get(o.id) ?? (String(p.kyc_status ?? "").toLowerCase() === "approved" ? checkAt.get(o.person_id) ?? null : null);
    const a = inviteActivity({ hasEmail: Boolean(String(p.email ?? "").trim()), hasAccount: Boolean(o.investor_user_id), invitedAt: b.invited, openedAt: b.opened, startedAt: b.started, verificationFinishedAt: verifiedAt });
    const name = [p.preferred_name || p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") || p.email || "Investor";
    return { onboardingId: o.id, name, investingAs: pr && pr.profile_type !== "individual" ? pr.legal_name ?? null : null, email: p.email ?? null, ...a };
  });
  const order: InviteLevel[] = ["not_invited", "invited", "opened", "started", "verified"];
  rows.sort((x, y) => Number(y.followUp) - Number(x.followUp) || order.indexOf(x.level) - order.indexOf(y.level) || x.name.localeCompare(y.name));
  linkOnly.sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
  return {
    staff: actor.isStaff, linkConnected: Boolean(wf.workflowId),
    counts: countInviteLevels(rows.map((r) => r.level)), followUps: rows.filter((r) => r.followUp).length,
    rows, linkOnly, anonymousOpens, anonymousWindowDays: ANON_WINDOW_DAYS,
  };
}

/**
 * Public: the invitation page was opened (before sign-in). Records one append-only
 * event per invitation per hour; returns nothing about the invitation.
 */
export async function noteInvitationOpened(reference: string) {
  if (!/^[A-Za-z0-9]{16,64}$/.test(reference)) return;
  const d = await db();
  const { data: inv } = await d.from("fund_invitations").select("id, offering_id, invite_role, role").eq("token", reference).maybeSingle();
  if (!inv || String(inv.invite_role ?? inv.role ?? "investor") !== "investor") return;
  const { data: ob } = await d.from("investor_onboardings").select("id").eq("invitation_id", inv.id).is("removed_at", null).limit(1).maybeSingle();
  if (!ob) return;
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { data: recent } = await d.from("investor_onboarding_events").select("id").eq("onboarding_id", ob.id).eq("event", OPEN_EVENT).gte("created_at", since).limit(1);
  if ((recent ?? []).length) return;
  await d.from("investor_onboarding_events").insert({ onboarding_id: ob.id, offering_id: inv.offering_id, event: OPEN_EVENT, subject_table: "fund_invitations", subject_id: inv.id, detail: {}, actor_user_id: null, actor_role: "visitor" });
}
