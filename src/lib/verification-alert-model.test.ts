import { describe, expect, it } from "vitest";
import { operationsNoticeUrl, verificationNeedsConfirmation, verificationNotice } from "./verification-alert-model";

describe("verification confirmation alerts", () => {
  for (const check of ["KYC", "KYB", "AML"] as const) {
    it(`${check} review produces a distinct Operations notice`, () => {
      const notice = verificationNotice({ check, status: "review", ref: "fictional-check" });
      expect(notice?.kind).toBe("verification_confirmation");
      expect(notice?.ref).toBe(`${check}:fictional-check:review`);
      expect(notice?.once).toBe(true);
    });
  }
  it("ordinary pending and approved checks do not request confirmation", () => {
    for (const status of ["pending", "approved", "not_started", "", null, undefined]) {
      expect(verificationNeedsConfirmation(status)).toBe(false);
      expect(verificationNotice({ check: "AML", status, ref: "fictional" })).toBeNull();
    }
  });
  it("flagged and failed checks request confirmation without approving them", () => {
    for (const status of ["flagged", "failed", "declined", "In Review", "requires_review"]) expect(verificationNeedsConfirmation(status)).toBe(true);
  });
  it("does not project raw verification details", () => {
    const input = { check: "AML" as const, status: "review", ref: "fictional", providerPayload: { taxId: "secret", hits: ["private"] } };
    expect(verificationNotice(input)).toEqual({ kind: "verification_confirmation", title: "AML requires confirmation", ref: "AML:fictional:review", offeringId: null, path: "/ops/queue", once: true });
  });
  it("Fund A without an owner links directly to Operations", () => {
    expect(operationsNoticeUrl(null, "fund-a")).toBe("https://ops.harmonious.co/ops/fund/fund-a");
  });
  it("preserves record tabs and refuses external or client destinations", () => {
    expect(operationsNoticeUrl("/ops/fund/fund-a?tab=investors")).toBe("https://ops.harmonious.co/ops/fund/fund-a?tab=investors");
    for (const path of ["//example.com", "https://example.com", "/home", "/\\example.com"]) expect(operationsNoticeUrl(path)).toBe("https://ops.harmonious.co/ops/queue");
  });
});