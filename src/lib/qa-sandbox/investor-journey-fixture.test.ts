import { describe, expect, it } from "vitest";
import { createQaJourney, handleQaJourneyCall, qaJourneyDetail, QA_JOURNEY_ID } from "./investor-journey-fixture";
import { QA_FUND_ID } from "./fictional-data";

const call = (j: ReturnType<typeof createQaJourney>, fn: string, data: any = {}) => handleQaJourneyCall(fn, { onboardingId: QA_JOURNEY_ID, ...data }, j);
const step = (j: ReturnType<typeof createQaJourney>, key: string) => qaJourneyDetail(j).journey.find((s) => s.key === key)?.state;

describe("fictional investor journey", () => {
  it("refuses any investment other than the fictional one", () => {
    expect(() => handleQaJourneyCall("onboardingDetailFn", { onboardingId: "real-investment" }, createQaJourney())).toThrow(/fictional investment/);
  });

  it("keeps Sign locked until identity and accreditation are both confirmed", () => {
    const j = createQaJourney();
    call(j, "chooseProfileFn", { create: { legalName: "John Smith", profileType: "individual" } });
    call(j, "setInvestmentAmountFn", { amountCents: 25_000_000 });
    expect(step(j, "sign")).toBe("locked");
    j.identity = "valid";
    expect(step(j, "sign")).toBe("locked");
    handleQaJourneyCall("submitSelfCertification", { attested_signature: "John Smith" }, j);
    expect(step(j, "sign")).toBe("action_required");
  });

  it("opens Fund only after submission and the fictional manager approval", () => {
    const j = createQaJourney();
    call(j, "chooseProfileFn", { create: { legalName: "John Smith" } });
    j.identity = "valid"; j.accreditation = "valid";
    handleQaJourneyCall("saveSubscription", { commitment_cents: 25_000_000, offering_id: QA_FUND_ID }, j);
    expect(() => call(j, "recordSubscriptionSignatureFn", { signerName: "John Smith" })).toThrow(/Sign every document/);
    handleQaJourneyCall("signDocument", { offering_document_id: "qa-doc-subscription" }, j);
    const last = handleQaJourneyCall("signDocument", { offering_document_id: "qa-doc-operating" }, j) as { allSigned: boolean };
    expect(last.allSigned).toBe(true);
    call(j, "recordSubscriptionSignatureFn", { signerName: "John Smith" });
    expect(step(j, "fund")).toBe("locked");
    j.approvedToFund = true;
    expect(step(j, "fund")).toBe("action_required");
    j.received = true;
    expect(step(j, "fund")).toBe("complete");
  });
});
