// Server-only: one identity check per person. The login (account) check is the person's
// identity check; investments made as that person reuse it and never start a second session.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { personIdentityAction, prefillFactsFrom, type PersonCheckState } from "@/lib/person-identity-model";

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

/**
 * Verified facts (name, ID country) from the person's approved identity result: an approved
 * investment check first, otherwise the approved login check. Used for W-9/W-8 routing and prefill.
 */
export async function approvedPersonVerification(personId: string | null): Promise<null | { fullName: string | null; documentCountry: string | null }> {
  if (!personId) return null;
  const { data: k } = await db().from("kyc_verifications").select("verified_full_name, document_issuing_country")
    .eq("person_id", personId).eq("status", "approved").not("completed_at", "is", null)
    .order("completed_at", { ascending: false }).limit(1);
  const kv = (k ?? [])[0];
  if (kv) return { fullName: kv.verified_full_name ?? null, documentCountry: kv.document_issuing_country ?? null };
  const { data: a } = await db().from("account_identity_checks").select("decision_summary, review_details")
    .eq("person_id", personId).eq("status", "approved").order("decided_at", { ascending: false }).limit(1);
  const ac = (a ?? [])[0];
  if (!ac) return null;
  const doc = ac.review_details?.idDocument ?? {};
  return { fullName: doc.fullName ?? null, documentCountry: ac.decision_summary?.document?.country ?? doc.country ?? null };
}

/**
 * Questionnaire prefill / tax-form routing facts. Same as approvedPersonVerification, plus: when the
 * person is already identity-approved, the provider-approved check held only on Harmonious' side still
 * supplies the ID name and country. Never used for approvals, distributions or money paths.
 */
export async function personPrefillFacts(personId: string | null): Promise<null | { fullName: string | null; documentCountry: string | null }> {
  if (!personId) return null;
  const strict = await approvedPersonVerification(personId);
  if (strict) return strict;
  const [{ data: person }, { data: rows }] = await Promise.all([
    db().from("persons").select("kyc_status").eq("id", personId).maybeSingle(),
    db().from("kyc_verifications").select("status, provider_decision, completed_at, verified_full_name, document_issuing_country")
      .eq("person_id", personId).order("updated_at", { ascending: false }).limit(5),
  ]);
  return prefillFactsFrom((person as any)?.kyc_status ?? null, (rows ?? []) as any[]);
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
  let checkApproved = false;
  // Carry a clean screening result from the passed login check to the person record.
  try {
    const { data: chk } = await db().from("account_identity_checks").select("status, decision_summary").eq("session_id", sessionId).maybeSingle();
    checkApproved = (chk as any)?.status === "approved";
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
      const linked = ob.questionnaire_didit_session_id as string | null;
      // An approved newer check replaces an older linked check (e.g. one stuck In Review);
      // the older session and its provider evidence stay on file and the change is logged.
      if (!linked || (checkApproved && linked !== sessionId)) {
        await db().from("investor_onboardings").update({ questionnaire_didit_session_id: sessionId }).eq("id", ob.id);
        if (linked) {
          await db().from("person_onboarding_events").insert({
            person_id: personId, from_state: null, to_state: "kyc_pending", actor_kind: actorUserId ? "staff" : "provider", actor_user_id: actorUserId,
            reason: "Investment linked to the person's newer approved identity check",
            detail: { onboarding_id: ob.id, previous_session: linked, session: sessionId },
          });
        }
      }
      await autoApplyDiditForOnboarding(ob.id, actorUserId);
      if (ob.application_id) await supersedeUnstartedInvestmentCheck(ob.application_id, sessionId);
      await (await import("./investor-onboarding.server")).reconcileAfter([ob.id], { actorUserId, trigger: "person_identity_applied" });
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
