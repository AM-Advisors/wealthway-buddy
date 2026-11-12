import { describe, expect, it } from "vitest";
import {
  REVIEW_STATE_LABEL, foundationDocumentState, fromFoundationChecklist, fromFoundationRequirement, fromFundSetupSection,
  personPickState, requirementBadge, reviewState, taskStatusLabel,
} from "@/lib/admin-review-framework";
import { createQaFundSubmissions, handleQaFundSubmissionCall, QA_SUBMISSION_FUND } from "@/lib/qa-sandbox/fund-submission-fixture";

const label = (engine: Parameters<typeof reviewState>[0], status: string) => { const s = reviewState(engine, status); return s ? REVIEW_STATE_LABEL[s] : null; };

describe("shared review states keep the existing fund labels", () => {
  it("fund manager submissions read exactly as the current fund screen", () => {
    expect(label("fund_manager_submission", "submitted")).toBe("Waiting for Harmonious review");
    expect(label("fund_manager_submission", "approved")).toBe("Approved");
    expect(label("fund_manager_submission", "returned")).toBe("Needs changes");
    expect(label("fund_manager_submission", "withdrawn")).toBe("Replaced");
  });
  it("foundation submissions use the same words; a withdrawn one stays Withdrawn", () => {
    expect(label("foundation_submission", "submitted")).toBe("Waiting for Harmonious review");
    expect(label("foundation_submission", "accepted")).toBe("Approved");
    expect(label("foundation_submission", "correction_requested")).toBe("Needs changes");
    expect(label("foundation_submission", "withdrawn")).toBe("Withdrawn");
  });
  it("unknown statuses are never guessed", () => {
    expect(reviewState("fund_manager_submission", "accepted")).toBeNull();
    expect(reviewState("foundation_submission", "returned")).toBeNull();
  });
  it("foundation documents: staff uploads on file, client uploads follow their review", () => {
    expect(foundationDocumentState({ source: "staff" })).toBe("on_file");
    expect(foundationDocumentState({ source: "client", review: null })).toBe("waiting");
    expect(foundationDocumentState({ source: "client", review: "correction_requested" })).toBe("needs_changes");
  });
});

describe("requirement rows", () => {
  it("clients never see the word exception, and an unresolved exception never reads as in review or done", () => {
    expect(requirementBadge("exception", "client").label).toBe("Harmonious will follow up");
    expect(requirementBadge("follow_up", "client").label).toBe("Harmonious will follow up");
    expect(requirementBadge("exception", "staff").label).toBe("Exception");
  });
  it("maps each engine's statuses", () => {
    expect(fromFoundationRequirement("missing")).toBe("needed");
    expect(fromFoundationChecklist("correction")).toBe("needs_changes");
    expect(fromFundSetupSection("returned")).toBe("needs_changes");
    expect(fromFundSetupSection("withdrawn")).toBe("needed");
    expect(fromFundSetupSection(undefined, true)).toBe("done");
  });
});

describe("person picker badge", () => {
  it("uses the canonical person record words", () => {
    expect(personPickState("approved", "clear")).toEqual({ kyc: "verified", detail: "Identity and screening approved" });
    expect(personPickState("declined", null).detail).toBe("Check needs review");
    expect(personPickState(null, null)).toEqual({ kyc: "none", detail: "Not started" });
  });
});

describe("task status words", () => {
  it("includes blocked handoffs", () => {
    expect(taskStatusLabel("blocked")).toBe("Blocked");
    expect(taskStatusLabel("open")).toBe("Awaiting review");
  });
});

describe("fictional fund submission review mirrors the fund rules", () => {
  it("refuses the submitter, needs a note to send back, and decides once", () => {
    const s = createQaFundSubmissions();
    const [own, bank, fees] = s.items;
    expect(() => handleQaFundSubmissionCall("reviewFundSubmissionFn", { id: own.id, decision: "approve" }, s)).toThrow("someone other than the submitter");
    expect(() => handleQaFundSubmissionCall("reviewFundSubmissionFn", { id: bank.id, decision: "return", note: " " }, s)).toThrow("Tell the fund manager what to fix.");
    handleQaFundSubmissionCall("reviewFundSubmissionFn", { id: fees.id, decision: "approve" }, s);
    expect(fees.status).toBe("approved");
    expect(() => handleQaFundSubmissionCall("reviewFundSubmissionFn", { id: fees.id, decision: "return", note: "late" }, s)).toThrow("already handled");
  });
  it("other funds are refused", () => {
    expect(() => handleQaFundSubmissionCall("listFundSubmissionsFn", { offeringId: "f1000000-0000-4000-8000-000000000009" }, createQaFundSubmissions())).toThrow("Forbidden");
    expect(handleQaFundSubmissionCall("listFundSubmissionsFn", { offeringId: QA_SUBMISSION_FUND }, createQaFundSubmissions())).toMatchObject({ isStaff: true });
  });
});
