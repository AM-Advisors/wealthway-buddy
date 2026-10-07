/**
 * Withholding policy engine (pilot M2). Pure: no I/O.
 *
 * Withholding is decided only by adviser-approved rules. When no approved
 * rule matches the investor's tax status and the distribution character, the
 * line is WITHHOLDING REVIEW REQUIRED: nothing is withheld automatically and
 * final approval is blocked until an authorised reviewer records a decision.
 */
export type InvestorTaxStatus = "us_person" | "foreign_person" | "backup_subject" | "undocumented";

export type PolicyRule = {
  id: string;
  ruleName: string;
  offeringId: string | null;
  investorTaxStatus: InvestorTaxStatus | "any";
  distributionCharacter: string | "any";
  withholdingType: string;
  rateBps: number;
  jurisdiction: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  documentationRequired: boolean;
  manualReviewRequired: boolean;
  status: "draft" | "approved" | "retired";
  approvedBy: string | null;
  policySource: string | null;
};

export type PolicyTaxFacts = {
  documentationForm: string | null;
  isForeignPerson: boolean | null;
  tinOnFile: boolean;
  backupWithholdingNotice?: boolean;
};

export type PolicyResult = {
  status: "determined" | "review_required";
  taxStatus: InvestorTaxStatus;
  amountCents: number;
  suggestedCents: number | null;
  rule: { id: string; name: string; rateBps: number; source: string | null; type: string } | null;
  reasons: string[];
};

export function investorTaxStatus(f: PolicyTaxFacts): InvestorTaxStatus {
  if (!f.documentationForm || f.documentationForm === "none_on_file") return "undocumented";
  if (f.isForeignPerson) return "foreign_person";
  if (f.backupWithholdingNotice || !f.tinOnFile) return "backup_subject";
  return "us_person";
}

function active(r: PolicyRule, asOf: string) {
  return r.status === "approved" && Boolean(r.approvedBy) && r.effectiveFrom <= asOf && (!r.effectiveTo || r.effectiveTo >= asOf);
}

export function evaluateWithholding(input: {
  grossCents: number;
  distributionCharacter: string;
  offeringId: string;
  facts: PolicyTaxFacts;
  rules: readonly PolicyRule[];
  asOf: string;
}): PolicyResult {
  const taxStatus = investorTaxStatus(input.facts);
  const gross = Math.max(0, Math.round(input.grossCents));
  const matches = (r: PolicyRule) =>
    active(r, input.asOf) &&
    (r.investorTaxStatus === "any" || r.investorTaxStatus === taxStatus) &&
    (r.distributionCharacter === "any" || r.distributionCharacter === input.distributionCharacter);
  // A fund-specific override, when present, replaces the default policy.
  const fundRules = input.rules.filter((r) => r.offeringId === input.offeringId && matches(r));
  const candidates = fundRules.length ? fundRules : input.rules.filter((r) => !r.offeringId && matches(r));
  // Most specific wins: exact status + exact character before wildcards.
  const score = (r: PolicyRule) => (r.investorTaxStatus === "any" ? 0 : 2) + (r.distributionCharacter === "any" ? 0 : 1);
  const rule = [...candidates].sort((a, b) => score(b) - score(a))[0];

  if (!rule) {
    return {
      status: "review_required",
      taxStatus,
      amountCents: 0,
      suggestedCents: null,
      rule: null,
      reasons: [`No approved withholding rule covers a ${taxStatus.replace("_", " ")} receiving ${input.distributionCharacter.replace(/_/g, " ")}.`],
    };
  }
  const amount = Math.min(gross, Math.round((gross * Math.max(0, rule.rateBps)) / 10000));
  const ruleOut = { id: rule.id, name: rule.ruleName, rateBps: rule.rateBps, source: rule.policySource, type: rule.withholdingType };
  const reasons: string[] = [];
  if (rule.documentationRequired && taxStatus === "undocumented") reasons.push("The rule requires tax documentation that is not on file.");
  if (rule.manualReviewRequired) reasons.push("The rule requires a reviewer's decision.");
  if (reasons.length) {
    return { status: "review_required", taxStatus, amountCents: 0, suggestedCents: amount, rule: ruleOut, reasons };
  }
  return { status: "determined", taxStatus, amountCents: amount, suggestedCents: amount, rule: ruleOut, reasons: [] };
}

/** A reviewer's decision on one review-required line. */
export function withholdingDecisionError(input: {
  amountCents: number;
  grossCents: number;
  reason: string;
  deciderUserId: string;
  preparedBy: string | null;
}): string | null {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) return "Withholding must be zero or a positive whole number of cents.";
  if (input.amountCents > input.grossCents) return "Withholding cannot exceed the gross distribution.";
  if (input.reason.trim().length < 10) return "Give a reason of at least 10 characters for the withholding decision.";
  if (input.preparedBy && input.deciderUserId === input.preparedBy) return "The preparer cannot decide withholding on their own distribution.";
  return null;
}
