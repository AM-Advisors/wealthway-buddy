const A = "fcf83359-0486-402d-83b4-fd5484fb663d", F = "acb8193f-35fc-41cc-9ee5-629bde3e11b2", S = "3e5ec9a6-fefe-4359-9f70-c2cf82d21eb1";
const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server") as any;
const ex = await db.from("persons").select("id").ilike("email", "rmanger@bloomanlending.com");
if (ex.data?.length) throw new Error("exists");
const { fetchSessionDecision } = await import("@/lib/kyc-verification.server");
const d: any = await fetchSessionDecision(S);
const { answersFromDidit } = await import("@/lib/didit-questionnaire");
const answers = answersFromDidit(d.questionnaire);
const raw: any = {}; for (const s of d.questionnaire.sections) for (const i of s.items) raw[i.title.trim()] = i.answer?.value ?? i.answer;
const addr = raw["Subscriber's Address of residence"] ?? {}; const ph = raw["Phone"];
const tin = String(raw["Taxpayer Identification Number or Social Security Number"] ?? "").replace(/\D/g, "");
const amt = Math.round(Number(String(raw["Subscription Amount"]).replace(/[^\d.]/g, "")) * 100);
const { createInvestor } = await import("@/lib/investor-record.server");
const r = await createInvestor(A, { offeringId: F, confirmedNew: true, source: "staff" as any,
  person: { firstName: "Robert", lastName: "Manger", email: "rmanger@bloomanlending.com", phone: ph?.number ? `+${ph.callingCode}${ph.number}` : null,
    addressLine1: addr.street || null, city: addr.city || null, region: addr.state === "New York" ? "NY" : addr.state || null, postalCode: addr.postalCode || null, country: "US" },
  profile: { type: "entity", subType: "llc", legalName: "Manger Capital, LLC", details: {} },
  investment: { amountCents: amt, commitmentCents: amt, internalNotes: `Added from Didit session ${S} (Didit user 9bd58bf5-28aa-4575-819b-f650f8b28d72); approved by Alyssa Pettit.` },
  taxId: tin.length === 9 ? tin : null } as any);
const u = await db.from("investor_onboardings").update({ questionnaire_responses: answers, questionnaire_version: 1, questionnaire_source: "didit", questionnaire_didit_session_id: S, questionnaire_submitted_at: d.created_at }).eq("id", r.onboardingId);
if (u.error) throw u.error;
await db.from("source_reconciliation_decisions").insert({ source: "didit", source_ref: `session:${S}`, decision: "confirm_match", proposed_person_id: r.personId, reason: "Approved Didit session for Robert Manger (Manger Capital, LLC); linked to ROAS Hedge LP on Alyssa Pettit's instruction.", actor_user_id: A });
await db.from("investor_record_changes").insert({ offering_id: F, onboarding_id: r.onboardingId, subject_table: "investor_onboardings", subject_id: r.onboardingId, field: "questionnaire_responses", old_value: null, new_value: { source: "didit", answered: Object.keys(answers).length }, source: "staff", actor_user_id: A, manager_visible: true });
console.log(JSON.stringify({ ...r, amt: amt / 100, tin: tin.length === 9, answered: Object.keys(answers).length }));
