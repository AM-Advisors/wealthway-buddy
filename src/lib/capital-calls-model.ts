/**
 * Fund Administration Phase C — pure capital-call, funding and cash-receipt rules.
 *
 * No database access, no authorization, no side effects. This module decides
 * how much is called, what a bank transaction may legitimately be matched to,
 * which funding exception a variance represents, and — crucially — whether an
 * investment may be described as FUNDED.
 *
 * Deny by default. Funded is never a UI state, never a self-certification and
 * never an onboarding flag: it is derived from posted accounting records only.
 */

// --------------------------------------------------------------- lifecycle

/** The authoritative Phase C lifecycle. Order matters; each step has a source. */
export const FUNDING_LIFECYCLE = [
  "invited",
  "onboarding",
  "submitted",
  "harmonious_review",
  "subscription_accepted",
  "admitted",
  "funding_required",
  "funding_pending",
  "cash_detected",
  "reconciliation_review",
  "cash_confirmed",
  "accounting_posted",
  "funded",
] as const;
export type FundingLifecycleStage = (typeof FUNDING_LIFECYCLE)[number];

export const LIFECYCLE_LABELS: Record<FundingLifecycleStage, string> = {
  invited: "Invited",
  onboarding: "Onboarding",
  submitted: "Submitted",
  harmonious_review: "Harmonious review",
  subscription_accepted: "Subscription accepted",
  admitted: "Admitted",
  funding_required: "Funding required",
  funding_pending: "Funding pending",
  cash_detected: "Cash detected",
  reconciliation_review: "Reconciliation review",
  cash_confirmed: "Cash confirmed",
  accounting_posted: "Accounting posted",
  funded: "Funded",
};

export type LifecycleFacts = {
  invited: boolean;
  onboardingStarted: boolean;
  submittedForReview: boolean;
  inHarmoniousReview: boolean;
  subscriptionAcceptedAt: string | null;
  admittedAt: string | null;
  calledCents: number;
  /** Informational only — the investor said they sent money. */
  investorInitiatedAt: string | null;
  /** Bank transactions seen against the fund and proposed to this investor. */
  cashDetectedCents: number;
  /** A proposed match is sitting in reconciliation review. */
  inReconciliationReview: boolean;
  /** Reconciliation approved by Harmonious. */
  cashConfirmedCents: number;
  /** Cash that reached a POSTED journal entry. */
  postedContributionCents: number;
};

/**
 * The single place the platform decides "where is this investor". Derived from
 * authoritative facts only; a self-report can never push the stage past
 * `funding_pending`.
 */
export function deriveLifecycleStage(facts: LifecycleFacts): FundingLifecycleStage {
  const called = Math.max(0, Number(facts.calledCents) || 0);
  const posted = Math.max(0, Number(facts.postedContributionCents) || 0);
  const confirmed = Math.max(0, Number(facts.cashConfirmedCents) || 0);
  const detected = Math.max(0, Number(facts.cashDetectedCents) || 0);

  if (called > 0 && posted >= called) return "funded";
  if (posted > 0) return "accounting_posted";
  if (confirmed > 0) return "cash_confirmed";
  if (facts.inReconciliationReview) return "reconciliation_review";
  if (detected > 0) return "cash_detected";
  if (facts.investorInitiatedAt) return "funding_pending";
  if (called > 0) return "funding_required";
  if (facts.admittedAt) return "admitted";
  if (facts.subscriptionAcceptedAt) return "subscription_accepted";
  if (facts.inHarmoniousReview) return "harmonious_review";
  if (facts.submittedForReview) return "submitted";
  if (facts.onboardingStarted) return "onboarding";
  return "invited";
}

/**
 * Authoritative funded test. Posted accounting is the only evidence accepted;
 * an onboarding row, a manager click or an investor statement never qualify.
 */
export function isAuthoritativelyFunded(input: {
  calledCents: number;
  postedContributionCents: number;
}): boolean {
  const called = Number(input.calledCents) || 0;
  const posted = Number(input.postedContributionCents) || 0;
  if (called <= 0) return false;
  return posted >= called;
}

// ------------------------------------------------------------ capital calls

export const CAPITAL_CALL_STATUSES = [
  "draft",
  "requested",
  "in_review",
  "published",
  "superseded",
  "cancelled",
  "closed",
] as const;
export type CapitalCallStatus = (typeof CAPITAL_CALL_STATUSES)[number];

export const CAPITAL_CALL_TRANSITIONS: Record<CapitalCallStatus, readonly CapitalCallStatus[]> = {
  draft: ["requested", "in_review", "cancelled"],
  requested: ["in_review", "draft", "cancelled"],
  in_review: ["published", "draft", "cancelled"],
  published: ["superseded", "closed"],
  superseded: [],
  cancelled: [],
  closed: [],
};

export function capitalCallTransitionError(
  from: string,
  to: CapitalCallStatus,
): string | null {
  const allowed = CAPITAL_CALL_TRANSITIONS[from as CapitalCallStatus];
  if (!allowed) return `Unknown capital call status "${from}".`;
  if (!allowed.includes(to)) {
    return `A capital call cannot move from ${from} to ${to}.`;
  }
  return null;
}

export type CallActorRole = "harmonious" | "manager" | "investor" | "unknown";

/**
 * Maker/checker. A fund manager may prepare and request a call for their own
 * fund; only Harmonious publishes. No configurable manager-publish authority
 * exists yet, so it is refused rather than assumed.
 */
export function canActOnCapitalCall(
  role: CallActorRole,
  action: "prepare" | "request" | "review" | "publish" | "supersede" | "cancel",
  options: { managerPublishAuthority?: boolean } = {},
): { allowed: boolean; reason: string | null } {
  if (role === "harmonious") return { allowed: true, reason: null };
  if (role === "manager") {
    if (action === "prepare" || action === "request") return { allowed: true, reason: null };
    if (action === "publish" && options.managerPublishAuthority === true) {
      return { allowed: true, reason: null };
    }
    return {
      allowed: false,
      reason: "Harmonious reviews and publishes capital calls; fund managers prepare and request them.",
    };
  }
  return { allowed: false, reason: "You are not permitted to act on capital calls." };
}

export type CallBasis = "percentage_of_commitment" | "fixed_amount";
export type CallType = "whole_fund" | "investor_specific";

export type CommitmentSnapshotLine = {
  positionId: string | null;
  onboardingId: string | null;
  investorUserId: string | null;
  investmentProfileId: string | null;
  displayName: string;
  commitmentCents: number;
  contributedCents: number;
  unfundedCommitmentCents: number;
};

export type CallLineDraft = CommitmentSnapshotLine & { calledCents: number };

/**
 * Compute the called amount per investor from the commitment snapshot taken at
 * generation time. Never calls more than the remaining unfunded commitment.
 */
export function computeCallLines(input: {
  basis: CallBasis;
  callType: CallType;
  percentageBps?: number | null;
  fixedAmountCents?: number | null;
  snapshot: CommitmentSnapshotLine[];
  includeOnly?: string[] | null;
}): { lines: CallLineDraft[]; totalCalledCents: number; problems: string[] } {
  const problems: string[] = [];
  const include = input.includeOnly?.length ? new Set(input.includeOnly) : null;
  if (input.callType === "investor_specific" && !include) {
    problems.push("An investor-specific call must name the investors it applies to.");
  }
  if (input.basis === "percentage_of_commitment") {
    const bps = Number(input.percentageBps ?? 0);
    if (!Number.isFinite(bps) || bps <= 0) problems.push("Set a percentage greater than zero.");
    if (bps > 10000) problems.push("A single call cannot exceed 100% of commitment.");
  } else {
    const fixed = Number(input.fixedAmountCents ?? 0);
    if (!Number.isFinite(fixed) || fixed <= 0) problems.push("Set an amount greater than zero.");
  }

  const scoped = input.snapshot.filter((line) => {
    if (!include) return true;
    const key = line.positionId ?? line.onboardingId ?? "";
    return include.has(key);
  });

  const lines: CallLineDraft[] = scoped.map((line) => {
    const raw =
      input.basis === "percentage_of_commitment"
        ? Math.round((Number(line.commitmentCents) * Number(input.percentageBps ?? 0)) / 10000)
        : Number(input.fixedAmountCents ?? 0);
    const capped = Math.max(0, Math.min(raw, Math.max(0, Number(line.unfundedCommitmentCents))));
    return { ...line, calledCents: capped };
  });

  const payable = lines.filter((l) => l.calledCents > 0);
  if (problems.length === 0 && payable.length === 0) {
    problems.push("This call would not ask any investor for money.");
  }
  return {
    lines: payable,
    totalCalledCents: payable.reduce((sum, l) => sum + l.calledCents, 0),
    problems,
  };
}

export type CallLineStatus = "outstanding" | "partially_funded" | "satisfied" | "waived" | "cancelled";

/**
 * A call line is only satisfied by authoritative cash. Partial cash stays
 * partial — it never rounds up to satisfied.
 */
export function callLineStatus(input: {
  calledCents: number;
  postedCents: number;
  waived?: boolean;
  cancelled?: boolean;
}): CallLineStatus {
  if (input.cancelled) return "cancelled";
  if (input.waived) return "waived";
  const called = Number(input.calledCents) || 0;
  const posted = Number(input.postedCents) || 0;
  if (called > 0 && posted >= called) return "satisfied";
  if (posted > 0) return "partially_funded";
  return "outstanding";
}

export function callLineSummary(input: {
  commitmentCents: number;
  previouslyContributedCents: number;
  calledCents: number;
  postedCents: number;
}) {
  const commitment = Number(input.commitmentCents) || 0;
  const previously = Number(input.previouslyContributedCents) || 0;
  const called = Number(input.calledCents) || 0;
  const posted = Number(input.postedCents) || 0;
  const contributedToDate = previously + posted;
  return {
    commitmentCents: commitment,
    previouslyContributedCents: previously,
    calledCents: called,
    receivedCents: posted,
    amountDueCents: Math.max(0, called - posted),
    contributedToDateCents: contributedToDate,
    unfundedCommitmentCents: Math.max(0, commitment - contributedToDate),
    status: callLineStatus({ calledCents: called, postedCents: posted }),
  };
}

// -------------------------------------------------- funding instructions

export const INSTRUCTION_STATUSES = [
  "draft",
  "pending_review",
  "released",
  "superseded",
  "revoked",
] as const;
export type InstructionStatus = (typeof INSTRUCTION_STATUSES)[number];

export const INSTRUCTION_TRANSITIONS: Record<InstructionStatus, readonly InstructionStatus[]> = {
  draft: ["pending_review", "revoked"],
  pending_review: ["released", "draft", "revoked"],
  released: ["superseded", "revoked"],
  superseded: [],
  revoked: [],
};

export function instructionTransitionError(from: string, to: InstructionStatus): string | null {
  const allowed = INSTRUCTION_TRANSITIONS[from as InstructionStatus];
  if (!allowed) return `Unknown funding instruction status "${from}".`;
  if (!allowed.includes(to)) return `Funding instructions cannot move from ${from} to ${to}.`;
  return null;
}

/** A stable fingerprint of the money-moving fields only. */
export function instructionFingerprint(details: Record<string, unknown> | null | undefined): string {
  const source = details ?? {};
  const material = [
    "bankName",
    "bank_name",
    "routingNumber",
    "routing_number",
    "accountNumber",
    "account_number",
    "swift",
    "iban",
    "beneficiary",
    "beneficiaryName",
    "beneficiary_name",
    "reference",
    "intermediary",
  ];
  const parts = material
    .map((key) => {
      const value = (source as Record<string, unknown>)[key];
      return value === undefined || value === null ? null : `${key}=${String(value).trim().toLowerCase()}`;
    })
    .filter((p): p is string => p !== null)
    .sort();
  return parts.join("|");
}

/** Changing any money-moving field invalidates an existing release approval. */
export function instructionChangeInvalidatesRelease(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): boolean {
  return instructionFingerprint(previous) !== instructionFingerprint(next);
}

/** Investors only ever see the current released version. */
export function investorVisibleInstruction<T extends { releaseStatus: string; effectiveDate?: string | null }>(
  versions: T[],
  asOf?: string,
): T | null {
  const cutoff = asOf ? Date.parse(asOf) : Date.now();
  const released = versions.filter(
    (v) =>
      v.releaseStatus === "released" &&
      (!v.effectiveDate || Date.parse(String(v.effectiveDate)) <= cutoff),
  );
  return released[released.length - 1] ?? null;
}

// ------------------------------------------------------------ cash matching

export const FUNDING_EXCEPTION_KINDS = [
  "exact_match",
  "partial_funding",
  "overfunding",
  "underfunding",
  "duplicate_payment",
  "unidentified_cash",
  "wrong_fund",
  "wrong_bank_account",
  "incorrect_reference",
  "returned_wire",
  "reversed_transaction",
  "currency_discrepancy",
  "fees_deducted",
  "ambiguous_match",
] as const;
export type FundingExceptionKind = (typeof FUNDING_EXCEPTION_KINDS)[number];

export const FUNDING_EXCEPTION_LABELS: Record<FundingExceptionKind, string> = {
  exact_match: "Exact match",
  partial_funding: "Partial funding",
  overfunding: "Overfunding",
  underfunding: "Underfunding",
  duplicate_payment: "Duplicate payment",
  unidentified_cash: "Unidentified cash",
  wrong_fund: "Wrong fund",
  wrong_bank_account: "Wrong bank account",
  incorrect_reference: "Incorrect reference",
  returned_wire: "Returned wire",
  reversed_transaction: "Reversed transaction",
  currency_discrepancy: "Currency discrepancy",
  fees_deducted: "Fees deducted from wire",
  ambiguous_match: "Ambiguous — more than one possible investor",
};

export type IncomingCash = {
  transactionId: string;
  offeringId: string;
  bankAccountRef?: string | null;
  amountCents: number;
  currency?: string | null;
  postedOn: string;
  reference?: string | null;
  description?: string | null;
  providerTransactionId?: string | null;
  direction?: "credit" | "debit" | null;
  reversalOfTransactionId?: string | null;
};

export type FundingCandidate = {
  expectedFundingId: string;
  offeringId: string;
  onboardingId: string | null;
  positionId: string | null;
  investorUserId: string | null;
  investmentProfileId: string | null;
  capitalCallLineId: string | null;
  expectedAmountCents: number;
  receivedAmountCents: number;
  currency: string;
  referenceCode: string;
  bankAccountRef?: string | null;
};

export type MatchProposal = {
  kind: "match" | "exception";
  candidate: FundingCandidate | null;
  confidence: "high" | "medium" | "low" | "unmatched";
  exceptionKind: FundingExceptionKind | null;
  varianceCents: number;
  evidence: string[];
  conflicts: string[];
};

function normalise(text: string | null | undefined) {
  return String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Propose — never decide — a match between incoming cash and an expected
 * funding. Amount alone is deliberately not sufficient evidence: when two
 * investors could plausibly have sent the same money the result is an
 * ambiguity exception for Harmonious, not a guess.
 */
export function proposeFundingMatch(
  cash: IncomingCash,
  candidates: FundingCandidate[],
  options: { alreadyMatchedTransactionIds?: string[]; feeToleranceCents?: number } = {},
): MatchProposal {
  const evidence: string[] = [];
  const conflicts: string[] = [];
  const already = new Set(options.alreadyMatchedTransactionIds ?? []);
  const base = (kind: FundingExceptionKind, conflict: string): MatchProposal => ({
    kind: "exception",
    candidate: null,
    confidence: "unmatched",
    exceptionKind: kind,
    varianceCents: 0,
    evidence,
    conflicts: [...conflicts, conflict],
  });

  if (already.has(cash.transactionId)) {
    return base("duplicate_payment", "This bank transaction has already been applied.");
  }
  if (cash.reversalOfTransactionId) {
    return base("reversed_transaction", "This entry reverses an earlier transaction.");
  }
  if (cash.direction === "debit" || Number(cash.amountCents) < 0) {
    return base("returned_wire", "Money left the account rather than arriving.");
  }

  const inFund = candidates.filter((c) => c.offeringId === cash.offeringId);
  if (candidates.length > 0 && inFund.length === 0) {
    return base("wrong_fund", "The cash arrived in a fund with no matching expected funding.");
  }
  if (inFund.length === 0) {
    return base("unidentified_cash", "No expected funding matches this receipt.");
  }

  const cashCurrency = (cash.currency ?? "USD").toUpperCase();
  const haystack = normalise(`${cash.reference ?? ""} ${cash.description ?? ""}`);
  const referenced = inFund.filter((c) => haystack.includes(normalise(c.referenceCode)));

  let shortlist = referenced;
  if (referenced.length === 1) {
    evidence.push("Funding reference quoted on the wire");
  } else if (referenced.length > 1) {
    return base("ambiguous_match", "More than one expected funding quotes this reference.");
  } else {
    const sameAmount = inFund.filter((c) => c.expectedAmountCents === Number(cash.amountCents));
    if (sameAmount.length === 1) {
      shortlist = sameAmount;
      evidence.push("Amount matches exactly one expected funding");
    } else if (sameAmount.length > 1) {
      return base(
        "ambiguous_match",
        "Two or more investors are expected to send this exact amount — a human must decide.",
      );
    } else {
      return base("incorrect_reference", "No reference and no expected amount matches this receipt.");
    }
  }

  const candidate = shortlist[0]!;
  if (candidate.bankAccountRef && cash.bankAccountRef && candidate.bankAccountRef !== cash.bankAccountRef) {
    return {
      kind: "exception",
      candidate,
      confidence: "low",
      exceptionKind: "wrong_bank_account",
      varianceCents: 0,
      evidence,
      conflicts: ["Cash arrived in a different bank account than the released instructions."],
    };
  }
  if (candidate.currency.toUpperCase() !== cashCurrency) {
    return {
      kind: "exception",
      candidate,
      confidence: "low",
      exceptionKind: "currency_discrepancy",
      varianceCents: 0,
      evidence,
      conflicts: [`Expected ${candidate.currency}, received ${cashCurrency}.`],
    };
  }

  const outstanding = candidate.expectedAmountCents - candidate.receivedAmountCents;
  const variance = Number(cash.amountCents) - outstanding;
  const tolerance = Math.max(0, options.feeToleranceCents ?? 0);

  if (variance === 0) {
    return {
      kind: "match",
      candidate,
      confidence: referenced.length === 1 ? "high" : "medium",
      exceptionKind: "exact_match",
      varianceCents: 0,
      evidence,
      conflicts,
    };
  }
  if (variance < 0) {
    const short = Math.abs(variance);
    const kind: FundingExceptionKind =
      tolerance > 0 && short <= tolerance ? "fees_deducted" : "partial_funding";
    return {
      kind: "exception",
      candidate,
      confidence: "medium",
      exceptionKind: kind,
      varianceCents: variance,
      evidence,
      conflicts: [`Received ${short} cents less than the outstanding amount due.`],
    };
  }
  return {
    kind: "exception",
    candidate,
    confidence: "medium",
    exceptionKind: "overfunding",
    varianceCents: variance,
    evidence,
    conflicts: [`Received ${variance} cents more than the outstanding amount due.`],
  };
}

/** An accepted match still has to describe what happened to the expectation. */
export function expectedFundingStatus(input: {
  expectedAmountCents: number;
  receivedAmountCents: number;
  cancelled?: boolean;
}): "expected" | "partially_received" | "received" | "cancelled" {
  if (input.cancelled) return "cancelled";
  const expected = Number(input.expectedAmountCents) || 0;
  const received = Number(input.receivedAmountCents) || 0;
  if (expected > 0 && received >= expected) return "received";
  if (received > 0) return "partially_received";
  return "expected";
}

/**
 * A self-report is informational. This is the only answer the platform accepts
 * when anyone — investor or manager — claims money has arrived.
 */
export function selfReportEffect(): {
  marksFunded: false;
  marksCashReceived: false;
  marksReconciled: false;
  marksPosted: false;
  recordedAs: "informational_notice";
} {
  return {
    marksFunded: false,
    marksCashReceived: false,
    marksReconciled: false,
    marksPosted: false,
    recordedAs: "informational_notice",
  };
}

// ------------------------------------------------------- closing dashboard

export const CLOSING_BUCKETS = [
  "onboarding_incomplete",
  "compliance_review",
  "subscription_awaiting_review",
  "accepted_not_funded",
  "partially_funded",
  "cash_exception",
  "funded_reconciled",
  "accounting_pending",
  "complete",
] as const;
export type ClosingBucket = (typeof CLOSING_BUCKETS)[number];

export const CLOSING_BUCKET_LABELS: Record<ClosingBucket, string> = {
  onboarding_incomplete: "Onboarding incomplete",
  compliance_review: "Compliance review",
  subscription_awaiting_review: "Subscription awaiting review",
  accepted_not_funded: "Accepted / not funded",
  partially_funded: "Partially funded",
  cash_exception: "Cash exception",
  funded_reconciled: "Funded / reconciled",
  accounting_pending: "Accounting pending",
  complete: "Complete",
};

export function closingBucket(input: {
  stage: FundingLifecycleStage;
  openExceptions: number;
  requirementsComplete: boolean;
  inComplianceReview: boolean;
  calledCents: number;
  confirmedCents: number;
  postedCents: number;
  closedAt?: string | null;
}): ClosingBucket {
  if (input.openExceptions > 0) return "cash_exception";
  if (input.closedAt && isAuthoritativelyFunded({ calledCents: input.calledCents, postedContributionCents: input.postedCents })) {
    return "complete";
  }
  if (!input.requirementsComplete) {
    return input.inComplianceReview ? "compliance_review" : "onboarding_incomplete";
  }
  if (input.stage === "submitted" || input.stage === "harmonious_review") {
    return "subscription_awaiting_review";
  }
  if (input.confirmedCents > 0 && input.postedCents < input.confirmedCents) return "accounting_pending";
  if (isAuthoritativelyFunded({ calledCents: input.calledCents, postedContributionCents: input.postedCents })) {
    return "funded_reconciled";
  }
  if (input.postedCents > 0 || input.confirmedCents > 0) return "partially_funded";
  return "accepted_not_funded";
}

export const MANAGER_BUCKETS = [
  "invited",
  "onboarding",
  "subscription_pending",
  "admitted",
  "funding_pending",
  "partially_funded",
  "funded",
  "needs_information",
] as const;
export type ManagerBucket = (typeof MANAGER_BUCKETS)[number];

export function managerBucket(input: {
  stage: FundingLifecycleStage;
  openManagerExceptions: number;
  calledCents: number;
  postedCents: number;
}): ManagerBucket {
  if (input.openManagerExceptions > 0) return "needs_information";
  if (isAuthoritativelyFunded({ calledCents: input.calledCents, postedContributionCents: input.postedCents })) {
    return "funded";
  }
  if (input.postedCents > 0) return "partially_funded";
  switch (input.stage) {
    case "invited":
      return "invited";
    case "onboarding":
    case "submitted":
      return "onboarding";
    case "harmonious_review":
      return "subscription_pending";
    case "subscription_accepted":
    case "admitted":
      return "admitted";
    default:
      return "funding_pending";
  }
}

const MANAGER_FORBIDDEN_KEYS = [
  "bankTransaction",
  "bankTransactions",
  "bankAccountRef",
  "instructions",
  "fundingInstructions",
  "details",
  "kyc",
  "kycEvidence",
  "aml",
  "taxDocuments",
  "identityPayload",
  "providerPayload",
  "workpapers",
  "evidence",
  "reference",
  "referenceCode",
];

/** Managers get progress, never cash plumbing, evidence or investor documents. */
export function managerSafeFunding<T extends Record<string, any>>(view: T): T {
  const clone: Record<string, any> = Array.isArray(view) ? [...view] : { ...view };
  for (const key of MANAGER_FORBIDDEN_KEYS) delete clone[key];
  for (const [key, value] of Object.entries(clone)) {
    if (value && typeof value === "object") {
      clone[key] = Array.isArray(value)
        ? value.map((v) => (v && typeof v === "object" ? managerSafeFunding(v) : v))
        : managerSafeFunding(value);
    }
  }
  return clone as T;
}
