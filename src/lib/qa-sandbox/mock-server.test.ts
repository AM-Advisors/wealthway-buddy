import { describe, expect, it } from "vitest";
import { createQaState, handleQaServerCall, QaBlockedError } from "./mock-server";
import { QA_BANK_PREFILL, QA_FUND_ID } from "./fictional-data";

const newInvestor = {
  offeringId: QA_FUND_ID,
  personId: null,
  profileId: null,
  confirmedNew: false,
  person: { firstName: "Taylor", lastName: "Reyes", email: "taylor.reyes@example.com" },
  profile: { type: "individual" },
  investment: { amountCents: 2500000 },
};

describe("QA sandbox mock server", () => {
  it("searches fictional people by email and masks the result", () => {
    const state = createQaState();
    const r = handleQaServerCall("searchInvestorsFn", { email: "casey.alden@example.com" }, state) as any;
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].strength).toBe("email");
    expect(r.matches[0].maskedEmail).not.toContain("casey.alden@example.com");
    expect(r.matches[0].alreadyInFund).toBe(true);
  });

  it("creates a fictional investor and returns a fictional onboarding id", () => {
    const state = createQaState();
    const r = handleQaServerCall("createInvestorFn", newInvestor, state) as any;
    expect(r.onboardingId).toMatch(/^qa-onboarding-/);
    expect(r.emailSent).toBe(true);
    expect(state.createdInvestors).toHaveLength(1);
    expect(state.createdInvestors[0]!.name).toBe("Taylor Reyes");
  });

  it("rejects an invalid new investor with a validation message", () => {
    const state = createQaState();
    expect(() =>
      handleQaServerCall("createInvestorFn", { ...newInvestor, person: { firstName: "", lastName: "", email: "nope" } }, state),
    ).toThrow(/first and last name|valid email/);
  });

  it("blocks creating a new person when an exact email match exists and was not confirmed", () => {
    const state = createQaState();
    handleQaServerCall("searchInvestorsFn", { email: "casey.alden@example.com" }, state);
    expect(() =>
      handleQaServerCall("createInvestorFn", { ...newInvestor, person: { firstName: "Casey", lastName: "Alden", email: "casey.alden@example.com" } }, state),
    ).toThrow(/already exists/);
  });

  it("lets staff save wire instructions and masks nothing from managers", () => {
    const state = createQaState("staff");
    handleQaServerCall("saveManagedWireInstructions", { offering_id: QA_FUND_ID, ...QA_BANK_PREFILL }, state);
    const listed = handleQaServerCall("listManagedWireInstructions", {}, state) as any;
    expect(listed.isAdmin).toBe(true);
    expect(listed.funds[0].wire_instructions.bank_name).toBe("First Fictional Bank");
  });

  it("denies wire saves to the fund manager role", () => {
    const state = createQaState("manager");
    expect(() => handleQaServerCall("saveManagedWireInstructions", { offering_id: QA_FUND_ID, ...QA_BANK_PREFILL }, state)).toThrow(/Harmonious/);
    const listed = handleQaServerCall("listManagedWireInstructions", {}, state) as any;
    expect(listed.isAdmin).toBe(false);
  });

  it("requires a 9 digit routing number", () => {
    const state = createQaState("staff");
    expect(() =>
      handleQaServerCall("saveManagedWireInstructions", { offering_id: QA_FUND_ID, ...QA_BANK_PREFILL, routing_number: "123" }, state),
    ).toThrow(/9 digits/);
  });

  it("blocks any server function the sandbox does not model", () => {
    const state = createQaState();
    expect(() => handleQaServerCall("someRealServerFunction", {}, state)).toThrow(QaBlockedError);
  });
});
