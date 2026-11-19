import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const uuid = z.string().uuid();
const question = z.object({
  key: z.string().min(4).max(80),
  label: z.string().min(1).max(600),
  type: z.enum(["yes_no", "text", "number", "currency", "date", "select", "multi_select", "certification"]),
  required: z.boolean().optional(),
  options: z.array(z.string().max(300)).max(30).optional(),
  sourceReference: z.string().max(500).optional(),
  sourceQuote: z.string().max(1200).optional(),
  prefillKey: z.enum(["address_line1", "address_line2", "city", "region", "postal_code", "country", "phone", "date_of_birth", "citizenship_country", "formation_state", "formation_date"]).nullish(),
  showWhen: z.any().optional(),
  appliesTo: z.array(z.string().max(40)).max(20).optional(),
});
const tabs = () => import("@/lib/fund-tabs.server");

/** Staff or the fund's managers can read; returns the fund's sections and which questions are new. */
export const listQuestionSectionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => {
    const t = await tabs();
    const db = await t.db();
    const access = await (await import("./fund-routine-access.server")).assertRoutineFund(db, context.userId, data.offeringId);
    const { questionAuthorAccess, questionDocumentOptions } = await import("./fund-question-ai.server");
    const author = await questionAuthorAccess(context.supabase, context.userId, data.offeringId).catch(() => null);
    const documents = author ? await questionDocumentOptions(db, data.offeringId) : [];
    const { data: aiState } = author ? await db.from("fund_questionnaire_ai_state").select("blocked_message,reset_at").eq("offering_id", data.offeringId).maybeSingle() : { data: null };
    const { data: rows, error } = await db.from("fund_questionnaire_sections").select("id, version, title, questions, status, source_note, source_documents, new_investments_only, prepared_by, prepared_at, approved_by, approved_at").eq("offering_id", data.offeringId).order("version", { ascending: false });
    if (error) throw new Error("Could not load additional fund questions.");
    const { data: base } = await db.from("offering_questionnaires").select("questions").eq("offering_id", data.offeringId).eq("status", "published").order("version", { ascending: false }).limit(1);
    const baseQs = ((base ?? []) as any[])[0]?.questions ?? (await import("@/lib/standard-investor-questionnaire.json")).default;
    const { newSectionQuestions } = await import("@/lib/fund-questionnaire-section");
    return {
      staff: !!access.staff,
      canApprove: true,
      canDraft: !!author,
      documents,
      aiBlocked: aiState && !aiState.reset_at ? aiState.blocked_message as string : null,
      baseCount: (baseQs as any[]).length,
      sections: ((rows ?? []) as any[]).map((r) => ({
        ...r,
        preparedByMe: r.prepared_by === context.userId,
        alreadyAskedKeys: (r.questions as any[]).filter((q) => !newSectionQuestions(baseQs, [q]).length).map((q) => q.key),
      })),
    };
  });

export const saveQuestionSectionDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid, sectionId: uuid.nullish(), title: z.string().min(1).max(200), questions: z.array(question).max(80), sourceNote: z.string().max(3000).nullish(), sourceDocuments: z.array(z.object({ id: uuid, documentId: uuid, version: z.number().int().positive(), title: z.string().max(500), fileName: z.string().max(500) })).max(3).optional(), newInvestmentsOnly: z.boolean().optional() }).parse)
  .handler(async ({ data, context }) => {
    const t = await tabs();
    const { questionAuthorAccess } = await import("./fund-question-ai.server");
    await questionAuthorAccess(context.supabase, context.userId, data.offeringId);
    const { validateSectionQuestions } = await import("@/lib/fund-questionnaire-section");
    const err = validateSectionQuestions(data.questions as any);
    if (err) throw new Error(err);
    const db = await t.db();
    for (const source of data.sourceDocuments ?? []) {
      const { data: v, error } = await db.from("offering_document_versions").select("id").eq("id", source.id).eq("offering_id", data.offeringId).eq("offering_document_id", source.documentId).eq("version", source.version).maybeSingle();
      if (error || !v) throw new Error("A source agreement no longer belongs to this fund.");
    }
    const provenance = { ...(data.sourceNote != null ? { source_note: data.sourceNote } : {}), ...(data.sourceDocuments ? { source_documents: data.sourceDocuments } : {}), ...(data.newInvestmentsOnly !== undefined ? { new_investments_only: data.newInvestmentsOnly } : {}) };
    if (data.sectionId) {
      const { data: saved, error } = await db.from("fund_questionnaire_sections").update({ title: data.title, questions: data.questions, prepared_by: context.userId, prepared_at: new Date().toISOString(), ...provenance }).eq("id", data.sectionId).eq("offering_id", data.offeringId).eq("status", "draft").select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!saved) throw new Error("That draft changed. Refresh before saving.");
      if (!(await autoApproveDemoSection(db, context.userId, data.offeringId, saved.id))) await (await import("./fund-review-notify.server")).notifyFundReview("questions", saved.id);
      return { ok: true };
    }
    const { data: last } = await db.from("fund_questionnaire_sections").select("version").eq("offering_id", data.offeringId).order("version", { ascending: false }).limit(1);
    const version = (((last ?? []) as any[])[0]?.version ?? 0) + 1;
    const { data: savedSection, error } = await db.from("fund_questionnaire_sections").insert({ offering_id: data.offeringId, version, title: data.title, questions: data.questions, prepared_by: context.userId, ...provenance }).select("id").single();
    if (error) throw new Error(error.message);
    if (savedSection && !(await autoApproveDemoSection(db, context.userId, data.offeringId, savedSection.id))) await (await import("./fund-review-notify.server")).notifyFundReview("questions", savedSection.id);
    return { ok: true };
  });

/** One explicit staff approval. Source review and version immutability remain required. */
export const approveQuestionSectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ sectionId: uuid }).parse)
  .handler(async ({ data, context }) => {
    const db = await (await tabs()).db();
    await approveSection(db, context.userId, data.sectionId);
    return { ok: true };
  });

/** One explicit approval by an authorized person; demo funds call it right after saving. */
async function approveSection(db: any, userId: string, sectionId: string) {
    const { data: row } = await db.from("fund_questionnaire_sections").select("*").eq("id", sectionId).maybeSingle();
    if (!row || row.status !== "draft") throw new Error("That draft wasn't found.");
    await (await import("./fund-routine-access.server")).assertRoutineFund(db, userId, row.offering_id);
    const { validateSectionQuestions } = await import("./fund-questionnaire-section");
    const invalid = validateSectionQuestions(row.questions);
    if (invalid) throw new Error(invalid);
    const { sourceAgreementApproved } = await import("./fund-question-ai-model");
    // Analysis may read pending uploads, but investor questions cannot publish ahead of their source agreements.
    for (const source of row.source_documents ?? []) {
      const { data: version, error } = await db.from("offering_document_versions").select("approval_status").eq("id", source.id).eq("offering_id", row.offering_id).eq("offering_document_id", source.documentId).eq("version", source.version).maybeSingle();
      if (error || !sourceAgreementApproved(version)) throw new Error("Approve the source agreement version before publishing its questions.");
    }
    // Staff authority is checked above; saving or AI analysis never supplies this approval.
    const { data: prev } = await db.from("fund_questionnaire_sections").select("questions, approved_at, new_investments_only").eq("offering_id", row.offering_id).eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle();
    const { carryNewInvestmentCutoffs } = await import("./fund-questionnaire-section");
    const questions = carryNewInvestmentCutoffs(prev ? { questions: prev.questions as any, approvedAt: prev.approved_at, newInvestmentsOnly: prev.new_investments_only } : null, row.questions as any, !!row.new_investments_only);
    await db.from("fund_questionnaire_sections").update({ status: "retired" }).eq("offering_id", row.offering_id).eq("status", "approved");
    const { error } = await db.from("fund_questionnaire_sections").update({ status: "approved", questions: questions as any, approved_by: userId, approved_at: new Date().toISOString() }).eq("id", row.id).eq("status", "draft");
    if (error) throw new Error(error.message);
}

/** Demo funds only: the saved draft approves itself when its source agreements allow; otherwise it waits as usual. */
async function autoApproveDemoSection(db: any, userId: string, offeringId: string, sectionId: string) {
  const { isDemoFund } = await import("./demo-fund.server");
  const { demoAutoApproves } = await import("./demo-fund");
  if (!demoAutoApproves("fund_questionnaire_section", await isDemoFund(db, offeringId))) return false;
  try { await approveSection(db, userId, sectionId); return true; } catch { return false; }
}
