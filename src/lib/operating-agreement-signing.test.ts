import { describe, expect, it } from "vitest";
import { isRecordedOperatingSignatory, operatingAgreementSignaturePage } from "./operating-agreement-signing";

const facts = { title: "Operating Agreement", fundName: "Example Fund LLC", signerName: "Jane Doe", signatoryTitle: "Managing Member", body: "Reviewed agreement" };
describe("new operating agreement signing packets", () => {
  it("allows the exact recorded signatory but not another manager to inherit their title", () => {
    expect(isRecordedOperatingSignatory({ user_id: "jane", email: "jane@example.com" }, "jane", "jane@example.com")).toBe(true);
    expect(isRecordedOperatingSignatory({ email: "Jane@example.com" }, "jane", "jane@example.com")).toBe(true);
    expect(isRecordedOperatingSignatory({ user_id: "jane", email: "jane@example.com" }, "john", "john@example.com")).toBe(false);
    expect(isRecordedOperatingSignatory(null, "john", "john@example.com")).toBe(false);
  });
  it("retains the recorded signatory title in the ceremony snapshot", () => {
    const page = operatingAgreementSignaturePage(facts);
    expect(page).toContain("Title: Managing Member");
    expect(page).toContain("Signed by: Jane Doe");
  });
  it.each([null, undefined, "", "   "])("refuses a missing recorded title (%s)", (signatoryTitle) => {
    expect(() => operatingAgreementSignaturePage({ ...facts, signatoryTitle })).toThrow("Record the fund signatory's title");
  });
  it("refuses an earlier document with an unresolved title instead of silently changing its text", () => {
    expect(() => operatingAgreementSignaturePage({ ...facts, body: "Title: {{Signatory's Title}}" })).toThrow("unfilled template fields");
  });
  it("refuses other unresolved fund facts too", () => {
    expect(() => operatingAgreementSignaturePage({ ...facts, body: "{{Management Fee}}" })).toThrow("unfilled template fields");
  });
});