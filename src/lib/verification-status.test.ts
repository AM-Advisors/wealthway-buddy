import { describe, expect, it } from "vitest";
import { canonicalVerificationStatus, effectiveCheckStatus, personStatusByUser, withCanonicalVerification } from "./verification-status";

describe("canonicalVerificationStatus", () => {
  it("treats every historical success word as approved", () => {
    for (const s of ["approved", "clear", "passed", "verified"]) expect(canonicalVerificationStatus(s)).toBe("approved");
  });
  it("treats rejected and hit as declined", () => {
    expect(canonicalVerificationStatus("rejected")).toBe("declined");
    expect(canonicalVerificationStatus("hit")).toBe("declined");
  });
  it("treats submitted as review and blank as pending", () => {
    expect(canonicalVerificationStatus("submitted")).toBe("review");
    expect(canonicalVerificationStatus(null)).toBe("pending");
  });
});

describe("effectiveCheckStatus", () => {
  it("person approval wins over a stale application 'not started'", () => {
    expect(effectiveCheckStatus("approved", "not_started")).toBe("approved");
  });
  it("falls back to the application when the person has no result", () => {
    expect(effectiveCheckStatus(null, "approved")).toBe("approved");
  });
  it("a person decline is not hidden by an old application approval", () => {
    expect(effectiveCheckStatus("declined", "approved")).toBe("declined");
  });
});

describe("withCanonicalVerification", () => {
  it("ignores merged-away duplicate persons", () => {
    const map = personStatusByUser([
      { user_id: "u1", kyc_status: "declined", aml_status: "declined", merged_into_person_id: "p2" },
    ]);
    const app = withCanonicalVerification({ user_id: "u1", kyc_status: "approved", aml_status: "approved" }, map);
    expect(app.kyc_status).toBe("approved");
  });
});
