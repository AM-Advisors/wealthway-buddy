/**
 * Pure projection for the fund manager's cross-investor to-do list. No database,
 * no authorization: the reader in manager-investor-todos.server.ts supplies
 * recorded states, and every item links to a canonical review surface without
 * granting authority by itself.
 */
import { identityScreeningSummary } from "@/lib/verification-status";
import { MANAGER_REVIEW_KINDS } from "@/lib/investor-upload-review.server";

export const KIND_LABELS: Record<string, string> = {
  entity_formation: "entity formation document",
  operating_agreement: "operating agreement",
  trust_agreement: "trust agreement",
  ownership_list: "ownership list",
  tax_form: "tax form copy",
  other: "document",
  accreditation_proof: "accreditation proof",
};

export type ManagerTodoKind = "accreditation" | "document_copy" | "signature" | "countersign" | "verification" | "questionnaire";
export type ManagerInvestorTodo = {
  onboardingId: string;
  investorName: string;
  kind: ManagerTodoKind;
  label: string;
  detail: string | null;
};
export type ManagerInvestorTodoInput = {
  onboardingId: string;
  investorName: string;
  applicationId: string | null;
  started: boolean;
  kyc: string | null;
  aml: string | null;
  questionnaireSubmitted: boolean;
};

const KIND_ORDER: ManagerTodoKind[] = ["accreditation", "document_copy", "signature", "countersign", "verification", "questionnaire"];

/** Pure: turns recorded states into one list of manager to-dos. */
export function buildInvestorTodos(args: {
  investors: ManagerInvestorTodoInput[];
  newDocs: { onboardingId: string | null; docKind: string }[];
  accreditationPendingApplicationIds: Set<string>;
  signaturePending: { onboardingId: string; countersign: boolean }[];
}): ManagerInvestorTodo[] {
  const docsByOnboarding = new Map<string, string[]>();
  for (const d of args.newDocs) {
    if (!d.onboardingId) continue;
    const list = docsByOnboarding.get(d.onboardingId) ?? [];
    if (!list.includes(d.docKind)) list.push(d.docKind);
    docsByOnboarding.set(d.onboardingId, list);
  }
  const countersign = new Set(args.signaturePending.filter((s) => s.countersign).map((s) => s.onboardingId));
  const approve = new Set(args.signaturePending.filter((s) => !s.countersign).map((s) => s.onboardingId));
  const items: ManagerInvestorTodo[] = [];
  for (const inv of args.investors) {
    const push = (kind: ManagerTodoKind, label: string, detail: string | null = null) =>
      items.push({ onboardingId: inv.onboardingId, investorName: inv.investorName, kind, label, detail });
    for (const kind of docsByOnboarding.get(inv.onboardingId) ?? []) {
      if (kind === "accreditation_proof") push("accreditation", "Review accreditation proof");
      else if ((MANAGER_REVIEW_KINDS as readonly string[]).includes(kind)) push("document_copy", `Review uploaded ${KIND_LABELS[kind] ?? "document"}`);
    }
    if (inv.applicationId && args.accreditationPendingApplicationIds.has(inv.applicationId)) push("accreditation", "Review accreditation");
    if (countersign.has(inv.onboardingId)) push("countersign", "Countersign the signed subscription");
    else if (approve.has(inv.onboardingId)) push("signature", "Approve the signed subscription");
    if (inv.started) {
      const v = identityScreeningSummary(inv.kyc, inv.aml);
      if (!v.ok) push("verification", v.label);
      if (!inv.questionnaireSubmitted) push("questionnaire", "Investor questionnaire not submitted yet");
    }
  }
  return items.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.investorName.localeCompare(b.investorName),
  );
}
