/**
 * One to-do list across a fund's investors for the fund manager: uploaded
 * document copies, accreditation proofs, signed subscriptions awaiting approval
 * or countersignature, verification, and the questionnaire. Read-only: every
 * item links to its canonical review surface and grants no authority by itself.
 */
import { forbid, setupActor } from "@/lib/fund-setup.server";
import { managesExactFund } from "@/lib/fund-manager-responsibility";
import { buildInvestorTodos, type ManagerInvestorTodoInput } from "@/lib/manager-investor-todos-model";

const admin = async () => ((await import("@/integrations/supabase/client.server")).supabaseAdmin as any);

export async function managerInvestorTodos(userId: string, fundId: string) {
  const actor = await setupActor(userId);
  if (!managesExactFund(actor, fundId)) forbid("you do not manage this fund.");
  const d = await admin();
  const [{ data: obs }, { data: docsRaw }] = await Promise.all([
    d.from("investor_onboardings")
      .select("id, stage, application_id, person_id, investment_profile_id, investor_user_id, questionnaire_submitted_at")
      .eq("offering_id", fundId)
      .is("removed_at", null),
    d.from("investor_documents").select("id, onboarding_id, application_id, doc_kind").eq("offering_id", fundId).eq("review_status", "new"),
  ]);
  const rows = (obs ?? []) as any[];
  const personIds = [...new Set(rows.map((r) => r.person_id).filter(Boolean))];
  const profileIds = [...new Set(rows.map((r) => r.investment_profile_id).filter(Boolean))];
  const appIds = [...new Set(rows.map((r) => r.application_id).filter(Boolean))];
  const [{ data: people }, { data: profiles }, { data: apps }] = await Promise.all([
    personIds.length ? d.from("persons").select("id, preferred_name, legal_first_name, legal_last_name, kyc_status, aml_status").in("id", personIds) : Promise.resolve({ data: [] }),
    profileIds.length ? d.from("investment_profiles").select("id, legal_name").in("id", profileIds) : Promise.resolve({ data: [] }),
    appIds.length ? d.from("investor_applications").select("id, accreditation_status").in("id", appIds).eq("accreditation_status", "review") : Promise.resolve({ data: [] }),
  ]);
  const personMap = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));
  const profileMap = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));
  const nameOf = (r: any) => {
    const p = personMap.get(r.person_id);
    const n = p ? p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") : null;
    return (n || profileMap.get(r.investment_profile_id)?.legal_name || "Unnamed investor") as string;
  };
  const obByApplication = new Map(rows.filter((r) => r.application_id).map((r) => [r.application_id as string, r.id as string]));
  const newDocs = ((docsRaw ?? []) as any[]).map((doc) => ({
    onboardingId: (doc.onboarding_id ?? obByApplication.get(doc.application_id) ?? null) as string | null,
    docKind: doc.doc_kind as string,
  }));
  // Signature approvals and countersignatures reuse the existing manager review reader.
  const reviews = await (await import("@/lib/investor-document-review.server")).listDocumentReviews(userId, fundId);
  const signaturePending = (reviews.investors ?? [])
    .flatMap((inv: any) =>
      (inv.documents ?? []).map((doc: any) => ({
        onboardingId: inv.onboardingId as string,
        countersign: Boolean(doc.hasPendingFundSignature) && !doc.decision,
        approve: Boolean(doc.signed) && !doc.decision && !doc.hasPendingFundSignature,
      })),
    )
    .filter((x: any) => x.countersign || x.approve)
    .map((x: any) => ({ onboardingId: x.onboardingId as string, countersign: x.countersign as boolean }));
  const investors: ManagerInvestorTodoInput[] = rows.map((r) => {
    const p = personMap.get(r.person_id);
    return {
      onboardingId: r.id as string,
      investorName: nameOf(r),
      applicationId: (r.application_id ?? null) as string | null,
      started: Boolean(r.investor_user_id),
      kyc: (p?.kyc_status ?? "not_started") as string | null,
      aml: (p?.aml_status ?? "not_started") as string | null,
      questionnaireSubmitted: Boolean(r.questionnaire_submitted_at),
    };
  });
  const items = buildInvestorTodos({
    investors,
    newDocs,
    accreditationPendingApplicationIds: new Set(((apps ?? []) as any[]).map((a) => a.id as string)),
    signaturePending,
  });
  const counts: Record<string, number> = {};
  for (const it of items) counts[it.kind] = (counts[it.kind] ?? 0) + 1;
  return { items, counts };
}
