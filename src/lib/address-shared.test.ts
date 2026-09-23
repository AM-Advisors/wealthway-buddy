/**
 * Shared address service — correctness and adversarial tests.
 *
 * Google finding an address is convenience. Didit proof of address is
 * evidence. Harmonious decides. These tests hold those apart.
 */

import { describe, expect, it } from "vitest";

import {
  compareAddressComponents,
  comparisonNeedsReview,
  comparisonToMatch,
  componentsOf,
} from "@/lib/address-compare";
import {
  ADDRESS_USAGE_CONTEXTS,
  canSupersede,
  changeRequirements,
  isClientAssertableState,
  isResidenceEvidenced,
  isVerbatimSource,
  planAddressVersion,
  stateForVerdict,
  usageIsImmutable,
} from "@/lib/address-model";
import { ADDRESS_PROVIDERS, OFFLINE_CAPABILITIES } from "@/lib/address-providers";
import { applyProofPolicy, evaluateProofOfAddress, stateForEntry } from "@/lib/address-validation";

const ON_FILE = {
  line1: "100 North Main Street",
  city: "Austin",
  region: "Texas",
  postalCode: "78701",
  country: "US",
};

describe("address comparison", () => {
  it("treats formatting differences as a match, not a mismatch", () => {
    const detail = compareAddressComponents(ON_FILE, {
      line1: "100 N Main St",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      country: "US",
    });
    expect(["match", "format_only_difference"]).toContain(detail.result);
    expect(comparisonNeedsReview(detail.result)).toBe(false);
    expect(comparisonToMatch(detail.result)).toBe("match");
  });

  it("flags a materially different address for review", () => {
    const detail = compareAddressComponents(ON_FILE, {
      line1: "42 Ocean Drive",
      city: "Miami",
      region: "FL",
      postalCode: "33139",
      country: "US",
    });
    expect(detail.result).toBe("material_mismatch");
    expect(comparisonNeedsReview(detail.result)).toBe(true);
    expect(comparisonToMatch(detail.result)).toBe("mismatch");
  });

  it("reports unable_to_compare rather than guessing when one side is missing", () => {
    const detail = compareAddressComponents(ON_FILE, null);
    expect(detail.result).toBe("unable_to_compare");
    expect(comparisonNeedsReview(detail.result)).toBe(true);
  });

  it("breaks an address into components instead of comparing raw strings", () => {
    const parts = componentsOf(ON_FILE);
    expect(parts.streetNumber).toBe("100");
    expect(parts.postalCode).toBe("78701");
  });
});

describe("Google is never proof of residence", () => {
  it("a validated Google result stops at validated", () => {
    const entry = stateForEntry({
      entryMethod: "autocomplete",
      validation: { provider: "google", verdict: "validated", formatted: "100 N Main St" },
    });
    expect(entry.state).toBe("validated");
    expect(isResidenceEvidenced(entry.state)).toBe(false);
  });

  it("policy still demands proof on top of a validated address", () => {
    expect(applyProofPolicy("validated", true)).toBe("proof_required");
  });

  it("only a verified proof document counts as residence evidence", () => {
    expect(isResidenceEvidenced("proof_verified")).toBe(true);
    expect(isResidenceEvidenced("normalized")).toBe(false);
    expect(isResidenceEvidenced("entered")).toBe(false);
  });

  it("the browser cannot assert a verified or validated state", () => {
    expect(isClientAssertableState("proof_verified")).toBe(false);
    expect(isClientAssertableState("validated")).toBe(false);
    expect(isClientAssertableState("proof_mismatch")).toBe(false);
    expect(isClientAssertableState("entered")).toBe(true);
  });
});

describe("manual entry and provider outage", () => {
  it("manual entry is accepted and marked for later validation", () => {
    const entry = stateForEntry({ entryMethod: "manual", validation: null });
    expect(entry.state).toBe("entered");
  });

  it("an outage leaves the address usable rather than invalid", () => {
    expect(OFFLINE_CAPABILITIES.autocomplete).toBe(false);
    expect(OFFLINE_CAPABILITIES.validation).toBe(false);
    expect(stateForVerdict("unavailable", "manual").state).toBe("entered");
    expect(stateForEntry({ entryMethod: "manual", validation: null }).state).not.toBe("failed");
  });

  it("an address the provider cannot locate goes to review, not failure", () => {
    const entry = stateForEntry({
      entryMethod: "manual",
      validation: { provider: "google", verdict: "unresolved", formatted: null },
    });
    expect(entry.state).toBe("review_required");
  });
});

describe("proof of address", () => {
  const extracted = {
    line1: "100 N Main St",
    city: "Austin",
    region: "TX",
    postalCode: "78701",
    country: "US",
  };

  it("verifies when the document matches the address on file", () => {
    const result = evaluateProofOfAddress({
      current: "proof_pending",
      onFile: ON_FILE,
      extracted,
      nameMatch: "match",
      providerStatus: "approved",
      addressMatchOverride: comparisonToMatch(compareAddressComponents(ON_FILE, extracted).result),
    });
    expect(result.state).toBe("proof_verified");
  });

  it("does not verify when the document names a different address", () => {
    const other = { line1: "42 Ocean Drive", city: "Miami", region: "FL", postalCode: "33139", country: "US" };
    const result = evaluateProofOfAddress({
      current: "proof_pending",
      onFile: ON_FILE,
      extracted: other,
      nameMatch: "match",
      providerStatus: "approved",
      addressMatchOverride: comparisonToMatch(compareAddressComponents(ON_FILE, other).result),
    });
    expect(result.state).not.toBe("proof_verified");
  });

  it("does not verify when the name on the document does not match", () => {
    const result = evaluateProofOfAddress({
      current: "proof_pending",
      onFile: ON_FILE,
      extracted,
      nameMatch: "mismatch",
      providerStatus: "approved",
      addressMatchOverride: "match",
    });
    expect(result.state).not.toBe("proof_verified");
  });

  it("sends a stale document to review", () => {
    const result = evaluateProofOfAddress({
      current: "proof_pending",
      onFile: ON_FILE,
      extracted,
      nameMatch: "match",
      providerStatus: "approved",
      documentIssueDate: "2020-01-01",
      asOf: new Date("2026-01-01"),
      addressMatchOverride: "match",
    });
    expect(result.state).not.toBe("proof_verified");
  });
});

describe("provenance and versioning", () => {
  it("a lower-authority source never overwrites a stronger one", () => {
    expect(canSupersede("didit_proof_of_address", "user_entered")).toBe(false);
    expect(canSupersede("user_entered", "didit_proof_of_address")).toBe(true);
  });

  it("tax-document addresses are kept verbatim", () => {
    expect(isVerbatimSource("w9")).toBe(true);
    expect(isVerbatimSource("w8")).toBe(true);
    expect(isVerbatimSource("formation_document")).toBe(true);
    expect(isVerbatimSource("google_normalized")).toBe(false);
  });

  it("a Google-formatted address cannot replace a tax-document address", () => {
    expect(canSupersede("w9", "google_normalized")).toBe(false);
    const plan = planAddressVersion({
      currentState: "validated",
      currentStatus: "effective",
      incomingSource: "google_normalized",
      existingSource: "w9",
    });
    expect(plan.status).toBe("pending");
    expect(plan.keepExistingEffective).toBe(true);
  });

  it("a change against a verified address is pending, and the verified one stays effective", () => {
    const plan = planAddressVersion({
      currentState: "proof_verified",
      currentStatus: "effective",
      incomingSource: "user_entered",
      existingSource: "user_entered",
    });
    expect(plan.status).toBe("pending");
    expect(plan.keepExistingEffective).toBe(true);
  });

  it("a first address simply becomes effective", () => {
    const plan = planAddressVersion({
      currentState: "entered",
      currentStatus: "effective",
      incomingSource: "user_entered",
      existingSource: "user_entered",
    });
    expect(plan.status).toBe("effective");
  });

  it("historical usages are immutable for every context", () => {
    for (const context of ADDRESS_USAGE_CONTEXTS) {
      expect(usageIsImmutable(context)).toBe(true);
    }
  });
});

describe("change-of-address policy", () => {
  it("a formatting change needs no new proof", () => {
    const policy = changeRequirements({
      previousState: "proof_verified",
      comparison: "format_only_difference",
      proofRequiredByPolicy: true,
    });
    expect(policy.requiresProof).toBe(false);
    expect(policy.requiresComplianceReview).toBe(false);
  });

  it("a material move away from a verified address needs proof and review", () => {
    const policy = changeRequirements({
      previousState: "proof_verified",
      comparison: "material_mismatch",
      proofRequiredByPolicy: true,
    });
    expect(policy.requiresProof).toBe(true);
    expect(policy.requiresComplianceReview).toBe(true);
  });
});

describe("provider configuration is centralised", () => {
  it("names one provider per function", () => {
    expect(ADDRESS_PROVIDERS.autocomplete).toBe("google");
    expect(ADDRESS_PROVIDERS.validation).toBe("google");
    expect(ADDRESS_PROVIDERS.proof).toBe("didit");
  });
});
