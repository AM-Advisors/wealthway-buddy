import { describe, expect, it } from "vitest";
import { accreditationStepDone, basisFromAnswer, selfCertificationAllowed } from "@/lib/accreditation-step";

describe("accreditation step", () => {
  it("maps net worth and income answers", () => {
    expect(basisFromAnswer("Net worth over $1 million, excluding primary residence")).toBe("net_worth");
    expect(basisFromAnswer("Income over $200,000 (individually)")).toBe("income");
  });
  it("maps license holders and entities", () => {
    expect(basisFromAnswer("Investment professionals in good standing holding ... (Series 7)")).toBe("professional_certification");
    expect(basisFromAnswer("Entities owning investments in excess of $5 million")).toBe("entity_assets");
  });
  it("has no basis without an answer", () => expect(basisFromAnswer("")).toBeNull());
  it("refuses self-certification on verified-accreditation funds", () => {
    expect(selfCertificationAllowed("506c")).toBe(false);
    expect(selfCertificationAllowed("506b")).toBe(true);
  });
  it("skips the step when accreditation is already verified", () => {
    expect(accreditationStepDone("valid")).toBe(true);
    expect(accreditationStepDone("missing")).toBe(false);
  });
});

import { accreditationOutcome, evidenceForBasis, isAccreditationQuestion, ACCREDITATION_QUESTION_KEY } from "@/lib/accreditation-step";
describe("who checks accreditation", () => {
  it("506(b) needs no reviewer", () => expect(accreditationOutcome("506b")).toBe("approved"));
  it("506(c) waits for the fund manager or Harmonious", () => expect(accreditationOutcome("506c")).toBe("review"));
});

describe("evidence required for each answer", () => {
  it("income answers need income documents and allow a professional letter", () => {
    expect(evidenceForBasis("income").map((o) => o.method)).toEqual(["income_documents", "third_party_letter"]);
  });
  it("net worth answers need statements and allow a professional letter", () => {
    expect(evidenceForBasis("net_worth").map((o) => o.method)).toEqual(["net_worth_documents", "third_party_letter"]);
  });
  it("license holders need their license record", () => {
    expect(evidenceForBasis("professional_certification").map((o) => o.method)).toEqual(["professional_license", "third_party_letter"]);
  });
  it("entities need entity documents", () => {
    expect(evidenceForBasis("entity_assets").map((o) => o.method)).toEqual(["entity_documents", "third_party_letter"]);
  });
  it("knowledgeable employees can use a professional letter", () => {
    expect(evidenceForBasis("knowledgeable_employee").map((o) => o.method)).toEqual(["third_party_letter"]);
  });
  it("no answer shows only the professional letter path", () => {
    expect(evidenceForBasis(null).map((o) => o.method)).toEqual(["third_party_letter"]);
  });
  it("identifies the accreditation question key", () => {
    expect(isAccreditationQuestion(ACCREDITATION_QUESTION_KEY)).toBe(true);
    expect(isAccreditationQuestion("email")).toBe(false);
  });
});
