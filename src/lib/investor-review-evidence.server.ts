import standardQuestions from "./standard-investor-questionnaire.json";
import { SENSITIVE_TITLE } from "./didit-questionnaire";
import { questionVisible, type Question } from "./investor-onboarding-model";
import { submittedSignedDocuments } from "./investor-signed-documents.server";

/** Private manager evidence, independent of general client fund-view access. */
export async function investorReviewEvidence(db: any, userId: string, fundId: string, onboardingId: string) {
  const [roles, managers] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("fund_managers").select("id").eq("user_id", userId).eq("offering_id", fundId),
  ]);
  if (roles.error || managers.error) throw new Error("Investor review access could not be checked.");
  const staff = (roles.data ?? []).some((r: any) => ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"].includes(r.role));
  if (!staff && !managers.data?.length) return null;
  const { data: row, error } = await db.from("investor_onboardings")
    .select("id, offering_id, application_id, executed_snapshot, questionnaire_version, questionnaire_submitted_at, questionnaire_responses, removed_at")
    .eq("id", onboardingId).eq("offering_id", fundId).maybeSingle();
  if (error) throw new Error("Investor review evidence could not be loaded.");
  if (!row || row.removed_at) throw new Error("That investor is not available in this fund.");
  const [signedDocuments, ackResult, questionResult] = await Promise.all([
    row.executed_snapshot && row.application_id ? submittedSignedDocuments(db, row.application_id) : Promise.resolve([]),
    db.from("investment_document_acknowledgments").select("id, offering_document_id, version, acknowledged_at").eq("onboarding_id", onboardingId),
    row.questionnaire_version ? db.from("offering_questionnaires").select("questions").eq("offering_id", fundId).eq("version", row.questionnaire_version) : Promise.resolve({ data: [], error: null }),
  ]);
  if (ackResult.error || questionResult.error) throw new Error("Investor questionnaire and acknowledgments could not be loaded.");
  const ids = (ackResult.data ?? []).map((a: any) => a.offering_document_id);
  const documentResult = ids.length ? await db.from("offering_documents").select("id, title").in("id", ids) : { data: [], error: null };
  if (documentResult.error) throw new Error("Acknowledged document names could not be loaded.");
  const questions = (questionResult.data?.[0]?.questions ?? standardQuestions) as Question[];
  const answers = (row.questionnaire_responses ?? {}) as Record<string, unknown>;
  const questionnaire = row.questionnaire_submitted_at ? questions
    .filter((q) => questionVisible(q, answers) && !SENSITIVE_TITLE.test(`${q.key} ${q.label}`))
    .map((q) => ({ key: q.key, label: q.label, answer: displayAnswer(answers[q.key]) })) : [];
  return {
    signedDocuments,
    acknowledgments: (ackResult.data ?? []).map((a: any) => ({ id: a.id as string, title: documentResult.data?.find((d: any) => d.id === a.offering_document_id)?.title ?? "Fund document", version: a.version as number, acknowledgedAt: a.acknowledged_at as string })),
    questionnaire,
    questionnaireSubmittedAt: row.questionnaire_submitted_at as string | null,
  };
}

function displayAnswer(value: unknown): string {
  if (value == null || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.filter((v) => ["string", "number", "boolean"].includes(typeof v)).join(", ");
  return ["string", "number"].includes(typeof value) ? String(value) : "Not provided";
}

export async function managerInvestorSignedCopy(db: any, userId: string, input: { fundId: string; onboardingId: string; signatureId: string }) {
  const evidence = await investorReviewEvidence(db, userId, input.fundId, input.onboardingId);
  if (!evidence?.signedDocuments.some((d) => d.id === input.signatureId && d.hasCopy)) throw new Error("That signed copy is not available for this investment.");
  const { data, error } = await db.from("document_signatures").select("pdf_path").eq("id", input.signatureId).maybeSingle();
  if (error || !data?.pdf_path) throw new Error("The signed copy could not be loaded.");
  const result = await db.storage.from("signed-documents").createSignedUrl(data.pdf_path, 300, { download: true });
  if (result.error || !result.data?.signedUrl) throw new Error("The signed copy could not be opened.");
  return { url: result.data.signedUrl as string };
}