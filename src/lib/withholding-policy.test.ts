import { describe, expect, it } from "vitest";
import { evaluateWithholding, investorTaxStatus, withholdingDecisionError, type PolicyRule } from "@/lib/withholding-policy";

const base: PolicyRule = {
  id: "r1", ruleName: "Backup on income", offeringId: null, investorTaxStatus: "backup_subject",
  distributionCharacter: "income", withholdingType: "backup", rateBps: 2400, jurisdiction: "US",
  effectiveFrom: "2026-01-01", effectiveTo: null, documentationRequired: false, manualReviewRequired: false,
  status: "approved", approvedBy: "adviser", policySource: "Adviser memo",
};
const w9 = { documentationForm: "w9", isForeignPerson: false, tinOnFile: true };
const ev = (o: Partial<Parameters<typeof evaluateWithholding>[0]>) =>
  evaluateWithholding({ grossCents: 100_000_00, distributionCharacter: "return_of_capital", offeringId: "f1", facts: w9, rules: [], asOf: "2026-08-25", ...o });

describe("withholding policy (pilot M2)", () => {
  it("never withholds automatically when no approved rule exists", () => {
    const r = ev({ facts: { documentationForm: null, isForeignPerson: null, tinOnFile: false } });
    expect(r.status).toBe("review_required");
    expect(r.amountCents).toBe(0);
  });
  it("does not apply 24% backup to return of capital without a rule for that character", () => {
    const r = ev({ facts: { documentationForm: "w9", isForeignPerson: false, tinOnFile: false }, rules: [base] });
    expect(r.status).toBe("review_required");
    expect(r.amountCents).toBe(0);
  });
  it("applies an approved rule that matches status and character", () => {
    const r = ev({ distributionCharacter: "income", facts: { documentationForm: "w9", isForeignPerson: false, tinOnFile: false }, rules: [base] });
    expect(r.status).toBe("determined");
    expect(r.amountCents).toBe(24_000_00);
  });
  it("ignores draft, unapproved and expired rules", () => {
    const facts = { documentationForm: "w9", isForeignPerson: false, tinOnFile: false };
    expect(ev({ distributionCharacter: "income", facts, rules: [{ ...base, status: "draft" }] }).status).toBe("review_required");
    expect(ev({ distributionCharacter: "income", facts, rules: [{ ...base, approvedBy: null }] }).status).toBe("review_required");
    expect(ev({ distributionCharacter: "income", facts, rules: [{ ...base, effectiveTo: "2026-06-30" }] }).status).toBe("review_required");
  });
  it("prefers a fund override over the default policy", () => {
    const zero = { ...base, id: "r2", offeringId: "f1", rateBps: 0, ruleName: "Fund override" };
    const r = ev({ distributionCharacter: "income", facts: { documentationForm: "w9", isForeignPerson: false, tinOnFile: false }, rules: [base, zero] });
    expect(r.rule?.id).toBe("r2");
    expect(r.amountCents).toBe(0);
  });
  it("routes a manual-review rule to review with a suggestion", () => {
    const r = ev({ distributionCharacter: "income", facts: { documentationForm: "w9", isForeignPerson: false, tinOnFile: false }, rules: [{ ...base, manualReviewRequired: true }] });
    expect(r.status).toBe("review_required");
    expect(r.suggestedCents).toBe(24_000_00);
  });
  it("classifies tax status from documentation", () => {
    expect(investorTaxStatus(w9)).toBe("us_person");
    expect(investorTaxStatus({ documentationForm: "w8ben", isForeignPerson: true, tinOnFile: true })).toBe("foreign_person");
    expect(investorTaxStatus({ documentationForm: null, isForeignPerson: null, tinOnFile: false })).toBe("undocumented");
  });
  it("requires a reasoned, independent reviewer decision", () => {
    expect(withholdingDecisionError({ amountCents: 0, grossCents: 10, reason: "short", deciderUserId: "a", preparedBy: null })).toMatch(/reason/);
    expect(withholdingDecisionError({ amountCents: 0, grossCents: 10, reason: "Return of capital per adviser", deciderUserId: "a", preparedBy: "a" })).toMatch(/preparer/);
    expect(withholdingDecisionError({ amountCents: 11, grossCents: 10, reason: "Return of capital per adviser", deciderUserId: "a", preparedBy: "b" })).toMatch(/exceed/);
    expect(withholdingDecisionError({ amountCents: 0, grossCents: 10, reason: "Return of capital per adviser", deciderUserId: "a", preparedBy: "b" })).toBeNull();
  });
});
