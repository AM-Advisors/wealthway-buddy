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

/** Base questionnaire plus the approved section's new questions, after a heading marker. */
export function mergeSection<T extends { questions?: Question[] }>(base: T, section: { title: string; version: number; questions: Question[] } | null): T & { sectionTitle?: string; sectionVersion?: number; sectionStartKey?: string } {
  if (!section) return base;
  const baseQs = base.questions ?? [];
  const extra = newSectionQuestions(baseQs, section.questions);
  const first = extra[0];
  if (!first) return base;
  return { ...base, questions: [...baseQs, ...extra], sectionTitle: section.title, sectionVersion: section.version, sectionStartKey: first.key };
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
