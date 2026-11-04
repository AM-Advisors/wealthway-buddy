/** Staff-only, read-only view of each open investment's questionnaire, tax form and signature status. */
import { requireOperations } from "@/lib/ops-access.functions";
import {
  signingProgressRow,
  type SigningProgressFacts,
  type SigningProgressRow,
} from "@/lib/investor-signing-progress-model";

const CLOSED = ["closed", "declined", "cancelled"];

function chunks<T>(xs: T[], n = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export async function signingProgress(context: any): Promise<{ rows: SigningProgressRow[] }> {
  const { capabilities } = await requireOperations(context);
  if (!capabilities.includes("onboarding:see" as any) && !capabilities.includes("investors:see" as any)) {
    throw new Error("Forbidden: you don't have that permission.");
  }
  const { supabaseAdmin: d } = await import("@/integrations/supabase/client.server");
  const { data: obs, error } = await (d as any)
    .from("investor_onboardings")
    .select("id, offering_id, person_id, investment_profile_id, stage, questionnaire_responses, questionnaire_submitted_at, questionnaire_version, document_template_version, funding_status, updated_at")
    .is("removed_at", null)
    .not("stage", "in", `(${CLOSED.join(",")})`)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Investor progress could not be loaded.");
  const rows = (obs ?? []) as any[];
  const ids = (k: string) => [...new Set(rows.map((r) => r[k]).filter(Boolean))] as string[];
  const read = async (table: string, cols: string, col: string, keys: string[]) => {
    const out: any[] = [];
    for (const c of chunks(keys)) {
      const { data } = await (d as any).from(table).select(cols).in(col, c);
      out.push(...((data ?? []) as any[]));
    }
    return out;
  };
  const [offerings, persons, taxForms, sigs, profiles, readiness] = await Promise.all([
    read("offerings", "id, name", "id", ids("offering_id")),
    read("persons", "id, legal_first_name, legal_last_name, preferred_name, email", "id", ids("person_id")),
    read("investor_tax_forms", "investment_profile_id, form_type, status, certified_at", "investment_profile_id", ids("investment_profile_id")),
    read("document_signatures", "investment_profile_id, signed_at", "investment_profile_id", ids("investment_profile_id")),
    read("investment_profiles", "id, profile_type", "id", ids("investment_profile_id")),
    read("onboarding_readiness_summaries", "onboarding_id, blocked, next_owner", "onboarding_id", rows.map((r) => r.id)),
  ]);
  const profileType = new Map(profiles.map((p) => [p.id, p.profile_type as string | null]));
  const { loadCompletionQuestions } = await import("@/lib/questionnaire-completion.server");
  const { questionnaireCompletion } = await import("@/lib/questionnaire-completion");
  const questions = await loadCompletionQuestions(d, ids("offering_id"));
  const fund = new Map(offerings.map((o) => [o.id, o.name as string]));
  const person = new Map(persons.map((p) => [p.id, p]));
  const ready = new Map(readiness.map((r) => [r.onboarding_id, r]));
  return {
    rows: rows.map((r) => {
      const p = person.get(r.person_id);
      const name = p ? [p.preferred_name || p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") || p.email : null;
      const tax = taxForms
        .filter((t) => t.investment_profile_id === r.investment_profile_id && t.status !== "superseded")
        .sort((a, b) => String(b.certified_at ?? "").localeCompare(String(a.certified_at ?? "")))[0];
      const facts: SigningProgressFacts = {
        onboardingId: r.id,
        fundId: r.offering_id,
        fundName: fund.get(r.offering_id) ?? null,
        investorName: name ?? null,
        stage: String(r.stage ?? ""),
        questionnaireSubmitted: Boolean(r.questionnaire_submitted_at && r.questionnaire_version),
        questionnaireMissingRequired: questionnaireCompletion({ submittedAt: r.questionnaire_submitted_at, version: r.questionnaire_version, questions: questions.get(r.offering_id) ?? null, answers: r.questionnaire_responses, profileType: profileType.get(r.investment_profile_id) }).missingRequired,
        questionnaireAnswered: Object.values((r.questionnaire_responses ?? {}) as Record<string, unknown>).filter((v) => v !== null && v !== "" && !(Array.isArray(v) && !v.length)).length,
        taxFormType: tax?.form_type ?? null,
        taxFormSigned: Boolean(tax?.certified_at),
        documentsPrepared: r.document_template_version != null,
        signaturesCompleted: sigs.filter((s) => s.investment_profile_id === r.investment_profile_id && s.signed_at).length,
        fundingStatus: r.funding_status ?? null,
        blocked: Boolean(ready.get(r.id)?.blocked),
        nextOwner: ready.get(r.id)?.next_owner ?? null,
        updatedAt: r.updated_at ?? null,
      };
      return signingProgressRow(facts);
    }),
  };
}
