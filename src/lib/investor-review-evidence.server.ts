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
    .select("id, offering_id, application_id, investment_profile_id, executed_snapshot, questionnaire_version, questionnaire_submitted_at, questionnaire_responses, removed_at")
    .eq("id", onboardingId).eq("offering_id", fundId).maybeSingle();
  if (error) throw new Error("Investor review evidence could not be loaded.");
  if (!row || row.removed_at) throw new Error("That investor is not available in this fund.");
  const [signedDocuments, ackResult, questionResult, taxResult] = await Promise.all([
    row.executed_snapshot && row.application_id ? submittedSignedDocuments(db, row.application_id) : Promise.resolve([]),
    db.from("investment_document_acknowledgments").select("id, offering_document_id, version, acknowledged_at").eq("onboarding_id", onboardingId),
    row.questionnaire_version ? db.from("offering_questionnaires").select("questions").eq("offering_id", fundId).eq("version", row.questionnaire_version) : Promise.resolve({ data: [], error: null }),
    row.investment_profile_id
      ? db.from("investor_tax_forms").select("id, form_type, certified_at, expires_on, document_path")
        .eq("investment_profile_id", row.investment_profile_id).eq("status", "certified").is("superseded_by", null)
        .order("certified_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (taxResult.error) throw new Error("Signed tax forms could not be loaded.");
  if (ackResult.error || questionResult.error) throw new Error("Investor questionnaire and acknowledgments could not be loaded.");
  const ids = (ackResult.data ?? []).map((a: any) => a.offering_document_id);
  const documentResult = ids.length ? await db.from("offering_documents").select("id, title").in("id", ids) : { data: [], error: null };
  if (documentResult.error) throw new Error("Acknowledged document names could not be loaded.");
  const questions = (questionResult.data?.[0]?.questions ?? standardQuestions) as Question[];
  const answers = (row.questionnaire_responses ?? {}) as Record<string, unknown>;
  const questionnaire = row.questionnaire_submitted_at ? questions
    .filter((q) => questionVisible(q, answers) && !SENSITIVE_TITLE.test(`${q.key} ${q.label}`))
    .map((q) => ({ key: q.key, label: q.label, answer: displayAnswer(answers[q.key]) })) : [];
  const accreditation = await loadAccreditation(db, row.application_id);
  return {
    signedDocuments,
    acknowledgments: (ackResult.data ?? []).map((a: any) => ({ id: a.id as string, title: documentResult.data?.find((d: any) => d.id === a.offering_document_id)?.title ?? "Fund document", version: a.version as number, acknowledgedAt: a.acknowledged_at as string })),
    questionnaire,
    questionnaireSubmittedAt: row.questionnaire_submitted_at as string | null,
    taxForms: currentTaxForms(taxResult.data ?? []),
    accreditation,
  };
}

const ACCREDITATION_STATUS: Record<string, string> = { approved: "Verified", pending: "Awaiting review", in_review: "Awaiting review", rejected: "Sent back", not_started: "Not started", expired: "Expired" };

async function loadAccreditation(db: any, applicationId: string | null) {
  if (!applicationId) return null;
  const [rec, docs] = await Promise.all([
    db.from("accreditation_records").select("reg_type, method, status, attested_at, verified_at, expires_at, pre_existing_relationship, questionnaire").eq("application_id", applicationId).maybeSingle(),
    db.from("accreditation_documents").select("id, doc_kind, file_name, uploaded_at").eq("application_id", applicationId),
  ]);
  if (rec.error || docs.error) throw new Error("Accreditation could not be loaded.");
  const r = rec.data;
  if (!r) return null;
  const q = (r.questionnaire ?? {}) as Record<string, unknown>;
  const relationship = [q["relationship_type"], q["relationship_duration"]].filter((v) => typeof v === "string" && v).join(" · ") || r.pre_existing_relationship || null;
  return {
    regType: r.reg_type as string,
    basis: typeof r.method === "string" ? r.method.replace(/_/g, " ") : null,
    status: ACCREDITATION_STATUS[r.status] ?? String(r.status).replace(/_/g, " "),
    attestedAt: r.attested_at as string | null,
    verifiedAt: r.verified_at as string | null,
    expiresAt: r.expires_at as string | null,
    relationship: relationship as string | null,
    documents: (docs.data ?? []).map((d: any) => ({ id: d.id as string, name: d.file_name as string, kind: String(d.doc_kind).replace(/_/g, " "), uploadedAt: d.uploaded_at as string })),
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
const TAX_FORM_LABEL: Record<string, string> = { w9: "W-9", w8ben: "W-8BEN", w8bene: "W-8BEN-E", w8eci: "W-8ECI", w8imy: "W-8IMY", w8exp: "W-8EXP" };

/** Latest certified, unexpired form per type; never exposes the storage path or tax ID. */
export function currentTaxForms(rows: any[], today = new Date().toISOString().slice(0, 10)) {
  const seen = new Set<string>();
  const out: { id: string; label: string; certifiedAt: string | null; hasCopy: boolean }[] = [];
  for (const r of rows) {
    if (r.expires_on && r.expires_on < today) continue;
    if (seen.has(r.form_type)) continue;
    seen.add(r.form_type);
    out.push({ id: r.id, label: TAX_FORM_LABEL[r.form_type] ?? String(r.form_type).toUpperCase(), certifiedAt: r.certified_at ?? null, hasCopy: !!r.document_path });
  }
  return out;
}

/** Signed W-9/W-8 for this exact investment; same manager/staff check, logged as tax-evidence access. */
export async function managerInvestorTaxForm(db: any, userId: string, input: { fundId: string; onboardingId: string; taxFormId: string }) {
  const evidence = await investorReviewEvidence(db, userId, input.fundId, input.onboardingId);
  if (!evidence?.taxForms.some((f) => f.id === input.taxFormId && f.hasCopy)) throw new Error("That tax form is not available for this investment.");
  const { data, error } = await db.from("investor_tax_forms").select("id, investment_profile_id, document_path").eq("id", input.taxFormId).maybeSingle();
  if (error || !data?.document_path) throw new Error("The signed tax form could not be loaded.");
  const logged = await db.from("tax_evidence_access_events").insert({
    actor_user_id: userId, tax_form_id: data.id, investment_profile_id: data.investment_profile_id,
    access_kind: "document", purpose: "Fund manager investor review", actor_role: "fund_manager",
  });
  if (logged.error) throw new Error("The signed tax form could not be opened.");
  const result = await db.storage.from("tax-forms").createSignedUrl(data.document_path, 300, { download: true });
  if (result.error || !result.data?.signedUrl) throw new Error("The signed tax form could not be opened.");
  return { url: result.data.signedUrl as string };
}
