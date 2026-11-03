import { setupActor, forbid } from "./fund-setup.server";
import { logReviewerActivity } from "./reviewer-activity.server";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
export const MANAGER_REVIEW_KINDS = ["entity_formation", "operating_agreement", "trust_agreement", "ownership_list", "tax_form", "other"] as const;

export async function assertUploadReviewer(userId: string, offeringId: string) {
  const actor = await setupActor(userId);
  if (!actor.isStaff && !actor.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return actor;
}

export async function uploadReviewContext(userId: string, documentId: string) {
  const d = await admin();
  const { data: row, error } = await d.from("investor_documents").select("id, offering_id, onboarding_id, application_id, investment_profile_id, user_id, prepared_for_person_id, storage_path, file_name, doc_kind, review_status").eq("id", documentId).maybeSingle();
  if (error || !row?.offering_id) throw new Error("That file is not available.");
  const actor = await assertUploadReviewer(userId, row.offering_id);
  if (row.onboarding_id) {
    const { data: ob } = await d.from("investor_onboardings").select("id, offering_id, investment_profile_id, investor_user_id, person_id, removed_at").eq("id", row.onboarding_id).maybeSingle();
    if (!ob || ob.removed_at || ob.offering_id !== row.offering_id || (row.investment_profile_id && ob.investment_profile_id !== row.investment_profile_id) || (ob.investor_user_id ? row.user_id !== ob.investor_user_id : row.prepared_for_person_id !== ob.person_id)) throw new Error("This file does not match the recorded investor.");
  } else if (row.application_id) {
    const { data: app } = await d.from("investor_applications").select("offering_id, user_id").eq("id", row.application_id).maybeSingle();
    if (!app || app.offering_id !== row.offering_id || app.user_id !== row.user_id) throw new Error("This file does not match the recorded investor.");
  } else throw new Error("This file needs a recorded investment before review.");
  return { d, row, actor };
}

export async function reviewInvestorUpload(userId: string, input: { id: string; status: "new" | "accepted" | "needs_followup"; note?: string | null | undefined }) {
  const { d, row, actor } = await uploadReviewContext(userId, input.id);
  if (!actor.isStaff && !(MANAGER_REVIEW_KINDS as readonly string[]).includes(row.doc_kind)) throw new Error("Use the dedicated identity, accreditation or bank review for this document.");
  if (input.status === "new") throw new Error("Reviewed originals are retained. Upload a new copy for another review.");
  if (row.review_status !== "new") throw new Error("This copy has already been reviewed. Refresh to see the decision.");
  const note = input.note?.trim() || null;
  if (input.status === "needs_followup" && !note) throw new Error("Explain what the investor needs to provide.");
  const { data: updated, error } = await d.from("investor_documents").update({ review_status: input.status, review_note: note, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", row.id).eq("review_status", "new").select("id").maybeSingle();
  if (error || !updated) throw new Error("This copy changed during review. Refresh and try again.");
  await logReviewerActivity(d, { actorId: userId, offeringId: row.offering_id, applicationId: row.application_id, action: "upload_reviewed", area: row.doc_kind, outcome: input.status === "accepted" ? "approved" : "delayed", summary: "Investor supporting document reviewed", note, metadata: { documentId: row.id, onboardingId: row.onboarding_id, taxCopyOnly: row.doc_kind === "tax_form" } });
  // A copy decision never writes identity, accreditation, tax certifications, signatures or money gates.
  return { ok: true };
}
/** Pure: who may record a W-9/W-8 as completed outside the platform. */
export function canCompleteTaxOutside(input: { isStaff: boolean; managesFund: boolean; actorId: string; investorUserId: string | null; docKind: string; status: string | null }) {
  if (input.docKind !== "tax_form") return { ok: false as const, reason: "Only a signed W-9 or W-8 can be marked completed this way." };
  if (!["new", "accepted"].includes(input.status ?? "new")) return { ok: false as const, reason: "This copy can't be marked completed. Upload a new signed copy." };
  if (!input.isStaff && !input.managesFund) return { ok: false as const, reason: "Only Harmonious or this fund's manager can do this." };
  if (input.investorUserId && input.investorUserId === input.actorId) return { ok: false as const, reason: "You can't complete your own tax form this way." };
  return { ok: true as const };
}

/** Records a signed W-9/W-8 completed outside the platform for this exact investment. The original file is retained. */
export async function completeTaxFormOutside(userId: string, input: { id: string; note?: string | null | undefined }) {
  const { d, row, actor } = await uploadReviewContext(userId, input.id);
  const check = canCompleteTaxOutside({ isStaff: actor.isStaff, managesFund: actor.offeringIds.includes(row.offering_id), actorId: userId, investorUserId: row.user_id, docKind: row.doc_kind, status: row.review_status });
  if (!check.ok) throw new Error(check.reason);
  const note = input.note?.trim() || "Signed outside the platform";
  const { data: updated, error } = await d.from("investor_documents").update({ review_status: "completed_outside", review_note: note, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", row.id).eq("review_status", row.review_status).select("id").maybeSingle();
  if (error || !updated) throw new Error("This copy changed. Refresh and try again.");
  await logReviewerActivity(d, { actorId: userId, offeringId: row.offering_id, applicationId: row.application_id, action: "tax_form_completed_outside", area: "tax_form", outcome: "approved", summary: "Signed tax form recorded as completed outside the platform", note, metadata: { documentId: row.id, onboardingId: row.onboarding_id } });
  try { const { reconcileReadinessForSubjects } = await import("@/lib/investor-onboarding.server"); await reconcileReadinessForSubjects({ investmentProfileId: row.investment_profile_id }, "tax_form_completed_outside"); } catch (e) { console.error("[tax-outside] readiness", (e as Error).message); }
  return { ok: true };
}
