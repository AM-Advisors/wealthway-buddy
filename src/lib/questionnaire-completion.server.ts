import standardQuestions from "./standard-investor-questionnaire.json";
import { mergeSection } from "./fund-questionnaire-section";
import { questionnaireCompletion } from "./questionnaire-completion";
import type { Question } from "./investor-onboarding-model";

/** Bounded fund-level reads, never a questionnaire lookup per investor. */
export async function loadCompletionQuestions(d: any, offeringIds: string[]) {
  const ids = [...new Set(offeringIds.filter(Boolean))];
  const result = new Map<string, Question[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [bases, sections] = await Promise.all([
      d.from("offering_questionnaires").select("offering_id, version, questions").in("offering_id", chunk).eq("status", "published").order("version", { ascending: false }),
      d.from("fund_questionnaire_sections").select("offering_id, title, version, questions").in("offering_id", chunk).eq("status", "approved").order("version", { ascending: false }),
    ]);
    if (bases.error || sections.error) throw new Error("Questionnaire requirements could not be loaded.");
    for (const id of chunk) {
      const base = (bases.data ?? []).find((r: any) => r.offering_id === id) ?? { questions: standardQuestions as Question[] };
      const section = (sections.data ?? []).find((r: any) => r.offering_id === id) ?? null;
      result.set(id, mergeSection(base, section).questions ?? []);
    }
  }
  return result;
}

export async function questionnaireCompletionForRows(d: any, rows: any[]) {
  const questions = await loadCompletionQuestions(d, rows.map((r) => r.offering_id));
  const ids = [...new Set(rows.map((r) => r.investment_profile_id).filter(Boolean))];
  const profiles = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await d.from("investment_profiles").select("id, profile_type").in("id", ids.slice(i, i + 100));
    if (error) throw new Error("Investing party details could not be loaded.");
    for (const p of data ?? []) profiles.set(p.id, p.profile_type);
  }
  return new Map(rows.map((r) => [r.id, questionnaireCompletion({
    submittedAt: r.questionnaire_submitted_at, version: r.questionnaire_version,
    questions: questions.get(r.offering_id) ?? null, answers: r.questionnaire_responses,
    profileType: profiles.get(r.investment_profile_id),
  })]));
}