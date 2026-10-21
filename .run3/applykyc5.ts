const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
const { logComplianceEvent } = await import("@/lib/kyc-aml.server");
const APP = "013f4c52-a386-451f-a2e3-c159e66931c8";
const OFF = "fa5ff8b9-e69e-40b9-b9dc-5c6f54d6c88f";
const ALYSSA = "fcf83359-0486-402d-83b4-fd5484fb663d";
const PID = "283e50a6-b817-474d-accb-d6ee3087417c";
const now = new Date().toISOString();
const note = "Reviewed reused identity verification (session 60327733, provider-approved 2026-09-02): driver's license approved and valid to 2032, liveness approved, face match 92.88. Partial name match explained by middle name (Mcewen) absent from profile. Barcode warning reviewed; document details, photo and expiry all consistent. Sanctions screening run 2026-10-21 (request a5a42f42): Approved, 0 hits. Self-approval as Super Admin for own test walkthrough investment.";

// 1. Sanctions screening record for this application
const { data: existingAml } = await db.from("aml_screenings").select("id").eq("application_id", APP).maybeSingle();
const amlPayload = { application_id: APP, provider: "didit", report_id: "a5a42f42-57ce-4887-a237-6204552ebf14", status: "approved", matches: [], completed_at: now, updated_at: now };
const amlRes = existingAml?.id
  ? await db.from("aml_screenings").update(amlPayload).eq("id", existingAml.id)
  : await db.from("aml_screenings").insert(amlPayload);
if (amlRes.error) throw new Error("aml: " + amlRes.error.message);

// 2. Reviewer decision on the verification (same writes as decideComplianceCheck)
const v = await db.from("kyc_verifications").update({ status: "approved", harmonious_decision: "approved", harmonious_decision_reason: note, completed_at: now, updated_at: now }).eq("application_id", APP);
if (v.error) throw new Error("kyc: " + v.error.message);
const a = await db.from("investor_applications").update({ kyc_status: "approved", aml_status: "approved", updated_at: now }).eq("id", APP);
if (a.error) throw new Error("app: " + a.error.message);

// 3. Person record
const p = await db.from("persons").update({ kyc_status: "approved", kyc_verified_at: now, identity_verified_at: now, aml_status: "approved", aml_screened_at: now, date_of_birth: "1992-08-10", updated_at: now }).eq("id", PID);
if (p.error) throw new Error("person: " + p.error.message);

// 4. Compliance trail
await logComplianceEvent(db, { applicationId: APP, offeringId: OFF, userId: ALYSSA, actorId: ALYSSA, actorRole: "admin", checkKind: "kyc", action: "approved", payload: { status: "approved", reused_session: "60327733-1d91-4cd5-b8a5-a3f1b7b89464" }, note });
await logComplianceEvent(db, { applicationId: APP, offeringId: OFF, userId: ALYSSA, actorId: ALYSSA, actorRole: "admin", checkKind: "aml", action: "approved", payload: { status: "approved", report_id: "a5a42f42-57ce-4887-a237-6204552ebf14", hits: 0 }, note: "Sanctions screening approved, 0 hits." });

// 5. Refresh readiness so the Verification step completes
const { reconcileInvestmentReadiness } = await import("@/lib/investor-onboarding.server");
const { data: ob } = await db.from("investor_onboardings").select("id").eq("application_id", APP);
for (const o of ob ?? []) { try { await reconcileInvestmentReadiness(o.id, "kyc_review_approved"); } catch (e) { console.log("reconcile", o.id, (e as Error).message); } }
console.log("done", JSON.stringify({ onboardings: (ob ?? []).map((o: any) => o.id) }));
