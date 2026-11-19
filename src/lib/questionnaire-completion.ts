import { validateQuestionnaire, type Question } from "./investor-onboarding-model";
import { questionsForInvestment } from "./fund-questionnaire-section";

/** Submission metadata is not proof that the applicable required answers exist. */
export function questionnaireCompletion(input: {
  submittedAt?: string | null;
  version?: number | null;
  questions: Question[] | null;
  answers?: Record<string, unknown> | null;
  profileType?: string | null | undefined;
  /** When the investment started; "new investors only" questions skip earlier investments. */
  startedAt?: string | null | undefined;
}) {
  const errors = input.questions
    ? validateQuestionnaire(questionsForInvestment(input.questions, input.startedAt), input.answers ?? {}, input.profileType).errors
    : [{ key: "questionnaire", message: "Questionnaire could not be loaded." }];
  return {
    complete: Boolean(input.submittedAt && input.version && input.questions && errors.length === 0),
    missingRequired: errors.length,
  };
}