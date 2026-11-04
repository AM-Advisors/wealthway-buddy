import { validateQuestionnaire, type Question } from "./investor-onboarding-model";

/** Submission metadata is not proof that the applicable required answers exist. */
export function questionnaireCompletion(input: {
  submittedAt?: string | null;
  version?: number | null;
  questions: Question[] | null;
  answers?: Record<string, unknown> | null;
  profileType?: string | null;
}) {
  const errors = input.questions
    ? validateQuestionnaire(input.questions, input.answers ?? {}, input.profileType).errors
    : [{ key: "questionnaire", message: "Questionnaire could not be loaded." }];
  return {
    complete: Boolean(input.submittedAt && input.version && input.questions && errors.length === 0),
    missingRequired: errors.length,
  };
}