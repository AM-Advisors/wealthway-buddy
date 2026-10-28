import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const uuid = z.string().uuid();
const question = z.object({
  key: z.string().min(4).max(80),
  label: z.string().min(1).max(600),
  type: z.enum(["text", "textarea", "select", "boolean", "number", "date"]),
  required: z.boolean().optional(),
  options: z.array(z.string().max(300)).max(30).optional(),
  showWhen: z.any().optional(),
});
const tabs = () => import("@/lib/fund-tabs.server");

/** Staff or the fund's managers can read; returns the fund's sections and which questions are new. */
export const listQuestionSectionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => {
    const t = await tabs();
    const access = await t.assertFund(context.userId, data.offeringId);
    const db = await t.db();
    const { data: rows } = await db.from("fund_questionnaire_sections").select("id, version, title, questions, status, source_note, prepared_by, prepared_at, approved_by, approved_at").eq("offering_id", data.offeringId).order("version", { ascending: false });
    const { data: base } = await db.from("offering_questionnaires").select("questions").eq("offering_id", data.offeringId).eq("status", "published").order("version", { ascending: false }).limit(1);
    const baseQs = ((base ?? []) as any[])[0]?.questions ?? (await import("@/lib/standard-investor-questionnaire.json")).default;
    const { newSectionQuestions } = await import("@/lib/fund-questionnaire-section");
    return {
      staff: !!(access as any).staff,
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
  .validator(z.object({ offeringId: uuid, sectionId: uuid.nullish(), title: z.string().min(1).max(200), questions: z.array(question).max(80) }).parse)
  .handler(async ({ data, context }) => {
    const t = await tabs();
    if (!(await t.isStaff(context.userId))) throw new Error("Only Harmonious staff can edit fund questions.");
    const { validateSectionQuestions } = await import("@/lib/fund-questionnaire-section");
    const err = validateSectionQuestions(data.questions as any);
    if (err) throw new Error(err);
    const db = await t.db();
    if (data.sectionId) {
      const { error } = await db.from("fund_questionnaire_sections").update({ title: data.title, questions: data.questions, prepared_by: context.userId, prepared_at: new Date().toISOString() }).eq("id", data.sectionId).eq("offering_id", data.offeringId).eq("status", "draft");
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { data: last } = await db.from("fund_questionnaire_sections").select("version").eq("offering_id", data.offeringId).order("version", { ascending: false }).limit(1);
    const version = (((last ?? []) as any[])[0]?.version ?? 0) + 1;
    const { error } = await db.from("fund_questionnaire_sections").insert({ offering_id: data.offeringId, version, title: data.title, questions: data.questions, prepared_by: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Second-person approval (Super Admins may self-approve with a logged reason). Retires the prior approved version. */
export const approveQuestionSectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ sectionId: uuid }).parse)
  .handler(async ({ data, context }) => {
    const t = await tabs();
    if (!(await t.isStaff(context.userId))) throw new Error("Only Harmonious staff can approve fund questions.");
    const db = await t.db();
    const { data: row } = await db.from("fund_questionnaire_sections").select("*").eq("id", data.sectionId).maybeSingle();
    if (!row || row.status !== "draft") throw new Error("That draft wasn't found.");
    if (row.prepared_by === context.userId) {
      const { selfApprove } = await import("@/lib/self-approval.server");
      if (!(await selfApprove(context.userId, "fund_questionnaire_section.approve", [row.id]))) throw new Error("A different Harmonious reviewer must approve questions you prepared.");
    }
    await db.from("fund_questionnaire_sections").update({ status: "retired" }).eq("offering_id", row.offering_id).eq("status", "approved");
    const { error } = await db.from("fund_questionnaire_sections").update({ status: "approved", approved_by: context.userId, approved_at: new Date().toISOString() }).eq("id", row.id).eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
