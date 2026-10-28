import { z } from "zod";
import type { Question } from "./investor-onboarding-model";
import { newSectionQuestions } from "./fund-questionnaire-section";

export const SAFE_QUESTION_FACTS = ["address_line1", "address_line2", "city", "region", "postal_code", "country", "phone", "date_of_birth", "citizenship_country", "formation_state", "formation_date"] as const;
export const questionAiOutput = z.object({
  title: z.string(),
  questions: z.array(z.object({
    label: z.string(), type: z.enum(["yes_no", "text", "number", "currency", "date", "select", "multi_select"]),
    required: z.boolean(), options: z.array(z.string()),
    sourceReference: z.string(), sourceQuote: z.string(),
    prefillKey: z.enum(SAFE_QUESTION_FACTS).nullable(),
  })),
  alreadyCovered: z.array(z.object({ label: z.string(), existingKey: z.string(), sourceReference: z.string() })),
  warnings: z.array(z.string()),
});
export type QuestionAiOutput = z.infer<typeof questionAiOutput>;
export type DocumentQuestion = Question & { sourceReference?: string; sourceQuote?: string; prefillKey?: string | null };

export function sourceAgreementApproved(version: { approval_status: string } | null) {
  return version?.approval_status === "approved";
}

export function documentQuestionDraft(output: QuestionAiOutput, base: Question[], existing: DocumentQuestion[]) {
  if (output.questions.length > 80) throw new Error("The document has too many questions. Select fewer agreements.");
  const additions: DocumentQuestion[] = output.questions.map((q, i) => {
    if (!q.label.trim() || q.label.length > 600 || !q.sourceReference.trim() || !q.sourceQuote.trim()) throw new Error("A suggested question is missing its document evidence.");
    if (q.options.length > 30 || q.options.some((s) => !s.trim() || s.length > 300)) throw new Error("Review the suggested answer choices.");
    if (["select", "multi_select"].includes(q.type) && !q.options.length) throw new Error("A selection question needs answer choices.");
    // Only directly equivalent factual fields can reuse a recorded value. No certifications or eligibility.
    const prefillKey = ["text", "date"].includes(q.type) ? q.prefillKey : null;
    return { key: `fs_ai_${crypto.randomUUID().replace(/-/g, "")}_${i}`, label: q.label, type: q.type, required: q.required,
      options: q.options, sourceReference: q.sourceReference.slice(0, 500), sourceQuote: q.sourceQuote.slice(0, 1200), prefillKey };
  });
  // Suggested semantic matches are displayed, never trusted to remove investor questions.
  const questions = [...existing, ...newSectionQuestions([...base, ...existing], additions)] as DocumentQuestion[];
  if (questions.length > 80) throw new Error("The combined section exceeds 80 questions. Review it before adding more.");
  return { title: output.title.slice(0, 200) || "Additional fund questions", questions,
    alreadyCovered: output.alreadyCovered.filter((q) => base.some((b) => b.key === q.existingKey)), warnings: output.warnings };
}

/** Called with exact-party facts only; never model-generated investor responses. */
export function mappedQuestionFacts(questions: DocumentQuestion[], supplied: Record<string, unknown>) {
  const mapped = { ...supplied };
  for (const q of questions) {
    if (!q.key.startsWith("fs_") || !["text", "date"].includes(q.type) || !SAFE_QUESTION_FACTS.some((key) => key === q.prefillKey)) continue;
    const value = supplied[q.prefillKey ?? ""];
    if (typeof value === "string" && value.trim()) mapped[q.key] = value;
  }
  return mapped;
}