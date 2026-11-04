/** Pure projection for the staff investor progress dashboard. Display only; never changes a record. */
export type SigningProgressFacts = {
  onboardingId: string;
  fundId: string;
  fundName: string | null;
  investorName: string | null;
  stage: string;
  questionnaireSubmitted: boolean;
  questionnaireAnswered: number;
  /** Required, visible questions still blank (accreditation excluded). Submitted only counts when this is 0. */
  questionnaireMissingRequired?: number;
  taxFormType: string | null;
  taxFormSigned: boolean;
  documentsPrepared: boolean;
  signaturesCompleted: number;
  fundingStatus: string | null;
  blocked: boolean;
  nextOwner: string | null;
  updatedAt: string | null;
};

export type StepState = "done" | "in_progress" | "not_started";
export type SigningProgressRow = SigningProgressFacts & {
  questionnaire: StepState;
  taxForm: StepState;
  signature: StepState;
  nextStep: string;
};

const TAX_LABEL: Record<string, string> = { w9: "W-9", w8ben: "W-8BEN", w8bene: "W-8BEN-E", w8eci: "W-8ECI", w8exp: "W-8EXP", w8imy: "W-8IMY" };
export const taxFormLabel = (t: string | null) => (t ? TAX_LABEL[t] ?? t.toUpperCase() : "Tax form");

export function signingProgressRow(f: SigningProgressFacts): SigningProgressRow {
  const questionnaire: StepState = f.questionnaireSubmitted && !(f.questionnaireMissingRequired ?? 0) ? "done" : f.questionnaireAnswered > 0 ? "in_progress" : "not_started";
  const taxForm: StepState = f.taxFormSigned ? "done" : f.taxFormType ? "in_progress" : "not_started";
  const signature: StepState = f.signaturesCompleted > 0 ? "done" : f.documentsPrepared ? "in_progress" : "not_started";
  let nextStep: string;
  if (["about_you", "verification", "invited", "started"].includes(f.stage)) nextStep = "Finish About You and Verification";
  else if (questionnaire !== "done") nextStep = questionnaire === "in_progress" ? "Investor submits the questionnaire (draft saved)" : "Investor starts the questionnaire";
  else if (taxForm !== "done") nextStep = `Investor signs the ${taxFormLabel(f.taxFormType)}`;
  else if (signature !== "done") nextStep = f.documentsPrepared ? "Investor signs the fund documents" : "Fund documents waiting to be prepared";
  else if (f.fundingStatus !== "funded") nextStep = "Waiting on approval and funding";
  else nextStep = "Signed and funded";
  if (f.blocked) nextStep = `On hold for review · ${nextStep}`;
  return { ...f, questionnaire, taxForm, signature, nextStep };
}
