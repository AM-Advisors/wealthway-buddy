/**
 * The one Harmonious address model (pure, no I/O).
 *
 * Google Places finds an address. Google Address Validation normalises and
 * assesses it. Didit proof of address evidences that a person is connected to
 * it. Harmonious — and only Harmonious — decides the compliance state. These
 * are four different functions and they stay four different pieces of state.
 */

// ---------------------------------------------------------------------------
// Owners and kinds
// ---------------------------------------------------------------------------

export const ADDRESS_OWNER_TYPES = [
  "person",
  "entity",
  "fund",
  "company",
  "professional_org",
  "bank_account",
] as const;
export type AddressOwnerType = (typeof ADDRESS_OWNER_TYPES)[number];

export const ADDRESS_KINDS = [
  "residential",
  "mailing",
  "registered",
  "principal_business",
  "operating",
  "tax",
  "formation",
  "registered_agent",
  "beneficiary",
  "headquarters",
] as const;
export type AddressKind = (typeof ADDRESS_KINDS)[number];

export const ADDRESS_KIND_LABELS: Record<AddressKind, string> = {
  residential: "Residential address",
  mailing: "Mailing address",
  registered: "Registered address",
  principal_business: "Principal business address",
  operating: "Operating address",
  tax: "Tax address",
  formation: "Formation address",
  registered_agent: "Registered agent address",
  beneficiary: "Beneficiary address",
  headquarters: "Headquarters address",
};

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export const ADDRESS_SOURCES = [
  "user_entered",
  "google_normalized",
  "didit_id",
  "didit_proof_of_address",
  "w9",
  "w8",
  "kyb_provider",
  "bank_provider",
  "formation_document",
  "admin_verified",
] as const;
export type AddressSource = (typeof ADDRESS_SOURCES)[number];

export const ADDRESS_SOURCE_LABELS: Record<AddressSource, string> = {
  user_entered: "Entered by the user",
  google_normalized: "Normalised by the address provider",
  didit_id: "Read from a government ID",
  didit_proof_of_address: "Read from a proof-of-address document",
  w9: "From Form W-9",
  w8: "From Form W-8",
  kyb_provider: "From the business verification provider",
  bank_provider: "From the banking provider",
  formation_document: "From a formation document",
  admin_verified: "Verified by Harmonious staff",
};

/**
 * Authority ranking. A lower-authority source never overwrites a
 * higher-authority record — a difference in formatting is a comparison to
 * review, not a licence to replace a legal or documentary address.
 */
const SOURCE_AUTHORITY: Record<AddressSource, number> = {
  google_normalized: 1,
  user_entered: 2,
  didit_id: 3,
  bank_provider: 4,
  kyb_provider: 5,
  didit_proof_of_address: 6,
  w8: 7,
  w9: 7,
  formation_document: 8,
  admin_verified: 9,
};

export function sourceAuthority(source: AddressSource): number {
  return SOURCE_AUTHORITY[source] ?? 0;
}

/** True only when the incoming source is allowed to replace the record on file. */
export function canSupersede(existing: AddressSource, incoming: AddressSource): boolean {
  return sourceAuthority(incoming) >= sourceAuthority(existing);
}

/** Sources whose exact wording must be preserved verbatim for the record. */
export const VERBATIM_SOURCES: AddressSource[] = [
  "w9",
  "w8",
  "formation_document",
  "kyb_provider",
  "didit_id",
  "didit_proof_of_address",
];

export function isVerbatimSource(source: AddressSource): boolean {
  return VERBATIM_SOURCES.includes(source);
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export const ADDRESS_STATE_VALUES = [
  "entered",
  "located",
  "normalized",
  "validated",
  "validation_warning",
  "review_required",
  "proof_required",
  "proof_pending",
  "proof_verified",
  "proof_mismatch",
  "failed",
] as const;
export type AddressRecordState = (typeof ADDRESS_STATE_VALUES)[number];

export const ADDRESS_STATE_DISPLAY: Record<AddressRecordState, string> = {
  entered: "Address entered",
  located: "Address located",
  normalized: "Address normalised",
  validated: "Address validated",
  validation_warning: "Validation warning",
  review_required: "Manual review",
  proof_required: "Proof required",
  proof_pending: "Proof pending",
  proof_verified: "Proof verified",
  proof_mismatch: "Proof mismatch",
  failed: "Verification failed",
};

/** Only a verified document evidences residence. Validation never does. */
export function isResidenceEvidenced(state: AddressRecordState): boolean {
  return state === "proof_verified";
}

/** States a client-side caller may never ask for. */
export const SERVER_ONLY_STATES: AddressRecordState[] = [
  "located",
  "normalized",
  "validated",
  "validation_warning",
  "proof_pending",
  "proof_verified",
  "proof_mismatch",
  "failed",
];

export function isClientAssertableState(state: string): boolean {
  return state === "entered";
}

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

export type AddressRecordStatus = "pending" | "effective" | "superseded";

export interface AddressVersionInput {
  currentState: AddressRecordState;
  currentStatus: AddressRecordStatus;
  incomingSource: AddressSource;
  existingSource: AddressSource;
}

export interface AddressVersionDecision {
  /** Whether the new entry becomes effective immediately or waits as pending. */
  status: AddressRecordStatus;
  /** Whether the existing record keeps its effective standing meanwhile. */
  keepExistingEffective: boolean;
  reason: string;
}

/**
 * A verified address is never overwritten. A change against a verified record
 * is captured as a pending version while the verified one stays effective
 * until the new one completes whatever verification policy requires.
 */
export function planAddressVersion(input: AddressVersionInput): AddressVersionDecision {
  if (!canSupersede(input.existingSource, input.incomingSource)) {
    return {
      status: "pending",
      keepExistingEffective: true,
      reason: `Held for review: the address on file came from a more authoritative source (${ADDRESS_SOURCE_LABELS[input.existingSource]}).`,
    };
  }
  if (isResidenceEvidenced(input.currentState) && input.currentStatus === "effective") {
    return {
      status: "pending",
      keepExistingEffective: true,
      reason: "The verified address stays effective until the new address completes verification.",
    };
  }
  return {
    status: "effective",
    keepExistingEffective: false,
    reason: "New address recorded as the current address.",
  };
}

// ---------------------------------------------------------------------------
// Re-verification policy for a change of address
// ---------------------------------------------------------------------------

export interface ChangePolicyInput {
  previousState: AddressRecordState;
  comparison: "match" | "format_only_difference" | "minor_difference" | "material_mismatch" | "unable_to_compare";
  proofRequiredByPolicy: boolean;
}

export interface ChangePolicy {
  revalidate: boolean;
  requiresProof: boolean;
  requiresComplianceReview: boolean;
  reason: string;
}

export function changeRequirements(input: ChangePolicyInput): ChangePolicy {
  if (input.comparison === "match" || input.comparison === "format_only_difference") {
    return {
      revalidate: true,
      requiresProof: false,
      requiresComplianceReview: false,
      reason: "Formatting change only; the verified address is unchanged.",
    };
  }
  if (input.comparison === "unable_to_compare") {
    return {
      revalidate: true,
      requiresProof: input.proofRequiredByPolicy,
      requiresComplianceReview: true,
      reason: "The change could not be compared automatically and needs review.",
    };
  }
  if (input.comparison === "minor_difference") {
    return {
      revalidate: true,
      requiresProof: input.proofRequiredByPolicy && isResidenceEvidenced(input.previousState),
      requiresComplianceReview: false,
      reason: "Minor change; the address is revalidated before it takes effect.",
    };
  }
  return {
    revalidate: true,
    requiresProof: input.proofRequiredByPolicy || isResidenceEvidenced(input.previousState),
    requiresComplianceReview: isResidenceEvidenced(input.previousState),
    reason: "The new address is materially different and needs to be verified again.",
  };
}

// ---------------------------------------------------------------------------
// Historical pinning
// ---------------------------------------------------------------------------

export const ADDRESS_USAGE_CONTEXTS = [
  "kyc",
  "kyb",
  "investment",
  "subscription",
  "tax",
  "banking",
  "payment",
  "legal_formation",
] as const;
export type AddressUsageContext = (typeof ADDRESS_USAGE_CONTEXTS)[number];

/**
 * Historical records always keep the address version they were made with:
 * pinning is by address id, never by "the person's current address".
 */
export function usageIsImmutable(_context: AddressUsageContext): boolean {
  return true;
}

// ---------------------------------------------------------------------------
// Provider verdict → Harmonious state
// ---------------------------------------------------------------------------

export type ProviderVerdict = "validated" | "normalized" | "located" | "warning" | "unresolved" | "unavailable";

/**
 * Maps a validation provider's verdict onto a Harmonious state. A provider
 * outage never invalidates an address: it stays entered and is picked up for
 * validation later.
 */
export const VALIDATION_PENDING_REASON = "Address validation pending.";

export function stateForVerdict(
  verdict: ProviderVerdict | null,
  entryMethod: "autocomplete" | "manual",
): { state: AddressRecordState; reason: string } {
  switch (verdict) {
    case "validated":
      return { state: "validated", reason: "Confirmed by the address validation provider." };
    case "normalized":
    case "located":
    case "warning": {
      // A manually typed address is never lifted to a provider-confirmed state
      // on a partial result: it stays flagged for validation or review.
      if (entryMethod === "manual") {
        return {
          state: "review_required",
          reason: "Entered manually and not confirmed by the validation provider; validation required.",
        };
      }
      if (verdict === "normalized") {
        return { state: "normalized", reason: "Standardised by the address validation provider." };
      }
      if (verdict === "located") {
        return { state: "located", reason: "Found by the address provider but not fully confirmed." };
      }
      return {
        state: "validation_warning",
        reason: "The address provider returned warnings about this address.",
      };
    }
    case "unresolved":
      return { state: "review_required", reason: "The address provider could not locate this address." };
    case "unavailable":
    case null:
    default:
      return {
        state: "entered",
        reason:
          entryMethod === "manual"
            ? `${VALIDATION_PENDING_REASON} Entered manually; queued for validation.`
            : `${VALIDATION_PENDING_REASON} Selected from suggestions; queued for validation.`,
      };
  }
}

/**
 * True when an address should be picked up again by reconciliation — it was
 * saved while the validation provider was unreachable, so it is neither
 * validated nor in review, just waiting.
 */
export function needsRevalidation(
  state: AddressRecordState,
  verdict: ProviderVerdict | null,
): boolean {
  if (state !== "entered" && state !== "proof_required") return false;
  return verdict === null || verdict === "unavailable";
}

/** Layers Harmonious proof policy on top of the captured state. */
export function applyProofRequirement(
  state: AddressRecordState,
  proofRequired: boolean,
): AddressRecordState {
  if (!proofRequired) return state;
  if (["proof_verified", "proof_pending", "proof_mismatch", "failed", "review_required"].includes(state)) {
    return state;
  }
  return "proof_required";
}
