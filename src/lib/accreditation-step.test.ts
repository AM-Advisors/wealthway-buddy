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

import { accreditationOutcome } from "@/lib/accreditation-step";
describe("who checks accreditation", () => {
  it("506(b) needs no reviewer", () => expect(accreditationOutcome("506b")).toBe("approved"));
  it("506(c) waits for the fund manager or Harmonious", () => expect(accreditationOutcome("506c")).toBe("review"));
});
