import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { ACCREDITATION_QUESTION_KEY, accreditationOutcome, basisFromAnswer, selfCertificationAllowed } from "@/lib/accreditation-step";

/**
 * The investor confirms the accredited-investor category they chose in the
 * questionnaire. On a 506(b) fund that completes accreditation (no reviewer);
 * refused on 506(c) funds, which need paperwork reviewed.
 */
export const confirmAccreditationStepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ onboardingId: z.string().uuid(), signature: z.string().trim().min(2).max(120) }).parse)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: row } = await db.from("investor_onboardings")
      .select("id, investor_user_id, application_id, offering_id, questionnaire_responses").eq("id", data.onboardingId).maybeSingle();
    if (!row || row.investor_user_id !== userId) throw new Error("That investment isn't yours.");
    if (!row.application_id) throw new Error("Finish About You first.");
    const { data: offering } = await db.from("offerings").select("reg_type").eq("id", row.offering_id).maybeSingle();
    if (!selfCertificationAllowed(offering?.reg_type)) throw new Error("This fund requires verified accreditation. Upload proof or a verification letter.");
    const answer = (row.questionnaire_responses ?? {})[ACCREDITATION_QUESTION_KEY];
    const basis = basisFromAnswer(answer);
    if (!basis) throw new Error("Choose your accredited-investor category in the questionnaire first.");
    const { data: app } = await db.from("investor_applications").select("accreditation_status").eq("id", row.application_id).maybeSingle();
    if (app?.accreditation_status === "approved") return { ok: true, status: "approved" };
    const now = new Date().toISOString();
    const payload = {
      application_id: row.application_id, reg_type: "506b", method: basis,
      questionnaire: { source: "investor_questionnaire", category: String(answer), submitted_at: now },
      qualifies: true, attested_at: now, attested_signature: data.signature,
      status: accreditationOutcome(offering?.reg_type), verified_at: now, updated_at: now,
    };
    const { data: existing } = await db.from("accreditation_records").select("id").eq("application_id", row.application_id).maybeSingle();
    const res = existing ? await db.from("accreditation_records").update(payload).eq("id", existing.id) : await db.from("accreditation_records").insert(payload);
    if (res.error) throw new Error(res.error.message);
    const up = await db.from("investor_applications").update({ accreditation_status: "approved", updated_at: now }).eq("id", row.application_id);
    if (up.error) throw new Error(up.error.message);
    try {
      const { reconcileInvestmentReadiness } = await import("@/lib/investor-onboarding.server");
      await reconcileInvestmentReadiness(row.id, { actorUserId: userId, trigger: "accreditation_confirmed" } as any);
    } catch { /* readiness refresh never undoes the record */ }
    return { ok: true, status: "approved" };
  });

/** 506(c) paperwork waiting on this fund's managers (Harmonious reviews from Operations). */
export const listPendingAccreditationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/accreditation-review.server")).listPending(context.userId, data.offeringId));

export const accreditationFileUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ documentId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/accreditation-review.server")).fileUrl(context.userId, data.documentId));

export const decideAccreditationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ applicationId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), notes: z.string().trim().max(600).default("") }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/accreditation-review.server")).decide(context.userId, data));

export const rerunAccreditationAiFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ documentId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/accreditation-review.server")).rerunAiCheck(context.userId, data.documentId));
