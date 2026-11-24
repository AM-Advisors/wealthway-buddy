import { describe, expect, it } from "vitest";
import { signingProgressRow, type SigningProgressFacts } from "./investor-signing-progress-model";

const base: SigningProgressFacts = { onboardingId: "o", fundId: "f", fundName: "Erebor", investorName: "Chris", stage: "signature", questionnaireSubmitted: false, questionnaireAnswered: 0, taxFormType: null, taxFormSigned: false, documentsPrepared: false, signaturesCompleted: 0, fundingStatus: "not_funded", blocked: false, nextOwner: "investor", updatedAt: null };

describe("investor progress dashboard", () => {
  it("an unsubmitted questionnaire is the blocker on Sign", () => {
    expect(signingProgressRow(base).nextStep).toBe("Investor starts the questionnaire");
    expect(signingProgressRow({ ...base, questionnaireAnswered: 3 }).questionnaire).toBe("in_progress");
  });
  it("after the questionnaire, the tax form is next", () => {
    expect(signingProgressRow({ ...base, questionnaireSubmitted: true, taxFormType: "w9" }).nextStep).toBe("Investor signs the W-9");
  });
  it("after the tax form, the fund documents are next", () => {
    const r = signingProgressRow({ ...base, questionnaireSubmitted: true, taxFormType: "w9", taxFormSigned: true, documentsPrepared: true });
    expect(r.taxForm).toBe("done");
    expect(r.nextStep).toBe("Investor signs the fund documents");
  });
  it("held investments say so", () => {
    expect(signingProgressRow({ ...base, blocked: true }).nextStep).toMatch(/^On hold for review/);
  });
  it("a submitted questionnaire with required blanks is not complete", () => {
    const r = signingProgressRow({ ...base, questionnaireSubmitted: true, questionnaireAnswered: 1, questionnaireMissingRequired: 24, taxFormType: "w9" });
    expect(r.questionnaire).toBe("in_progress");
    expect(r.nextStep).toBe("Investor submits the questionnaire (draft saved)");
  });
});

import { checkState as _cs, signingProgressRow as _row } from "./investor-signing-progress-model";
describe("KYC and AML columns", () => {
  const base = { onboardingId: "o", fundId: "f", fundName: null, investorName: null, stage: "sign", questionnaireSubmitted: false, questionnaireAnswered: 0, taxFormType: null, taxFormSigned: false, documentsPrepared: false, signaturesCompleted: 0, fundingStatus: null, blocked: false, nextOwner: null, updatedAt: null };
  it("maps complete to done and review to in progress", () => {
    expect(_cs("complete")).toBe("done");
    expect(_cs("under_review")).toBe("in_progress");
    expect(_cs("needs_harmonious")).toBe("not_started");
  });
  it("hides entity check when not applicable", () => {
    const r = _row({ ...base, checks: { kyc: "complete", kyb: "not_applicable", aml: "under_review" } });
    expect([r.kyc, r.kyb, r.aml]).toEqual(["done", null, "in_progress"]);
  });
});
