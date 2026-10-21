/** Ordered Review & Sign tasks for one investment. Display only; the server still enforces every rule. */
export type SignTaskKey =
  | "subscription_questionnaire" | "accreditation" | "bsa_aml" | "tax_documentation"
  | "certifications" | "fees" | "subscription_documents" | "submit";
export type SignTaskState = "complete" | "todo" | "review" | "locked";
export type SignTask = { key: SignTaskKey; label: string; state: SignTaskState; detail?: string };

type Req = { key: string; state: string };
type Doc = { signed?: boolean; requiresSignature?: boolean; requiresAcknowledgment?: boolean; acknowledged?: boolean };

const LABELS: Record<SignTaskKey, string> = {
  subscription_questionnaire: "Investor questionnaire",
  accreditation: "Accreditation",
  bsa_aml: "Financial background",
  tax_documentation: "IRS tax form",
  certifications: "Review & certify",
  fees: "Fund fees",
  subscription_documents: "Subscription documents",
  submit: "Submit subscription",
};

function fromReq(state: string | undefined): SignTaskState | null {
  if (!state || state === "not_applicable") return null;
  if (state === "valid") return "complete";
  if (state === "review_required") return "review";
  return "todo";
}

export function docComplete(d: Doc) {
  return !!d.signed || (!!d.requiresAcknowledgment && !!d.acknowledged) || (!d.requiresSignature && !d.requiresAcknowledgment);
}

export function buildSignTasks(input: {
  requirements: Req[];
  hasQuestionnaire: boolean;
  documents: Doc[];
  feesRequired: boolean;
  feesAccepted: boolean;
  submitted: boolean;
}): SignTask[] {
  const req = (k: string) => input.requirements.find((r) => r.key === k)?.state;
  const tasks: SignTask[] = [];
  const add = (key: SignTaskKey, state: SignTaskState | null, detail?: string) => {
    if (state) tasks.push({ key, label: LABELS[key], state, detail });
  };
  const signed = req("signature") === "valid" || input.submitted;
  const done = (s: SignTaskState | null) => s === null || s === "complete";

  const q = input.hasQuestionnaire ? (fromReq(req("subscription_questionnaire")) ?? "complete") : null;
  add("subscription_questionnaire", q);
  add("accreditation", fromReq(req("accreditation")));
  add("bsa_aml", fromReq(req("bsa_aml")));
  const tax = signed ? (req("tax_documentation") ? "complete" : null) : fromReq(req("tax_documentation"));
  add("tax_documentation", tax === "todo" && !done(q) ? "locked" : tax, tax === "todo" && !done(q) ? "Finish the questionnaire first" : undefined);
  add("certifications", fromReq(req("certifications")));
  if (input.feesRequired) add("fees", input.feesAccepted ? "complete" : "todo");

  const left = input.documents.filter((d) => !docComplete(d)).length;
  const docsUnlocked = done(q) && done(tax) && (!input.feesRequired || input.feesAccepted);
  const docState: SignTaskState = signed || (input.documents.length > 0 && left === 0)
    ? "complete" : docsUnlocked ? "todo" : "locked";
  add("subscription_documents", docState,
    docState === "locked" ? "Finish the tasks above first" : docState === "todo" ? (input.documents.length ? `${left} left` : "Being prepared") : undefined);

  const outstanding = tasks.filter((t) => t.state !== "complete");
  add("submit", input.submitted ? "complete" : outstanding.length ? "locked" : "todo",
    !input.submitted && outstanding.length ? `Finish ${outstanding.length} above` : undefined);
  return tasks;
}

/** Match a server "X must be completed first." message to the task to open. */
export function taskForError(message: string, tasks: SignTask[]): SignTaskKey | null {
  const m = /^(.+?) must be completed first/i.exec(message.trim());
  if (!m) return null;
  const label = m[1]!.toLowerCase();
  const alias: Record<string, SignTaskKey> = {
    "review & certify": "certifications", "financial background": "bsa_aml", "tax form": "tax_documentation",
    "accreditation": "accreditation", "subscription information": "subscription_questionnaire",
  };
  const key = alias[label];
  return key && tasks.some((t) => t.key === key) ? key : null;
}
