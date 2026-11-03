// Server-only: one identity check per person. The login (account) check is the person's
// identity check; investments made as that person reuse it and never start a second session.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { personIdentityAction, type PersonCheckState } from "@/lib/person-identity-model";

const db = () => supabaseAdmin as any;

/** Latest login identity check for this person or account, if any. */
export async function personIdentityCheck(userId: string | null, personId: string | null) {
  const ors = [userId ? `user_id.eq.${userId}` : null, personId ? `person_id.eq.${personId}` : null].filter(Boolean);
  if (!ors.length) return null;
  const { data } = await db().from("account_identity_checks")
    .select("id, user_id, person_id, status, session_id, session_url, updated_at")
    .or(ors.join(",")).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data ?? null) as null | { id: string; user_id: string; person_id: string | null; status: PersonCheckState; session_id: string | null; session_url: string | null };
}

/** What an investment's Verification step should do given the person's single check. */
export async function resolvePersonIdentity(userId: string | null, personId: string | null) {
  const c = await personIdentityCheck(userId, personId);
  return { check: c, action: personIdentityAction(c ? { status: c.status, sessionUrl: c.session_url } : null) };
}

/**
 * After a person's check is decided, apply it to every open investment they make as
 * themselves, close unstarted duplicate investment checks (kept, never deleted) and refresh readiness.
 */
export async function fanOutPersonIdentity(personId: string | null, sessionId: string | null, actorUserId: string | null) {
  if (!personId || !sessionId) return { applied: 0 };
  // Carry a clean screening result from the passed login check to the person record.
  try {
    const { data: chk } = await db().from("account_identity_checks").select("status, decision_summary").eq("session_id", sessionId).maybeSingle();
    const aml = (chk as any)?.decision_summary?.aml;
    const clean = (chk as any)?.status === "approved" && Number(aml?.hits ?? 0) === 0 && /approved|clear|passed/i.test(String(aml?.status ?? ""));
    if (clean) {
      await db().from("persons").update({ aml_status: "approved", aml_screened_at: new Date().toISOString() })
        .eq("id", personId).in("aml_status", ["not_started", "pending"]);
    }
  } catch (e) { console.error("[person-identity] screening carry-over", (e as Error).message); }
  const { data: obs } = await db().from("investor_onboardings")
    .select("id, application_id, questionnaire_didit_session_id, stage")
    .eq("person_id", personId).in("stage", ["profile_selected", "verification"]);
  const { autoApplyDiditForOnboarding } = await import("@/lib/didit-auto-apply.server");
  let applied = 0;
  for (const ob of (obs ?? []) as any[]) {
    try {
      if (!ob.questionnaire_didit_session_id) await db().from("investor_onboardings").update({ questionnaire_didit_session_id: sessionId }).eq("id", ob.id);
      await autoApplyDiditForOnboarding(ob.id, actorUserId);
      if (ob.application_id) await supersedeUnstartedInvestmentCheck(ob.application_id, sessionId);
      applied++;
    } catch (e) { console.error("[person-identity] fan-out", (e as Error).message); }
  }
  return { applied };
}

/** Closes an investment-level session the person never started; the record and provider evidence stay on file. */
export async function supersedeUnstartedInvestmentCheck(applicationId: string, personSessionId: string) {
  const { data: kv } = await db().from("kyc_verifications").select("id, status, session_id, provider_decision, harmonious_decision_reason")
    .eq("application_id", applicationId).maybeSingle();
  if (!kv || kv.session_id === personSessionId) return false;
  const unstarted = ["pending", "not_started"].includes(String(kv.status)) && /not started/i.test(String(kv.provider_decision ?? "not started"));
  if (!unstarted) return false;
  await db().from("kyc_verifications").update({
    status: "not_started", session_url: null,
    harmonious_decision_reason: `Replaced by the person's identity check (${personSessionId})`,
    updated_at: new Date().toISOString(),
  }).eq("id", kv.id);
  return true;
}
