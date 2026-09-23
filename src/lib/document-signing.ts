/**
 * Pure rules for the Box-connected signing experience. No database, no Box
 * calls — everything here is decidable from values, so it can be tested
 * directly and reused by the server, the investor app and Operations.
 *
 * Box remains the authoritative repository and the signing ceremony. These
 * rules only decide who may open a session, what a signature record means,
 * and what may safely be shown in a browser.
 */

/** Capacity a person signs in. Never inferred from an email address. */
export const SIGNER_CAPACITIES = [
  "individual",
  "joint_owner",
  "authorized_signatory",
  "trustee",
  "authorized_representative",
  "general_partner",
  "custodian",
  "other",
] as const;
export type SignerCapacity = (typeof SIGNER_CAPACITIES)[number];

export const CAPACITY_LABELS: Record<SignerCapacity, string> = {
  individual: "Individual",
  joint_owner: "Joint owner",
  authorized_signatory: "Authorized signatory",
  trustee: "Trustee",
  authorized_representative: "Authorized representative",
  general_partner: "General partner",
  custodian: "Custodian",
  other: "Other authorized signer",
};

/** Per-signer lifecycle. Mirrors what Box Sign reports, nothing invented. */
export const SIGNER_STATUSES = [
  "pending",
  "sent",
  "viewed",
  "signed",
  "declined",
  "expired",
  "cancelled",
  "error",
] as const;
export type SignerStatus = (typeof SIGNER_STATUSES)[number];

export const SIGNER_STATUS_LABELS: Record<SignerStatus, string> = {
  pending: "Not sent",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  error: "Error",
};

/** Document-level state, derived only from the signer rows. */
export type ExecutionState =
  | "not_sent"
  | "out_for_signature"
  | "partially_signed"
  | "executed"
  | "declined"
  | "expired"
  | "cancelled"
  | "error";

export interface SignerLike {
  status: SignerStatus | string;
  required?: boolean;
}

/**
 * A document is executed only when every required signer has signed.
 * A missing or empty signer list is never treated as executed.
 */
export function executionState(signers: readonly SignerLike[]): ExecutionState {
  const required = signers.filter((s) => s.required !== false);
  if (required.length === 0) return "not_sent";

  const statuses = required.map((s) => String(s.status));
  if (statuses.some((s) => s === "error")) return "error";
  if (statuses.some((s) => s === "declined")) return "declined";
  if (statuses.some((s) => s === "cancelled")) return "cancelled";
  if (statuses.some((s) => s === "expired")) return "expired";
  if (statuses.every((s) => s === "signed")) return "executed";
  if (statuses.some((s) => s === "signed")) return "partially_signed";
  if (statuses.every((s) => s === "pending")) return "not_sent";
  return "out_for_signature";
}

export const EXECUTION_LABELS: Record<ExecutionState, string> = {
  not_sent: "Signature required",
  out_for_signature: "Awaiting signature",
  partially_signed: "Awaiting remaining signatures",
  executed: "Signed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  error: "Needs attention",
};

/** Box Sign request status -> our per-signer status. Never guesses "signed". */
export function signerStatusFromBox(
  requestStatus: string,
  signer: { decision?: string | null; viewed?: boolean } = {},
): SignerStatus {
  const decision = String(signer.decision ?? "").toLowerCase();
  if (decision === "signed") return "signed";
  if (decision === "declined") return "declined";

  const status = String(requestStatus ?? "").toLowerCase();
  if (status === "signed" || status === "completed") return "signed";
  if (status === "declined") return "declined";
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "expired";
  if (status.startsWith("error")) return "error";
  if (status === "viewed" || signer.viewed) return "viewed";
  if (status === "sent" || status === "created") return "sent";
  return "sent";
}

/**
 * The capacities a subscription of this tax classification requires.
 * Used to seed signer rows; additional signers are added deliberately, never
 * inferred from an email domain.
 */
export function requiredCapacities(taxClassification: string | null | undefined): SignerCapacity[] {
  switch (String(taxClassification ?? "individual")) {
    case "joint_tenants":
    case "tenants_in_common":
      return ["joint_owner"];
    case "llc":
    case "s_corp":
    case "c_corp":
    case "partnership":
      return ["authorized_signatory"];
    case "trust":
      return ["trustee"];
    case "ira":
      return ["authorized_representative"];
    default:
      return ["individual"];
  }
}

/** Reasons a signing session may not be opened. Order is deliberate. */
export type RefusalReason =
  | "not_your_document"
  | "document_not_in_offering"
  | "no_subscription"
  | "signature_not_required"
  | "not_a_required_signer"
  | "already_signed"
  | "request_cancelled"
  | "request_expired"
  | "version_superseded"
  | "provider_unavailable";

export const REFUSAL_MESSAGES: Record<RefusalReason, string> = {
  not_your_document: "This agreement belongs to another investor.",
  document_not_in_offering: "This document is not part of your fund.",
  no_subscription: "Complete your subscription details before signing.",
  signature_not_required: "This document does not require a signature.",
  not_a_required_signer: "You are not a required signer on this agreement.",
  already_signed: "You have already signed this agreement.",
  request_cancelled: "This signing request was cancelled. Ask the Harmonious team to reissue it.",
  request_expired: "This signing request expired. Ask the Harmonious team to reissue it.",
  version_superseded:
    "A newer version of this document was issued. Ask the Harmonious team to reissue your signing request.",
  provider_unavailable: "Electronic signing is unavailable right now. Please try again shortly.",
};

export interface SessionRequest {
  /** Does the application actually belong to the signed-in person? */
  applicationBelongsToUser: boolean;
  /** Does the document belong to the application's offering? */
  documentInOffering: boolean;
  hasSubscription: boolean;
  requiresSignature: boolean;
  /** Is the signed-in person a required signer on this exact document? */
  isRequiredSigner: boolean;
  signerStatus?: SignerStatus | string | null;
  /** Box file version currently held by the source document, if known. */
  currentSourceVersionId?: string | null;
  /** Box file version this outstanding request was locked to, if any. */
  lockedSourceVersionId?: string | null;
  providerConfigured: boolean;
}

/**
 * Decides whether a signing session may be opened. The browser never supplies
 * a Box file id or a signature-request id: the caller resolves those from the
 * authenticated person first and passes the resolved facts here.
 */
export function refuseSession(input: SessionRequest): RefusalReason | null {
  if (!input.applicationBelongsToUser) return "not_your_document";
  if (!input.documentInOffering) return "document_not_in_offering";
  if (!input.requiresSignature) return "signature_not_required";
  if (!input.hasSubscription) return "no_subscription";
  if (!input.isRequiredSigner) return "not_a_required_signer";

  const status = String(input.signerStatus ?? "pending");
  if (status === "signed") return "already_signed";
  if (status === "cancelled") return "request_cancelled";
  if (status === "expired") return "request_expired";

  if (
    input.lockedSourceVersionId &&
    input.currentSourceVersionId &&
    input.lockedSourceVersionId !== input.currentSourceVersionId
  ) {
    return "version_superseded";
  }

  if (!input.providerConfigured) return "provider_unavailable";
  return null;
}

/**
 * A signing request is locked to the exact Box file version it was sent with.
 * Editing the source document later must never change an outstanding request:
 * the outstanding one keeps its own version, and a new request is required.
 */
export function outstandingRequestIsStale(input: {
  lockedSourceVersionId: string | null | undefined;
  currentSourceVersionId: string | null | undefined;
}): boolean {
  if (!input.lockedSourceVersionId || !input.currentSourceVersionId) return false;
  return input.lockedSourceVersionId !== input.currentSourceVersionId;
}

/** Staff actions on a signing request, and the capability each one needs. */
export const SIGNING_ACTIONS = {
  resend: "prepare",
  reissue: "prepare",
  cancel: "review",
} as const;
export type SigningAction = keyof typeof SIGNING_ACTIONS;

/** Completed signature history is never rewritten, by anyone. */
export function staffActionAllowed(input: {
  action: SigningAction;
  capabilities: readonly string[];
  executionState: ExecutionState;
}): { allowed: boolean; reason?: string } {
  const needed = `documents:${SIGNING_ACTIONS[input.action]}`;
  if (!input.capabilities.includes(needed)) {
    return { allowed: false, reason: "You don't have that permission." };
  }
  if (input.executionState === "executed") {
    return { allowed: false, reason: "This agreement is executed; its history cannot be changed." };
  }
  if (input.action === "cancel" && input.executionState === "cancelled") {
    return { allowed: false, reason: "This request is already cancelled." };
  }
  return { allowed: true };
}

/** What a browser may see about a signer. No Box ids, no embed URLs. */
export interface PublicSigner {
  id: string;
  name: string;
  email: string;
  capacity: SignerCapacity | string;
  capacityLabel: string;
  status: SignerStatus | string;
  statusLabel: string;
  order: number;
  required: boolean;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
}

export function publicSigner(row: any): PublicSigner {
  const capacity = String(row?.signer_capacity ?? "individual");
  const status = String(row?.status ?? "pending");
  return {
    id: String(row?.id ?? ""),
    name: String(row?.signer_name ?? ""),
    email: String(row?.signer_email ?? ""),
    capacity,
    capacityLabel: CAPACITY_LABELS[capacity as SignerCapacity] ?? "Signer",
    status,
    statusLabel: SIGNER_STATUS_LABELS[status as SignerStatus] ?? status,
    order: Number(row?.signing_order ?? 1),
    required: row?.required !== false,
    sentAt: row?.sent_at ?? null,
    viewedAt: row?.viewed_at ?? null,
    signedAt: row?.signed_at ?? null,
    declinedAt: row?.declined_at ?? null,
  };
}
