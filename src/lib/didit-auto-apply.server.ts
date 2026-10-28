// Didit is Harmonious' KYC/KYB/AML provider. When an investor's Didit session
// is Approved, its verified identity details and screening results are
// accepted onto the person record automatically (no reviewer step). Sessions
// that are In Review/Declined are never auto-approved. Every change is logged.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchDiditSessionDecision } from "@/lib/didit.server";
import { mergeVerifiedPersonFields } from "@/lib/kyc-person-backfill";

const db = () => supabaseAdmin as any;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const approved = (v: unknown) => String(v ?? "").toLowerCase() === "approved";

export function extractDiditDetails(d: any) {
  const id = (Array.isArray(d?.id_verifications) ? d.id_verifications[0] : d?.id_verification) ?? {};
  const addr = id?.parsed_address ?? {};
  const aml = Array.isArray(d?.aml_screenings) ? d.aml_screenings : d?.aml ? [d.aml] : [];
  const amlHits = aml.reduce((n: number, a: any) => n + (Array.isArray(a?.hits) ? a.hits.length : 0), 0);
  const amlStatus = !aml.length ? null : aml.every((a: any) => approved(a?.status)) && amlHits === 0 ? "approved" : "review";
  const iso = (v: unknown) => (s(v) && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
  return {
    sessionApproved: approved(d?.status),
    idApproved: approved(id?.status),
    amlStatus,
    fields: {
      legal_first_name: s(id?.first_name),
      legal_last_name: s(id?.last_name),
      date_of_birth: iso(id?.date_of_birth),
      citizenship_country: s(id?.nationality),
      address_line1: s(addr?.street_1),
      address_line2: s(addr?.street_2),
      city: s(addr?.city),
      region: s(addr?.region),
      postal_code: s(addr?.postal_code),
      country: s(addr?.country),
    } as any,
  };
}

/** Applies an approved Didit session to the onboarding's person. Idempotent. */
export async function autoApplyDiditForOnboarding(onboardingId: string, actorUserId: string | null = null) {
  const { data: ob } = await db().from("investor_onboardings")
    .select("id, offering_id, person_id, investment_profile_id, questionnaire_didit_session_id")
    .eq("id", onboardingId).maybeSingle();
  if (!ob?.person_id || !ob.questionnaire_didit_session_id) return { applied: false, reason: "no linked identity check" };
  const decision = await fetchDiditSessionDecision(ob.questionnaire_didit_session_id);
  if (!decision) return { applied: false, reason: "identity-check result unavailable" };
  const x = extractDiditDetails(decision);
  const { normalizeDiditDecision } = await import("@/lib/kyc-verification");
  const normalized = normalizeDiditDecision(decision);
  const { notifyVerificationConfirmation } = await import("@/lib/ops-slack-notify.server");
  const notice = { ref: ob.questionnaire_didit_session_id, offeringId: ob.offering_id, path: `/ops/fund/${encodeURIComponent(ob.offering_id)}?tab=investors` };
  await notifyVerificationConfirmation({ ...notice, check: "KYC", status: normalized.providerStatus });
  await notifyVerificationConfirmation({ ...notice, check: "AML", status: normalized.aml.status });
  if (!x.sessionApproved) return { applied: false, reason: `identity-check status ${(decision as any).status ?? "unknown"}` };

  const { data: person } = await db().from("persons").select("*").eq("id", ob.person_id).maybeSingle();
  if (!person) return { applied: false, reason: "person not found" };
  const now = new Date().toISOString();
  // Shared verified write-back rule set (verified-wins mode): approved facts
  // replace differing values, address moves only as a complete group, and
  // every write is logged below.
  const fields: Record<string, string | null> = { ...x.fields };
  if (!person.residence_country && x.fields.country) fields["residence_country"] = x.fields.country;
  const merged = mergeVerifiedPersonFields(person, fields, "verified-wins");
  const update: any = { ...merged.update };
  const changes: any[] = merged.filledFields.map((field) => ({
    field,
    from: person[field] ?? null,
    to: merged.update[field],
  }));
  if (person.kyc_status !== "approved") { update.kyc_status = "approved"; update.kyc_verified_at = now; update.identity_verified_at = now; changes.push({ field: "kyc_status", from: person.kyc_status, to: "approved" }); }
  if (x.amlStatus && person.aml_status !== x.amlStatus) {
    update.aml_status = x.amlStatus;
    if (x.amlStatus === "approved") update.aml_screened_at = now;
    changes.push({ field: "aml_status", from: person.aml_status, to: x.amlStatus });
  }
  if (!changes.length) return { applied: true, changed: 0 };
  update.updated_at = now;
  const { error } = await db().from("persons").update(update).eq("id", person.id);
  if (error) throw new Error(error.message);
  await db().from("investor_record_changes").insert(changes.map((c) => ({
    offering_id: ob.offering_id, onboarding_id: ob.id, subject_table: "persons", subject_id: person.id, field: c.field,
    old_value: c.from, new_value: c.to, source: "provider", actor_user_id: actorUserId,
    manager_visible: c.field !== "date_of_birth",
  })));
  await db().from("person_onboarding_events").insert({
    person_id: person.id, from_state: person.onboarding_state ?? null, to_state: person.onboarding_state ?? "kyc_pending",
    actor_kind: "provider", actor_user_id: actorUserId,
    reason: "Approved identity check applied automatically",
    detail: { fields: changes.map((c) => c.field), aml: x.amlStatus },
  });
  try {
    const { reconcileReadinessForSubjects } = await import("@/lib/investor-onboarding.server");
    await reconcileReadinessForSubjects({ investmentProfileId: ob.investment_profile_id }, "didit_auto_apply");
  } catch (e) { console.error("[didit-auto] readiness", (e as Error).message); }
  const kycNow = update.kyc_status ?? person.kyc_status;
  const amlNow = update.aml_status ?? person.aml_status;
  if (kycNow === "approved" && amlNow === "approved") {
    try {
      const { notifyComplianceClear } = await import("@/lib/ops-slack-notify.server");
      const name = [person.legal_first_name, person.legal_last_name].filter(Boolean).join(" ") || person.email || "Investor";
      await notifyComplianceClear({ personId: person.id, personName: name, offeringId: ob.offering_id });
    } catch (e) { console.error("[didit-auto] compliance notify", (e as Error).message); }
  }
  return { applied: true, changed: changes.length };
}

/** Applies every onboarding linked to the given Didit session. */
export async function autoApplyDiditSession(sessionId: string | null) {
  if (!sessionId) return;
  const { data } = await db().from("investor_onboardings").select("id").eq("questionnaire_didit_session_id", sessionId);
  for (const r of (data ?? []) as any[]) {
    try { await autoApplyDiditForOnboarding(r.id); } catch (e) { console.error("[didit-auto]", (e as Error).message); }
  }
}

/**
 * Staff-approved account identity check: fill still-blank person details
 * from the verified session (fill-blank mode, so typed answers stay) and mark
 * the person verified. Used when no onboarding links the session.
 */
export async function applyApprovedAccountCheck(personId: string | null, sessionId: string | null, actorUserId: string) {
  if (!personId || !sessionId) return { applied: false };
  const decision = await fetchDiditSessionDecision(sessionId);
  if (!decision) return { applied: false };
  const x = extractDiditDetails(decision);
  const { data: person } = await db().from("persons").select("*").eq("id", personId).maybeSingle();
  if (!person) return { applied: false };
  const now = new Date().toISOString();
  const { legal_first_name: _f, legal_last_name: _l, ...facts } = x.fields as Record<string, string | null>;
  if (facts["country"]) facts["residence_country"] = facts["country"];
  const merged = mergeVerifiedPersonFields(person, facts, "fill-blank");
  const update: any = { ...merged.update };
  if (person.kyc_status !== "approved") Object.assign(update, { kyc_status: "approved", kyc_verified_at: now, identity_verified_at: now });
  if (x.amlStatus === "approved" && person.aml_status !== "approved") Object.assign(update, { aml_status: "approved", aml_screened_at: now });
  if (!Object.keys(update).length) return { applied: true, changed: 0 };
  update.updated_at = now;
  const { error } = await db().from("persons").update(update).eq("id", personId);
  if (error) throw new Error(error.message);
  await db().from("person_onboarding_events").insert({
    person_id: personId, from_state: person.onboarding_state ?? null, to_state: person.onboarding_state ?? "kyc_pending",
    actor_kind: "staff", actor_user_id: actorUserId,
    reason: "Staff-approved identity check applied to blank details",
    detail: { fields: Object.keys(update) },
  });
  return { applied: true, changed: Object.keys(update).length };
}
