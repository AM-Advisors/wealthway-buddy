/** Where each readiness item's completing action lives. Presentation routing only; every action keeps its own server-side authorization. */
export type OpenTarget =
  | { kind: "tab"; tab: "overview" | "details" | "documents" }
  | { kind: "action"; action: "send_tax_form" | "prepare_documents" }
  | { kind: "fund"; area: "approvals" | "banking" }
  | { kind: "ops_onboarding" };

export function openTargetFor(key: string): OpenTarget {
  switch (key) {
    case "aml": case "identity_verification": case "entity_verification": case "close_amount":
    case "account": case "investment_profile": case "investment_amount": case "beneficial_owners": case "eligibility":
      return { kind: "tab", tab: "details" };
    // A copy is never certification: the completing step is the investor signing their tax form in Sign.
    case "tax_documentation": case "tax_classification": return { kind: "action", action: "send_tax_form" };
    case "subscription_documents": return { kind: "action", action: "prepare_documents" };
    case "accreditation": return { kind: "fund", area: "approvals" };
    case "funding": return { kind: "fund", area: "banking" };
    case "approved_to_fund": return { kind: "tab", tab: "overview" };
    case "acceptance": case "exceptions": return { kind: "ops_onboarding" };
    default: return { kind: "tab", tab: "documents" };
  }
}

export function openLabelFor(key: string, owner: string | null | undefined): string {
  const t = openTargetFor(key);
  if (key === "aml") return "Open screening review";
  if (t.kind === "action") return t.action === "send_tax_form" ? "Send tax form to sign" : "Prepare documents";
  if (t.kind === "fund") return t.area === "approvals" ? "Review accreditation" : "Match wire in Banking";
  if (t.kind === "ops_onboarding") return key === "acceptance" ? "Accept subscription" : "Resolve exception";
  if (key === "approved_to_fund") return "Approve to send funds";
  return owner === "investor" ? "View details" : "Review";
}
