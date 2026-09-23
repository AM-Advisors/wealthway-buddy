/**
 * Google as the primary address lookup and validation provider.
 *
 * Google finds and standardises an address. Didit evidences that the person is
 * connected to it. Harmonious decides the compliance state. These tests hold
 * that separation in place.
 */

import { describe, expect, it } from "vitest";
import {
  ADDRESS_STATE_DISPLAY,
  VALIDATION_PENDING_REASON,
  applyProofRequirement,
  isResidenceEvidenced,
  needsRevalidation,
  stateForVerdict,
  changeRequirements,
} from "@/lib/address-model";
import {
  compareAddressComponents,
  comparisonIsConflict,
  comparisonNeedsReview,
} from "@/lib/address-compare";
import { ADDRESS_PROVIDERS } from "@/lib/address-providers";

describe("Google Places selection → Google Address Validation", () => {
  it("a validated selection becomes a validated address", () => {
    const entry = stateForVerdict("validated", "autocomplete");
    expect(entry.state).toBe("validated");
    expect(ADDRESS_STATE_DISPLAY[entry.state]).toBe("Address validated");
  });

  it("selecting a suggestion alone is not validation", () => {
    expect(stateForVerdict(null, "autocomplete").state).toBe("entered");
    expect(stateForVerdict(null, "autocomplete").reason).toContain(VALIDATION_PENDING_REASON);
  });

  it("a warning from the validation provider does not pass as validated", () => {
    expect(stateForVerdict("warning", "autocomplete").state).toBe("validation_warning");
  });

  it("an incomplete or unresolvable address goes to review, never validated", () => {
    expect(stateForVerdict("unresolved", "autocomplete").state).toBe("review_required");
  });

  it("validation is never residence evidence", () => {
    expect(isResidenceEvidenced("validated")).toBe(false);
    expect(isResidenceEvidenced("proof_verified")).toBe(true);
  });

  it("proof policy still applies over a validated address", () => {
    expect(applyProofRequirement("validated", true)).toBe("proof_required");
  });
});

describe("manual entry stays the exception", () => {
  it("a manual address is never lifted to validated on a partial provider result", () => {
    expect(stateForVerdict("normalized", "manual").state).toBe("review_required");
    expect(stateForVerdict("located", "manual").state).toBe("review_required");
    expect(stateForVerdict("warning", "manual").state).toBe("review_required");
  });

  it("a manual address confirmed by Google may become validated", () => {
    expect(stateForVerdict("validated", "manual").state).toBe("validated");
  });

  it("an unvalidated manual address stays usable and pending, never failed", () => {
    const entry = stateForVerdict(null, "manual");
    expect(entry.state).toBe("entered");
    expect(entry.reason).toContain(VALIDATION_PENDING_REASON);
  });
});

describe("provider outage", () => {
  it("an outage leaves the address entered and queued, not invalid", () => {
    const entry = stateForVerdict("unavailable", "autocomplete");
    expect(entry.state).toBe("entered");
    expect(entry.state).not.toBe("failed");
  });

  it("addresses saved during an outage are picked up by reconciliation", () => {
    expect(needsRevalidation("entered", "unavailable")).toBe(true);
    expect(needsRevalidation("entered", null)).toBe(true);
    expect(needsRevalidation("proof_required", "unavailable")).toBe(true);
  });

  it("validated or reviewed addresses are not re-opened by reconciliation", () => {
    expect(needsRevalidation("validated", "validated")).toBe(false);
    expect(needsRevalidation("review_required", "unresolved")).toBe(false);
    expect(needsRevalidation("proof_verified", "validated")).toBe(false);
  });
});

describe("comparison states", () => {
  const onFile = {
    line1: "100 North Main Street",
    line2: "Apt 4",
    city: "Austin",
    region: "Texas",
    postalCode: "78701",
    country: "US",
  };

  it("formatting differences are not a mismatch", () => {
    const res = compareAddressComponents(onFile, {
      line1: "100 N Main St",
      line2: "Apt 4",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      country: "US",
    });
    expect(comparisonIsConflict(res.result)).toBe(false);
    expect(comparisonNeedsReview(res.result)).toBe(false);
  });

  it("a different unit is detected", () => {
    const res = compareAddressComponents(onFile, { ...onFile, line2: "Apt 9" });
    expect(res.result).not.toBe("match");
  });

  it("a material mismatch requires review and is conflicting evidence", () => {
    const res = compareAddressComponents(onFile, {
      line1: "42 Elm Road",
      city: "Denver",
      region: "CO",
      postalCode: "80202",
      country: "US",
    });
    expect(res.result).toBe("material_mismatch");
    expect(comparisonIsConflict(res.result)).toBe(true);
    expect(comparisonNeedsReview(res.result)).toBe(true);
  });

  it("unable to compare needs review but is not a conflict", () => {
    const res = compareAddressComponents(null, onFile);
    expect(res.result).toBe("unable_to_compare");
    expect(comparisonNeedsReview(res.result)).toBe(true);
    expect(comparisonIsConflict(res.result)).toBe(false);
  });

  it("an international address compares on its own components", () => {
    const uk = {
      line1: "221B Baker Street",
      city: "London",
      region: null,
      postalCode: "NW1 6XE",
      country: "GB",
    };
    expect(compareAddressComponents(uk, { ...uk, line1: "221b Baker St" }).result).not.toBe(
      "material_mismatch",
    );
  });
});

describe("changing a verified address", () => {
  it("a material change to a verified address needs proof and compliance review", () => {
    const policy = changeRequirements({
      previousState: "proof_verified",
      comparison: "material_mismatch",
      proofRequiredByPolicy: true,
    });
    expect(policy.requiresProof).toBe(true);
    expect(policy.requiresComplianceReview).toBe(true);
  });

  it("a formatting-only change does not demand new proof", () => {
    const policy = changeRequirements({
      previousState: "proof_verified",
      comparison: "format_only_difference",
      proofRequiredByPolicy: true,
    });
    expect(policy.requiresProof).toBe(false);
  });
});

describe("provider configuration", () => {
  it("Google is the configured lookup and validation provider, Didit the proof provider", () => {
    expect(ADDRESS_PROVIDERS.autocomplete).toBe("google");
    expect(ADDRESS_PROVIDERS.validation).toBe("google");
    expect(ADDRESS_PROVIDERS.proof).toBe("didit");
  });
});
