/**
 * Fund-specific additional questionnaire section (pure).
 * An approved section is appended to the fund's investor questionnaire.
 * Questions already asked (same key or same wording) are never asked twice.
 */
import type { Question } from "@/lib/investor-onboarding-model";

export const SECTION_KEY_PREFIX = "fs_";

export const normalizeLabel = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** Questions from the section that are not already asked by the base questionnaire. */
export function newSectionQuestions(base: Question[], section: Question[]): Question[] {
  const keys = new Set(base.map((q) => q.key));
  const labels = new Set(base.map((q) => normalizeLabel(q.label)));
  const seen = new Set<string>();
  return section.filter((q) => {
    const l = normalizeLabel(q.label);
    if (keys.has(q.key) || labels.has(l) || seen.has(l)) return false;
    seen.add(l);
    return true;
  });
}

export type QuestionSection = { title: string; version: number; questions: Question[]; approvedAt?: string | null; newInvestmentsOnly?: boolean | null };

/** A "new investors only" section skips investments started before it was approved. Unknown start = applies. */
export function startedBeforeCutoff(startedAt: string | null | undefined, cutoff: string | null | undefined): boolean {
  if (!startedAt || !cutoff) return false;
  return new Date(startedAt).getTime() < new Date(cutoff).getTime();
}

/** Drops "new investors only" questions for an investment that started before they were published. */
export function questionsForInvestment(questions: Question[], startedAt: string | null | undefined): Question[] {
  return questions.filter((q) => !startedBeforeCutoff(startedAt, q.newInvestmentsFrom));
}

/** Base questionnaire plus the approved section's new questions, after a heading marker.
 * Pass startedAt to drop a "new investors only" section for an investment that began before it was approved. */
export function mergeSection<T extends { questions?: Question[] }>(base: T, section: QuestionSection | null, startedAt?: string | null): T & { sectionTitle?: string; sectionVersion?: number; sectionStartKey?: string } {
  if (!section) return base;
  const cutoff = section.newInvestmentsOnly ? section.approvedAt ?? null : null;
  const baseQs = base.questions ?? [];
  // A question carried over from an earlier "new investors only" version keeps that version's start time.
  const extra = newSectionQuestions(baseQs, section.questions)
    .map((q) => {
      const from = cutoff ? q.newInvestmentsFrom ?? cutoff : null;
      return from ? { ...q, newInvestmentsFrom: from } : q;
    })
    .filter((q) => !startedBeforeCutoff(startedAt, q.newInvestmentsFrom));
  const first = extra[0];
  if (!first) return base;
  return { ...base, questions: [...baseQs, ...extra], sectionTitle: section.title, sectionVersion: section.version, sectionStartKey: first.key };
}

/** At approval of a "new investors only" version: questions already in the previous approved
 * "new investors only" version keep its start time, so investors who began in between are still asked. */
export function carryNewInvestmentCutoffs(
  previous: { questions: Question[]; approvedAt: string | null; newInvestmentsOnly: boolean | null } | null,
  next: Question[],
  nextNewInvestmentsOnly: boolean,
): Question[] {
  const stripped = next.map(({ newInvestmentsFrom: _drop, ...q }) => q as Question);
  if (!nextNewInvestmentsOnly || !previous?.newInvestmentsOnly || !previous.approvedAt) return stripped;
  const prior = new Map(previous.questions.map((q) => [q.key, q.newInvestmentsFrom ?? previous.approvedAt]));
  return stripped.map((q) => (prior.get(q.key) ? { ...q, newInvestmentsFrom: prior.get(q.key)! } : q));
}

/** Validates a draft before saving: unique fs_ keys, labels, and options for select questions. */
export function validateSectionQuestions(qs: Question[]): string | null {
  const keys = new Set<string>();
  for (const q of qs) {
    if (!q.key.startsWith(SECTION_KEY_PREFIX)) return `Question key ${q.key} must start with ${SECTION_KEY_PREFIX}.`;
    if (keys.has(q.key)) return `Question key ${q.key} is used twice.`;
    keys.add(q.key);
    if (!q.label.trim()) return "Every question needs wording.";
    if ((q.type === "select" || q.type === "multi_select") && !(q.options?.length)) return `"${q.label}" needs answer choices.`;
  }
  return null;
}
