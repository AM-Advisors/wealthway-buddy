/**
 * What a power of attorney lets the named person do (pure).
 *
 * The document decides: only the powers listed on an accepted record become
 * authority, and each listed power maps to a fixed, closed set of platform
 * permissions enforced by the delegation engine. Money movement, bank or wire
 * detail changes, identity screening, sign-in security and access grants are
 * never carried by a power of attorney, however the document is worded.
 */
import {
  AUTHORITY_LEVELS,
  CAPABILITY_MIN_AUTHORITY,
  DELEGATION_CAPABILITIES,
  authorityAtLeast,
  isDelegationCapability,
  type AuthorityLevel,
  type DelegationCapability,
} from "@/lib/delegation-model";
import { POA_POWERS, type PoaPower } from "@/lib/power-of-attorney-model";
import { BLOCKED_TRANSACTION_ACTIONS, SIGNABLE_DOCUMENT_TYPES } from "@/lib/signatory-model";

/** Each listed power opens exactly these permissions, and nothing else. */
export const POA_POWER_CAPABILITIES: Record<PoaPower, readonly DelegationCapability[]> = {
  provide_information: [
    "view_profile",
    "edit_profile_info",
    "view_documents",
    "upload_documents",
    "view_compliance_status",
    "assist_kyc",
    "assist_kyb",
    "assist_accreditation",
  ],
  investment_decisions: [
    "view_investments",
    "view_capital_calls",
    "view_distributions",
    "view_financial_statements",
    "prepare_investment",
  ],
  tax_matters: [
    "view_tax_documents",
    "view_tax_returns",
    "prepare_individual_return",
    "review_individual_return",
    "manage_tax_workpapers",
    "request_tax_information",
    "deliver_tax_return",
  ],
  // A read-only banking summary only. Bank details, wire instructions and any
  // payment stay exactly where they are.
  banking_matters: ["view_banking_info"],
  // Exercised only through the signing chain: an accepted authority document,
  // the document types it names, and a fresh identity check each time.
  sign_documents: ["sign_specified_documents"],
  // Described in the limits note, so nothing can be inferred from it.
  other: [],
};

/** Permissions a power of attorney can never carry, whatever it says. */
export const POA_NEVER_CAPABILITIES: readonly DelegationCapability[] = [
  "initiate_investment",
  "view_wire_instructions",
  "approve_specified_actions",
];

/** What stays with the account holder and Harmonious, in plain words. */
export const POA_KEEPS_WITH_OWNER: readonly string[] = [
  "Moving money, approving payments or distributions",
  "Changing bank or wire details",
  "Completing someone else's identity check",
  "Changing sign-in security or adding people to the account",
  "Signing anything the document does not name",
];

/** Plain-language lines shown on screen for each listed power. */
export const POA_POWER_PLAIN: Record<PoaPower, string> = {
  sign_documents: "Sign the documents the power of attorney names, with a fresh identity check each time",
  investment_decisions: "See investments, capital calls and statements, and prepare investment paperwork",
  provide_information: "Look at the profile and documents, add or correct details, and answer questions",
  tax_matters: "Handle tax paperwork: see documents and returns, prepare and review them, request information",
  banking_matters: "See a read-only summary of banking details. Cannot change bank or wire details",
  other: "Only what the limits note describes, which grants no platform permission by itself",
};

function isPoaPower(value: unknown): value is PoaPower {
  return typeof value === "string" && (POA_POWERS as readonly string[]).includes(value);
}

/** The permissions an accepted document's listed powers amount to. Deny by default. */
export function poaCapabilities(powers: readonly string[]): DelegationCapability[] {
  const out = new Set<DelegationCapability>();
  for (const power of powers) {
    if (!isPoaPower(power)) continue;
    for (const capability of POA_POWER_CAPABILITIES[power]) {
      if (isDelegationCapability(capability)) out.add(capability);
    }
  }
  return DELEGATION_CAPABILITIES.filter((c) => out.has(c));
}

/** The highest authority level the listed powers need. Never grants anything itself. */
export function poaAuthorityLevel(powers: readonly string[]): AuthorityLevel | null {
  const caps = poaCapabilities(powers);
  if (!caps.length) return null;
  let level: AuthorityLevel = AUTHORITY_LEVELS[0];
  for (const cap of caps) {
    const needed = CAPABILITY_MIN_AUTHORITY[cap];
    if (authorityAtLeast(needed, level)) level = needed;
  }
  return level;
}

/** Plain lines for the card: what the named person may do. */
export function poaPlainPowers(powers: readonly string[], limitsNote?: string | null): string[] {
  const lines = powers.filter(isPoaPower).map((p) => POA_POWER_PLAIN[p]);
  if (powers.includes("other") && limitsNote?.trim()) {
    lines.push(`Also described in the limits note: ${limitsNote.trim()}`);
  }
  return lines;
}

/** Signing needs the document to name which document types it covers. */
export function poaCoveredTypesBlocker(powers: readonly string[], types: readonly string[]): string | null {
  for (const t of types) {
    if (!(SIGNABLE_DOCUMENT_TYPES as readonly string[]).includes(t)) return "Choose a document type from the listed ones.";
  }
  if (new Set(types).size !== types.length) return "Each document type should be chosen once.";
  if (powers.includes("sign_documents") && types.length === 0) {
    return "Say which document types the power of attorney lets them sign.";
  }
  if (!powers.includes("sign_documents") && types.length > 0) {
    return "Document types are only needed when signing is one of the powers.";
  }
  return null;
}

export type PoaAuthorityState =
  | "no_record"
  | "not_linked"
  | "awaiting_agent"
  | "starts_later"
  | "active"
  | "ended";

export interface PoaAuthorityView {
  state: PoaAuthorityState;
  label: string;
  detail: string;
}

/**
 * What the named person can do right now. A record only ever becomes authority
 * through a live, accepted delegation for a linked account.
 */
export function poaAuthorityView(
  record: { status: string; effective_on: string; expires_on: string | null; agent_user_id: string | null } | null,
  delegation: { status: string; revoked_at: string | null; effective_at: string | null; expires_at: string | null; acceptance_state: string } | null,
  now = new Date(),
): PoaAuthorityView {
  if (!record) return { state: "no_record", label: "Nothing on file", detail: "No power of attorney has been added for this account." };
  if (record.status === "revoked") {
    return { state: "ended", label: "Ended", detail: "This authorization no longer opens anything." };
  }
  if (record.status !== "accepted") {
    return {
      state: "no_record",
      label: record.status === "pending_review" ? "Waiting for Harmonious review" : "No authority",
      detail: "A power of attorney opens nothing until Harmonious has accepted it.",
    };
  }
  if (!record.agent_user_id) {
    return {
      state: "not_linked",
      label: "Not linked to an account yet",
      detail: "We can't open anything for them until their account is matched to the name in the document.",
    };
  }
  if (!delegation) {
    return { state: "not_linked", label: "Not linked to an account yet", detail: "No authorization has been created from this document." };
  }
  const nowMs = now.getTime();
  const ended =
    delegation.status !== "active" ||
    !!delegation.revoked_at ||
    (delegation.expires_at ? new Date(delegation.expires_at).getTime() <= nowMs : false);
  if (ended) return { state: "ended", label: "Ended", detail: "This authorization no longer opens anything." };
  if (delegation.acceptance_state !== "accepted" && delegation.acceptance_state !== "not_required") {
    return {
      state: "awaiting_agent",
      label: "Waiting for them to accept",
      detail: "Nothing opens until the person named in the document accepts the grant.",
    };
  }
  if (delegation.effective_at && new Date(delegation.effective_at).getTime() > nowMs) {
    return {
      state: "starts_later",
      label: "Accepted, starts later",
      detail: `Opens on ${new Date(delegation.effective_at).toLocaleDateString("en-US")}.`,
    };
  }
  const until = record.expires_on ? new Date(`${record.expires_on}T23:59:59`).toLocaleDateString("en-US") : null;
  return {
    state: "active",
    label: "Active",
    detail: until ? `Runs until ${until}.` : "Runs until the document is revoked or replaced.",
  };
}

/** Guard used by tests: the never-granted list really is unreachable. */
export function poaNeverGrantedHolds(powers: readonly string[]): boolean {
  const caps = new Set(poaCapabilities(powers));
  for (const blocked of POA_NEVER_CAPABILITIES) if (caps.has(blocked)) return false;
  for (const action of BLOCKED_TRANSACTION_ACTIONS) if (caps.has(action as DelegationCapability)) return false;
  return true;
}
