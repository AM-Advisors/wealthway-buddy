/**
 * Adversarial proofs for the KYC/AML rules. Everything here exercises the
 * authoritative decision layer — the layer that decides what Harmonious
 * believes, regardless of what a provider or a browser claims.
 */
import { describe, expect, it } from "vitest";
import {
  buildDiditPrefill,
  canWriteVerificationResults,
  compareAddresses,
  compareNames,
  containsTemporaryUrl,
  evaluateDocumentExpiry,
  evaluateHarmoniousDecision,
  investorProgress,
  isProofOfResidence,
  maskDocumentNumber,
  nextAddressState,
  normalizeDiditDecision,
  redactVerificationView,
  sanitizeProviderPayload,
  EXPIRED_ID_MESSAGE,
} from "@/lib/kyc-verification";
import {
  applyProofPolicy,
  evaluateProofOfAddress,
  isCompleteAddress,
  stateForEntry,
} from "@/lib/address-validation";

const approvedDecision = (overrides: Record<string, any> = {}) => ({
  session_id: "sess-1",
  vendor_data: "11111111-1111-4111-8111-111111111111",
  status: "Approved",
  id_verification: {
    status: "Approved",
    document_type: "Passport",
    issuing_state: "USA",
    date_of_issue: "2019-01-01",
    expiration_date: "2032-01-01",
    document_number: "X1234567",
    full_name: "Jane Q Investor",
    date_of_birth: "1980-05-05",
    warnings: [],
  },
  liveness: { status: "Approved", warnings: [] },
  face_match: { status: "Approved", score: 92, warnings: [] },
  aml: { status: "Approved", hits: [], warnings: [] },
  ...overrides,
});

const decide = (raw: Record<string, any>, extra: Record<string, any> = {}) =>
  evaluateHarmoniousDecision({
    normalized: normalizeDiditDecision(raw),
    verificationDate: "2026-01-15",
    proofOfAddressRequired: false,
    legalName: "Jane Q Investor",
    ...extra,
  });

describe("provider results are inputs, not conclusions", () => {
  it("clears a fully approved, current verification", () => {
    const decision = decide(approvedDecision());
    expect(decision.kyc).toBe("approved");
    expect(decision.aml).toBe("approved");
    expect(decision.reviewRequired).toBe(false);
  });

  it("an expired government ID can never produce a current verification", () => {
    const decision = decide(
      approvedDecision({
        id_verification: { ...approvedDecision().id_verification, expiration_date: "2025-12-31" },
      }),
    );
    expect(decision.documentExpired).toBe(true);
    expect(decision.kyc).not.toBe("approved");
    expect(decision.investorMessage).toBe(EXPIRED_ID_MESSAGE);
  });

  it("a browser-supplied expiration date cannot override the provider result", () => {
    // Only the provider's expiration date is ever read.
    const raw: any = approvedDecision();
    raw.id_verification.expiration_date = "2025-01-01";
    (raw as any).client_supplied_expiration_date = "2099-01-01";
    expect(decide(raw).documentExpired).toBe(true);
    expect(
      evaluateDocumentExpiry({ expirationDate: "2025-01-01", verificationDate: "2026-01-15" }).expired,
    ).toBe(true);
  });

  it("a missing government ID cannot produce a verification", () => {
    const raw = approvedDecision({
      id_verification: { status: "Approved", warnings: [] },
    });
    expect(decide(raw).kyc).not.toBe("approved");
  });

  it("keeps AML separate from identity verification", () => {
    const raw = approvedDecision({ aml: { status: "In Review", hits: [{ name: "match" }] } });
    const decision = decide(raw);
    expect(decision.kyc).toBe("approved");
    expect(decision.aml).toBe("review");
  });

  it("a provider warning creates a Harmonious review even when the check passed", () => {
    const raw = approvedDecision({
      liveness: { status: "Approved", warnings: [{ short_description: "Possible spoof" }] },
    });
    const decision = decide(raw);
    expect(decision.reviewRequired).toBe(true);
    expect(decision.kyc).not.toBe("approved");
  });

  it("a provider approval cannot bypass an active compliance hold", () => {
    const decision = decide(approvedDecision(), { holdActive: true });
    expect(decision.kyc).not.toBe("approved");
    expect(decision.reviewRequired).toBe(true);
  });

  it("an unknown provider status is never treated as a pass", () => {
    const raw = approvedDecision({ id_verification: { ...approvedDecision().id_verification, status: "Whatever" } });
    expect(decide(raw).kyc).not.toBe("approved");
  });

  it("a name that does not match the Harmonious record goes to review", () => {
    const decision = decide(approvedDecision(), { legalName: "Someone Else Entirely" });
    expect(decision.reviewRequired).toBe(true);
  });
});

describe("nobody but the provider webhook writes results", () => {
  it("investors cannot write verification results", () => {
    expect(canWriteVerificationResults(["investor"])).toBe(false);
  });
  it("fund managers cannot write KYC or AML results", () => {
    expect(canWriteVerificationResults(["fund_manager", "manager", "admin"])).toBe(false);
  });
  it("only the provider webhook path may write", () => {
    expect(canWriteVerificationResults(["__provider_webhook__"])).toBe(true);
  });
  it("a browser-shaped approval payload still has to survive the decision rules", () => {
    const forged = { status: "Approved" }; // no document, no checks
    expect(decide(forged).kyc).not.toBe("approved");
  });
});

describe("sensitive provider data never leaves the compliance store", () => {
  it("masks document numbers", () => {
    expect(maskDocumentNumber("X1234567")).toBe("••••4567");
    expect(normalizeDiditDecision(approvedDecision()).document.numberLast4).toBe("4567");
  });

  it("strips temporary provider document URLs", () => {
    const payload = sanitizeProviderPayload({
      id_verification: {
        front_image: "https://didit-verification.s3.amazonaws.com/tmp/front.jpg?X-Amz-Signature=abc",
        document_number: "X1234567",
      },
    });
    expect(containsTemporaryUrl(payload)).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("X1234567");
  });

  it("hides internal risk detail from investor and manager views", () => {
    const view = redactVerificationView(
      { risk_score: 71, document: { type: "Passport" }, investigation_note: "watch" },
      "manager",
    );
    expect(view["risk_score"]).toBeUndefined();
    expect(view["investigation_note"]).toBeUndefined();
  });
});

describe("only known, necessary information is sent to the provider", () => {
  it("sends known identity fields and never sensitive identifiers", () => {
    const prefill = buildDiditPrefill({
      legal_first_name: "Jane",
      legal_last_name: "Investor",
      email: "jane@example.com",
      date_of_birth: "1980-05-05",
      tax_id_reference: "123-45-6789",
      ssn: "123-45-6789",
      bank_account_number: "000123456",
    } as any);
    const serialised = JSON.stringify(prefill);
    expect(serialised).not.toContain("123-45-6789");
    expect(serialised).not.toContain("000123456");
    expect(prefill["email"]).toBe("jane@example.com");
  });
});

describe("address verification", () => {
  it("autocomplete alone is not proof of residence", () => {
    const entry = stateForEntry({
      entryMethod: "autocomplete",
      validation: { provider: "google_address_validation", verdict: "validated", formatted: "1 Main St" },
    });
    expect(entry.state).toBe("validated");
    expect(isProofOfResidence(entry.state)).toBe(false);
  });

  it("an address the provider cannot locate does not become validated", () => {
    const entry = stateForEntry({
      entryMethod: "manual",
      validation: { provider: "google_address_validation", verdict: "unresolved", formatted: null },
    });
    expect(entry.state).toBe("review_required");
    expect(isProofOfResidence(entry.state)).toBe(false);
  });

  it("keeps a controlled manual path without granting validation", () => {
    const entry = stateForEntry({ entryMethod: "manual", validation: null });
    expect(entry.state).toBe("entered");
    expect(isCompleteAddress({ line1: "1 Main St", country: "US" })).toBe(true);
    expect(isCompleteAddress({ line1: "1 Main St", country: "" })).toBe(false);
  });

  it("requires proof when policy demands it", () => {
    expect(applyProofPolicy("validated", true)).toBe("proof_required");
    expect(applyProofPolicy("validated", false)).toBe("validated");
  });

  it("a proof-of-address mismatch goes to review, never through", () => {
    const result = evaluateProofOfAddress({
      current: "proof_pending",
      onFile: { line1: "1 Main St", city: "Austin", region: "TX", postalCode: "78701", country: "US" },
      extracted: { line1: "99 Other Rd", city: "Dallas", region: "TX", postalCode: "75201", country: "US" },
      nameMatch: "match",
      providerStatus: "approved",
    });
    expect(result.addressMatch).toBe("mismatch");
    expect(result.state).toBe("review_required");
  });

  it("a name mismatch on the proof document goes to review", () => {
    const result = evaluateProofOfAddress({
      current: "proof_pending",
      onFile: { line1: "1 Main St", city: "Austin", region: "TX", postalCode: "78701", country: "US" },
      extracted: { line1: "1 Main St", city: "Austin", region: "TX", postalCode: "78701", country: "US" },
      nameMatch: "mismatch",
      providerStatus: "approved",
    });
    expect(result.state).toBe("review_required");
  });

  it("an out-of-date proof document goes to review", () => {
    const result = evaluateProofOfAddress({
      current: "proof_pending",
      onFile: { line1: "1 Main St", country: "US" },
      extracted: { line1: "1 Main St", country: "US" },
      nameMatch: "match",
      providerStatus: "approved",
      documentIssueDate: "2025-01-01",
      maxDocumentAgeDays: 90,
      asOf: new Date("2026-01-15"),
    });
    expect(result.state).toBe("review_required");
  });

  it("a matched, current proof document verifies residence", () => {
    const result = evaluateProofOfAddress({
      current: "proof_pending",
      onFile: { line1: "1 Main St", city: "Austin", region: "TX", postalCode: "78701", country: "US" },
      extracted: { line1: "1 Main Street", city: "Austin", region: "TX", postalCode: "78701", country: "US" },
      nameMatch: "match",
      providerStatus: "approved",
      documentIssueDate: new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10),
    });
    expect(result.state).toBe("proof_verified");
    expect(isProofOfResidence(result.state)).toBe(true);
  });

  it("never lifts an address to verified without evidence", () => {
    expect(nextAddressState("entered", { type: "proof_verified", match: "unknown", nameMatch: "unknown" })).not.toBe(
      "proof_verified",
    );
  });

  it("compares names and addresses tolerantly but not blindly", () => {
    expect(compareNames("Jane Q Investor", "jane investor")).not.toBe("mismatch");
    expect(compareNames("Jane Investor", "Robert Smith")).toBe("mismatch");
    expect(
      compareAddresses({ line1: "1 Main St", country: "US" }, { line1: "1 Main Street", country: "US" }),
    ).not.toBe("mismatch");
  });
});

describe("investor-facing progression", () => {
  it("shows the five steps and a plain summary", () => {
    const progress = investorProgress({ decision: decide(approvedDecision()), started: true });
    expect(progress.steps.map((s) => s.id)).toEqual([
      "identity",
      "government_id",
      "face",
      "address",
      "aml",
    ]);
    expect(progress.summary).toBe("Verification complete");
  });

  it("asks for a current ID when the document has expired", () => {
    const decision = decide(
      approvedDecision({
        id_verification: { ...approvedDecision().id_verification, expiration_date: "2025-01-01" },
      }),
    );
    const progress = investorProgress({ decision, started: true });
    expect(progress.summary).toBe("Additional information required");
    expect(progress.steps.find((s) => s.id === "government_id")?.message).toBe(EXPIRED_ID_MESSAGE);
  });

  it("exposes no risk score or investigation note to the investor", () => {
    const progress = investorProgress({ decision: decide(approvedDecision()), started: true });
    expect(JSON.stringify(progress)).not.toMatch(/risk|investigation|warning/i);
  });
});
