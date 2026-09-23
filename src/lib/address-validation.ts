/**
 * Address lookup and validation rules (pure, no I/O).
 *
 * A suggestion from a lookup provider is convenience, not evidence: it can
 * normalise or validate an address, but it never proves that somebody lives
 * there. Proof of residence only ever comes from a verified document.
 */

import {
  compareAddresses,
  nextAddressState,
  type AddressEvent,
  type AddressParts,
  type AddressState,
  type MatchResult,
} from "@/lib/kyc-verification";

export type { AddressParts, AddressState };

export interface StructuredAddress {
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
  formatted: string | null;
}

export interface AddressSuggestion {
  id: string;
  description: string;
  provider: string;
}

export type EntryMethod = "autocomplete" | "manual";

export interface ProviderValidation {
  provider: string;
  /** Provider verdict for the address itself. */
  verdict: "validated" | "normalized" | "unresolved";
  formatted: string | null;
  components?: Partial<StructuredAddress>;
  raw?: Record<string, unknown>;
}

const COUNTRY_RE = /^[A-Za-z]{2}$/;

export function isCompleteAddress(address: Partial<StructuredAddress> | null | undefined): boolean {
  if (!address) return false;
  return Boolean(
    address.line1 &&
      String(address.line1).trim().length >= 3 &&
      address.country &&
      COUNTRY_RE.test(String(address.country).trim()),
  );
}

/** Normalises whitespace and casing without inventing any missing part. */
export function cleanAddress(input: Partial<StructuredAddress>): StructuredAddress {
  const text = (value: unknown) => {
    const s = String(value ?? "").trim().replace(/\s+/g, " ");
    return s ? s : null;
  };
  return {
    line1: text(input.line1) ?? "",
    line2: text(input.line2),
    city: text(input.city),
    region: text(input.region),
    postalCode: text(input.postalCode),
    country: (text(input.country) ?? "").toUpperCase(),
    formatted: text(input.formatted),
  };
}

/**
 * The state an address takes when it is first captured. Only a provider
 * verdict can lift it past ENTERED.
 */
export function stateForEntry(input: {
  entryMethod: EntryMethod;
  validation: ProviderValidation | null;
}): { state: AddressState; reason: string } {
  if (!input.validation) {
    return input.entryMethod === "manual"
      ? { state: "entered", reason: "Entered manually; not yet checked with a validation provider." }
      : { state: "entered", reason: "Selected from suggestions; provider validation not recorded." };
  }
  switch (input.validation.verdict) {
    case "validated":
      return { state: "validated", reason: `Validated by ${input.validation.provider}.` };
    case "normalized":
      return { state: "normalized", reason: `Normalised by ${input.validation.provider}.` };
    default:
      return {
        state: "review_required",
        reason: `${input.validation.provider} could not locate this address; manual review required.`,
      };
  }
}

/**
 * Applies Harmonious policy on top of the captured state: when proof of
 * residence is required, a validated address still has to be evidenced.
 */
export function applyProofPolicy(state: AddressState, proofRequired: boolean): AddressState {
  if (!proofRequired) return state;
  if (state === "proof_verified" || state === "proof_pending" || state === "failed") return state;
  if (state === "review_required") return state;
  return "proof_required";
}

export interface ProofEvaluation {
  state: AddressState;
  addressMatch: MatchResult;
  nameMatch: MatchResult;
  reason: string;
}

/**
 * Compares the provider's extracted proof-of-address details against what
 * Harmonious holds. Anything short of a match becomes a review, never a pass.
 */
export function evaluateProofOfAddress(input: {
  current: AddressState;
  onFile: AddressParts | null;
  extracted: AddressParts | null;
  nameMatch: MatchResult;
  providerStatus: "approved" | "declined" | "pending" | "review" | "not_started";
  documentIssueDate?: string | null;
  maxDocumentAgeDays?: number;
  asOf?: Date;
  /**
   * Server-side component comparison result. When supplied it replaces the
   * string comparison, so "100 N Main St" and "100 North Main Street" are not
   * treated as a mismatch. Never supplied by the browser.
   */
  addressMatchOverride?: MatchResult;
}): ProofEvaluation {
  const addressMatch = input.addressMatchOverride ?? compareAddresses(input.onFile, input.extracted);

  if (input.providerStatus === "declined") {
    return {
      state: nextAddressState(input.current, { type: "proof_failed" }),
      addressMatch,
      nameMatch: input.nameMatch,
      reason: "The provider rejected the proof-of-address document.",
    };
  }
  if (input.providerStatus === "pending" || input.providerStatus === "not_started") {
    return {
      state: nextAddressState(input.current, { type: "proof_submitted" }),
      addressMatch,
      nameMatch: input.nameMatch,
      reason: "Proof of address is being checked.",
    };
  }
  if (input.providerStatus === "review") {
    return {
      state: nextAddressState(input.current, { type: "review" }),
      addressMatch,
      nameMatch: input.nameMatch,
      reason: "The provider flagged the proof-of-address document for review.",
    };
  }

  const maxAge = input.maxDocumentAgeDays ?? 90;
  if (input.documentIssueDate) {
    const issued = new Date(input.documentIssueDate).getTime();
    const asOf = (input.asOf ?? new Date()).getTime();
    if (!Number.isNaN(issued) && asOf - issued > maxAge * 86_400_000) {
      return {
        state: nextAddressState(input.current, { type: "review" }),
        addressMatch,
        nameMatch: input.nameMatch,
        reason: `The proof-of-address document is older than ${maxAge} days.`,
      };
    }
  }

  const event: AddressEvent = {
    type: "proof_verified",
    match: addressMatch,
    nameMatch: input.nameMatch,
  };
  const state = nextAddressState(input.current, event);
  return {
    state,
    addressMatch,
    nameMatch: input.nameMatch,
    reason:
      state === "proof_verified"
        ? "Proof of address verified and matched to the address on file."
        : "Proof-of-address details do not match the record; compliance review required.",
  };
}

/** Investor-facing wording for an address state. */
export const ADDRESS_STATE_LABELS: Record<AddressState, string> = {
  entered: "Entered",
  normalized: "Normalised",
  validated: "Validated",
  proof_required: "Proof of address required",
  proof_pending: "Proof of address in review",
  proof_verified: "Proof of address verified",
  review_required: "Review required",
  failed: "Could not be verified",
};
