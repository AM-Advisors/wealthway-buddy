/**
 * Fund Administration Phase D — pure distribution, withholding and outbound
 * payment rules.
 *
 * No database access, no authorization lookups, no side effects. This module
 * decides what an investor is economically entitled to, what must be withheld,
 * whether a batch balances to the cent, who may approve what, whether a
 * destination may be paid, and whether a provider event may be believed.
 *
 * Deny by default. "Paid" is never a screen state: it is derived from a
 * correlated provider confirmation plus reconciled, posted accounting.
 */

// ------------------------------------------------------------------- types

export const DISTRIBUTION_TYPES = [
  "ordinary",
  "return_of_capital",
  "income",
  "realized_proceeds",
  "interest",
  "dividend",
  "redemption",
  "liquidation",
  "tax_distribution",
  "other",
] as const;
export type DistributionType = (typeof DISTRIBUTION_TYPES)[number];

export const DISTRIBUTION_TYPE_LABELS: Record<DistributionType, string> = {
  ordinary: "Ordinary distribution",
  return_of_capital: "Return of capital",
  income: "Income distribution",
  realized_proceeds: "Realized gain / proceeds",
  interest: "Interest distribution",
  dividend: "Dividend distribution",
  redemption: "Redemption / withdrawal",
  liquidation: "Liquidation distribution",
  tax_distribution: "Tax distribution",
  other: "Other approved type",
};

/** Accounting and tax treatment differ by type; nothing is assumed uniform. */
export const DISTRIBUTION_TREATMENT: Record<
  DistributionType,
  { reducesCapital: boolean; defaultCharacter: string; taxReportable: boolean }
> = {
  ordinary: { reducesCapital: true, defaultCharacter: "unclassified", taxReportable: true },
  return_of_capital: { reducesCapital: true, defaultCharacter: "return_of_capital", taxReportable: true },
  income: { reducesCapital: false, defaultCharacter: "ordinary_income", taxReportable: true },
  realized_proceeds: { reducesCapital: true, defaultCharacter: "capital_gain", taxReportable: true },
  interest: { reducesCapital: false, defaultCharacter: "interest", taxReportable: true },
  dividend: { reducesCapital: false, defaultCharacter: "dividend", taxReportable: true },
  redemption: { reducesCapital: true, defaultCharacter: "return_of_capital", taxReportable: true },
  liquidation: { reducesCapital: true, defaultCharacter: "liquidation", taxReportable: true },
  tax_distribution: { reducesCapital: true, defaultCharacter: "ordinary_income", taxReportable: true },
  other: { reducesCapital: true, defaultCharacter: "unclassified", taxReportable: true },
};

// ------------------------------------------------------------- state machines

export const BATCH_STATUSES = [
  "draft",
  "proposed",
  "harmonious_review",
  "manager_approval",
  "investor_confirmation",
  "final_approval",
  "approved",
  "executing",
  "completed",
  "superseded",
  "cancelled",
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

const BATCH_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  draft: ["proposed", "cancelled"],
  proposed: ["harmonious_review", "draft", "cancelled"],
  harmonious_review: ["manager_approval", "draft", "cancelled"],
  manager_approval: ["investor_confirmation", "final_approval", "harmonious_review", "cancelled"],
  investor_confirmation: ["final_approval", "manager_approval", "cancelled"],
  final_approval: ["approved", "harmonious_review", "cancelled"],
  approved: ["executing", "superseded", "cancelled"],
  executing: ["completed", "superseded"],
  completed: ["superseded"],
  superseded: [],
  cancelled: [],
};

export function batchTransitionError(from: BatchStatus, to: BatchStatus): string | null {
  if (from === to) return null;
  if (!BATCH_TRANSITIONS[from]?.includes(to)) {
    return `A distribution cannot move from ${from} to ${to}.`;
  }
  return null;
}

export const PAYMENT_STATUSES = [
  "not_started",
  "ready",
  "submitted",
  "confirmed",
  "failed",
  "returned",
  "reversed",
  "cancelled",
] as const;
export type DistributionPaymentStatus = (typeof PAYMENT_STATUSES)[number];

const PAYMENT_TRANSITIONS: Record<DistributionPaymentStatus, DistributionPaymentStatus[]> = {
  not_started: ["ready", "cancelled"],
  ready: ["submitted", "cancelled"],
  submitted: ["confirmed", "failed", "returned", "cancelled"],
  confirmed: ["returned", "reversed"],
  failed: [],
  returned: [],
  reversed: [],
  cancelled: [],
};

export function paymentTransitionError(
  from: DistributionPaymentStatus,
  to: DistributionPaymentStatus,
): string | null {
  if (from === to) return null;
  if (!PAYMENT_TRANSITIONS[from]?.includes(to)) {
    return `A payment cannot move from ${from} to ${to}.`;
  }
  return null;
}

export const INSTRUCTION_STATUSES = [
  "draft",
  "pending_verification",
  "pending_review",
  "approved",
  "rejected",
  "superseded",
  "revoked",
] as const;
export type PaymentInstructionStatus = (typeof INSTRUCTION_STATUSES)[number];

const INSTRUCTION_TRANSITIONS: Record<PaymentInstructionStatus, PaymentInstructionStatus[]> = {
  draft: ["pending_verification", "rejected"],
  pending_verification: ["pending_review", "rejected"],
  pending_review: ["approved", "rejected"],
  approved: ["superseded", "revoked"],
  rejected: [],
  superseded: [],
  revoked: [],
};

export function paymentInstructionTransitionError(
  from: PaymentInstructionStatus,
  to: PaymentInstructionStatus,
): string | null {
  if (from === to) return null;
  if (!INSTRUCTION_TRANSITIONS[from]?.includes(to)) {
    return `A payment destination cannot move from ${from} to ${to}.`;
  }
  return null;
}

// ------------------------------------------------------------ entitlement

export type EntitlementInput = {
  positionId: string;
  investorUserId: string | null;
  investmentProfileId: string | null;
  displayName?: string | null;
  /** Authoritative, from commitment_events. */
  commitmentCents: number;
  contributedCents: number;
  /** Authoritative, from capital_accounts. */
  capitalAccountCents: number;
  /** Ownership used by the fund's approved economics, in basis points. */
  ownershipBps: number;
  /** Approved waterfall/carry output for this investor, when one exists. */
  waterfallCents?: number | null;
  classId?: string | null;
};

export type EntitlementBasis =
  | "allocation_run"
  | "waterfall"
  | "ownership_bps"
  | "capital_account"
  | "manual";

export type EntitlementLine = {
  positionId: string;
  investorUserId: string | null;
  investmentProfileId: string | null;
  displayName: string | null;
  classId: string | null;
  basis: EntitlementBasis;
  commitmentCents: number;
  contributedCents: number;
  capitalAccountCents: number;
  grossCents: number;
};

const round = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

/**
 * Turn an approved fund-level distributable amount into per-investor gross
 * entitlement. Nobody types investor amounts: they come from the fund's own
 * approved economics. The largest line absorbs rounding so the lines always
 * sum to exactly the declared amount.
 */
export function calculateEntitlements(input: {
  declaredAmountCents: number;
  distributionType: DistributionType;
  lines: EntitlementInput[];
  /** Prefer approved waterfall output when the fund has one. */
  useWaterfall?: boolean;
}): { lines: EntitlementLine[]; totalGrossCents: number; error: string | null } {
  const declared = round(input.declaredAmountCents);
  if (declared <= 0) {
    return { lines: [], totalGrossCents: 0, error: "Enter the amount being distributed." };
  }
  if (input.lines.length === 0) {
    return { lines: [], totalGrossCents: 0, error: "This fund has no investors to distribute to." };
  }

  const useWaterfall =
    input.useWaterfall === true &&
    input.lines.every((l) => typeof l.waterfallCents === "number" && Number.isFinite(l.waterfallCents));

  let basis: EntitlementBasis = useWaterfall ? "waterfall" : "ownership_bps";
  let weights: number[];

  if (useWaterfall) {
    weights = input.lines.map((l) => Math.max(0, round(l.waterfallCents ?? 0)));
  } else {
    const bpsTotal = input.lines.reduce((s, l) => s + Math.max(0, round(l.ownershipBps)), 0);
    if (bpsTotal > 0) {
      weights = input.lines.map((l) => Math.max(0, round(l.ownershipBps)));
    } else {
      basis = "capital_account";
      weights = input.lines.map((l) => Math.max(0, round(l.capitalAccountCents)));
    }
  }

  const weightTotal = weights.reduce((s, w) => s + w, 0);
  if (weightTotal <= 0) {
    return {
      lines: [],
      totalGrossCents: 0,
      error: "No approved economic basis exists to allocate this distribution.",
    };
  }

  const lines: EntitlementLine[] = input.lines.map((l, i) => ({
    positionId: l.positionId,
    investorUserId: l.investorUserId,
    investmentProfileId: l.investmentProfileId,
    displayName: l.displayName ?? null,
    classId: l.classId ?? null,
    basis,
    commitmentCents: round(l.commitmentCents),
    contributedCents: round(l.contributedCents),
    capitalAccountCents: round(l.capitalAccountCents),
    grossCents: Math.floor((declared * (weights[i] ?? 0)) / weightTotal),
  }));

  // Distribute the remainder to the largest weights, deterministically.
  let remainder = declared - lines.reduce((s, l) => s + l.grossCents, 0);
  const order = lines
    .map((_, i) => i)
    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0) || a - b);
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    const idx = order[cursor % order.length]!;
    lines[idx]!.grossCents += 1;
    remainder -= 1;
    cursor += 1;
  }

  return { lines, totalGrossCents: declared, error: null };
}

/** A manual override of economics is only ever allowed with reason + evidence + approval. */
export function manualAdjustmentError(input: {
  reason?: string | null;
  evidencePath?: string | null;
  approvedByUserId?: string | null;
  requestedByUserId?: string | null;
}): string | null {
  if (!input.reason || input.reason.trim().length < 8) {
    return "A manual change to an investor's economics needs a written reason.";
  }
  if (!input.evidencePath) {
    return "A manual change to an investor's economics needs supporting evidence.";
  }
  if (!input.approvedByUserId) {
    return "A manual change to an investor's economics needs Harmonious approval.";
  }
  if (input.approvedByUserId === input.requestedByUserId) {
    return "The person requesting a manual change cannot also approve it.";
  }
  return null;
}

// ------------------------------------------------------------- withholding

export const WITHHOLDING_TYPES = [
  "federal",
  "foreign_person",
  "backup",
  "state",
  "other",
] as const;
export type WithholdingType = (typeof WITHHOLDING_TYPES)[number];

export type WithholdingRule = {
  type: WithholdingType;
  jurisdiction?: string | null;
  rateBps: number;
  /** Which portion of the gross the rate applies to; defaults to all of it. */
  basisBps?: number;
  reason: string;
};

export type WithholdingLine = {
  type: WithholdingType;
  jurisdiction: string | null;
  basisCents: number;
  rateBps: number;
  amountCents: number;
  reason: string;
};

export type TaxFacts = {
  /** From the investor's tax profile — never inferred from citizenship alone. */
  documentationForm: string | null;
  isForeignPerson: boolean | null;
  backupWithholdingFlag: boolean;
  treatyRateBps: number | null;
  stateCode: string | null;
  tinOnFile: boolean;
};

/**
 * Compute withholding for one line from the fund's configured rules and the
 * investor's documented tax position. Missing documentation raises a reason,
 * never a guess.
 */
export function calculateWithholding(input: {
  grossCents: number;
  distributionType: DistributionType;
  rules: WithholdingRule[];
  tax: TaxFacts;
}): { lines: WithholdingLine[]; totalCents: number; notes: string[] } {
  const gross = Math.max(0, round(input.grossCents));
  const notes: string[] = [];
  const lines: WithholdingLine[] = [];

  if (input.tax.documentationForm === null || input.tax.documentationForm === "none_on_file") {
    notes.push("No tax documentation on file for this investor.");
  }

  for (const rule of input.rules) {
    if (rule.type === "foreign_person" && input.tax.isForeignPerson !== true) continue;
    if (rule.type === "backup" && !input.tax.backupWithholdingFlag) continue;
    if (rule.type === "state" && !input.tax.stateCode) continue;

    let rateBps = Math.max(0, round(rule.rateBps));
    if (rule.type === "foreign_person" && typeof input.tax.treatyRateBps === "number") {
      if (input.tax.documentationForm && input.tax.documentationForm !== "none_on_file") {
        rateBps = Math.max(0, round(input.tax.treatyRateBps));
      } else {
        notes.push("Treaty rate not applied: no valid tax documentation on file.");
      }
    }

    const basisCents = round((gross * Math.min(10000, rule.basisBps ?? 10000)) / 10000);
    const amountCents = round((basisCents * rateBps) / 10000);
    if (amountCents <= 0) continue;

    lines.push({
      type: rule.type,
      jurisdiction: rule.jurisdiction ?? null,
      basisCents,
      rateBps,
      amountCents,
      reason: rule.reason,
    });
  }

  const totalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  if (totalCents > gross) {
    notes.push("Withholding exceeds the gross distribution; Harmonious review required.");
  }
  return { lines, totalCents: Math.min(totalCents, gross), notes };
}

// ------------------------------------------------------------- batch balance

export type BatchLineAmounts = {
  grossCents: number;
  withholdingCents: number;
  feeCents: number;
  netCents: number;
};

export type BatchBalance = {
  balances: boolean;
  totalGrossCents: number;
  totalWithholdingCents: number;
  totalFeeCents: number;
  totalNetCents: number;
  declaredAmountCents: number;
  reserveCents: number;
  lineVarianceCents: number;
  declaredVarianceCents: number;
  problems: string[];
};

/**
 * gross − withholding − fees = net, and gross + reserve = the declared amount.
 * One unexplained cent blocks approval. That is the whole point.
 */
export function checkBatchBalance(input: {
  lines: BatchLineAmounts[];
  declaredAmountCents: number;
  reserveCents?: number;
}): BatchBalance {
  const totalGrossCents = input.lines.reduce((s, l) => s + round(l.grossCents), 0);
  const totalWithholdingCents = input.lines.reduce((s, l) => s + round(l.withholdingCents), 0);
  const totalFeeCents = input.lines.reduce((s, l) => s + round(l.feeCents), 0);
  const totalNetCents = input.lines.reduce((s, l) => s + round(l.netCents), 0);
  const reserveCents = round(input.reserveCents ?? 0);
  const declaredAmountCents = round(input.declaredAmountCents);

  const problems: string[] = [];

  for (const [i, l] of input.lines.entries()) {
    const expected = round(l.grossCents) - round(l.withholdingCents) - round(l.feeCents);
    if (expected !== round(l.netCents)) {
      problems.push(
        `Investor ${i + 1}: gross less withholding and fees is ${expected}, but the net payment is ${round(l.netCents)}.`,
      );
    }
  }

  const lineVarianceCents =
    totalGrossCents - totalWithholdingCents - totalFeeCents - totalNetCents;
  if (lineVarianceCents !== 0) {
    problems.push(
      `Gross less withholding and fees differs from the total net payments by ${lineVarianceCents} cents.`,
    );
  }

  const declaredVarianceCents = declaredAmountCents - reserveCents - totalGrossCents;
  if (declaredVarianceCents !== 0) {
    problems.push(
      `The investor allocations differ from the approved distribution amount by ${declaredVarianceCents} cents.`,
    );
  }

  return {
    balances: problems.length === 0,
    totalGrossCents,
    totalWithholdingCents,
    totalFeeCents,
    totalNetCents,
    declaredAmountCents,
    reserveCents,
    lineVarianceCents,
    declaredVarianceCents,
    problems,
  };
}

// -------------------------------------------------------------- authority

export type DistributionActorRole = "harmonious" | "manager" | "investor" | "unknown";

export type DistributionAction =
  | "prepare"
  | "request"
  | "review"
  | "manager_approve"
  | "investor_confirm"
  | "final_approve"
  | "execute"
  | "correct"
  | "cancel"
  | "resolve_exception";

/** Who may do what. Managers never bypass Harmonious final approval. */
export function canActOnDistribution(
  role: DistributionActorRole,
  action: DistributionAction,
): { allowed: boolean; reason?: string } {
  if (role === "harmonious") {
    if (action === "investor_confirm") {
      return { allowed: false, reason: "Only the investor can confirm their own details." };
    }
    return { allowed: true };
  }
  if (role === "manager") {
    if (action === "prepare" || action === "request" || action === "manager_approve") {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "A fund manager cannot review, finally approve, execute or correct a distribution.",
    };
  }
  if (role === "investor" && action === "investor_confirm") return { allowed: true };
  return { allowed: false, reason: "You do not have authority over this distribution." };
}

export type ApprovalActor = {
  userId: string;
  role: DistributionActorRole;
  /** A service/automation principal is never a human approver. */
  isServicePrincipal?: boolean;
};

export type ApprovalChainEntry = {
  step: "prepared" | "requested" | "reviewed" | "manager_approved" | "final_approved" | "executed";
  userId: string;
  isServicePrincipal?: boolean;
  at: string;
};

/**
 * Segregation of duties on outbound cash: the same human may not create and
 * finally approve and execute the same payment, and the final approver must be
 * a second human distinct from the preparer.
 */
export function makerCheckerError(
  chain: ApprovalChainEntry[],
  next: { step: ApprovalChainEntry["step"]; actor: ApprovalActor },
): string | null {
  if (next.actor.isServicePrincipal) {
    return "An automated process cannot approve or execute an outbound payment.";
  }
  const by = (step: ApprovalChainEntry["step"]) =>
    chain.filter((c) => c.step === step && !c.isServicePrincipal).map((c) => c.userId);

  const preparers = [...by("prepared"), ...by("requested")];
  const finalApprovers = by("final_approved");

  if (next.step === "final_approved") {
    if (preparers.includes(next.actor.userId)) {
      return "The person who prepared this distribution cannot give the final approval. A second authorised person is required.";
    }
    if (by("reviewed").includes(next.actor.userId) && preparers.length === 0) {
      return "A second authorised person is required for final approval.";
    }
  }

  if (next.step === "executed") {
    if (finalApprovers.length === 0) {
      return "This payment has no final approval and cannot be executed.";
    }
    if (preparers.includes(next.actor.userId) && finalApprovers.includes(next.actor.userId)) {
      return "The same person cannot prepare, approve and execute the same payment.";
    }
    const humans = new Set(
      chain.filter((c) => !c.isServicePrincipal).map((c) => c.userId).concat(next.actor.userId),
    );
    if (humans.size < 2) {
      return "Outbound payments require at least two authorised people.";
    }
  }

  return null;
}

// ----------------------------------------------------------- destinations

export type DestinationFields = {
  method: string;
  beneficiaryName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  routingNumber?: string | null;
  swift?: string | null;
  custodianAccount?: string | null;
  country?: string | null;
  currency?: string | null;
};

export const HIGH_RISK_FIELDS = [
  "accountNumber",
  "routingNumber",
  "swift",
  "beneficiaryName",
  "bankName",
  "custodianAccount",
] as const;

export function maskTail(value: string | null | undefined): string | null {
  const raw = String(value ?? "").replace(/\s|-/g, "");
  if (!raw) return null;
  return raw.length <= 4 ? `••••${raw}` : `••••${raw.slice(-4)}`;
}

/** Stable fingerprint of the paying destination — used to detect any change. */
export function destinationFingerprint(d: DestinationFields): string {
  const parts = [
    d.method,
    (d.beneficiaryName ?? "").trim().toLowerCase(),
    (d.bankName ?? "").trim().toLowerCase(),
    (d.accountNumber ?? "").replace(/\s|-/g, ""),
    (d.routingNumber ?? "").replace(/\s|-/g, ""),
    (d.swift ?? "").replace(/\s|-/g, "").toUpperCase(),
    (d.custodianAccount ?? "").replace(/\s|-/g, ""),
    (d.country ?? "").trim().toUpperCase(),
    (d.currency ?? "USD").trim().toUpperCase(),
  ];
  return parts.join("|");
}

/** Which high-risk fields changed between two destinations. */
export function changedDestinationFields(
  previous: DestinationFields | null,
  next: DestinationFields,
): string[] {
  if (!previous) return ["new_destination"];
  const changed: string[] = [];
  for (const field of HIGH_RISK_FIELDS) {
    const a = String((previous as any)[field] ?? "").replace(/\s|-/g, "").toLowerCase();
    const b = String((next as any)[field] ?? "").replace(/\s|-/g, "").toLowerCase();
    if (a !== b) changed.push(field);
  }
  if (previous.method !== next.method) changed.push("method");
  return changed;
}

/** Any high-risk destination change is a material financial event. */
export function isHighRiskChange(changedFields: string[]): boolean {
  return changedFields.some(
    (f) => f === "new_destination" || f === "method" || (HIGH_RISK_FIELDS as readonly string[]).includes(f),
  );
}

export const DEFAULT_COOLING_OFF_HOURS = 24;

export function coolingOffUntil(fromIso: string, hours = DEFAULT_COOLING_OFF_HOURS): string {
  return new Date(new Date(fromIso).getTime() + hours * 3_600_000).toISOString();
}

export function coolingOffSatisfied(input: {
  coolingOffUntil: string | null;
  nowIso: string;
  waivedBy?: string | null;
  waiverReason?: string | null;
  requestedBy?: string | null;
}): { satisfied: boolean; reason?: string } {
  if (!input.coolingOffUntil) return { satisfied: true };
  if (new Date(input.nowIso).getTime() >= new Date(input.coolingOffUntil).getTime()) {
    return { satisfied: true };
  }
  if (input.waivedBy) {
    if (!input.waiverReason || input.waiverReason.trim().length < 8) {
      return { satisfied: false, reason: "Waiving the cooling-off period needs a documented reason." };
    }
    if (input.waivedBy === input.requestedBy) {
      return {
        satisfied: false,
        reason: "The person who requested the change cannot waive its cooling-off period.",
      };
    }
    return { satisfied: true };
  }
  return {
    satisfied: false,
    reason: "This destination is inside its cooling-off period after a recent change.",
  };
}

/** The steps a high-risk destination change must complete, in order. */
export const INSTRUCTION_CHANGE_STEPS = [
  "requested",
  "stepup_verified",
  "verified",
  "harmonious_review",
  "approved",
] as const;
export type InstructionChangeStep = (typeof INSTRUCTION_CHANGE_STEPS)[number];

export function instructionChangeBlockers(state: {
  stepupVerifiedAt: string | null;
  verificationStatus: string;
  independentNoticeSentAt: string | null;
  harmoniousNotifiedAt: string | null;
  reviewedBy: string | null;
  requestedBy: string | null;
  approverUserId: string | null;
}): string[] {
  const blockers: string[] = [];
  if (!state.stepupVerifiedAt) blockers.push("Step-up authentication has not been completed.");
  if (state.verificationStatus !== "verified") {
    blockers.push("The new destination has not been independently verified.");
  }
  if (!state.independentNoticeSentAt) {
    blockers.push("The investor has not been notified through an independent channel.");
  }
  if (!state.harmoniousNotifiedAt) blockers.push("Harmonious has not been notified of this change.");
  if (!state.reviewedBy) blockers.push("Harmonious has not reviewed this change.");
  if (state.approverUserId && state.approverUserId === state.requestedBy) {
    blockers.push("The person who requested this change cannot approve it.");
  }
  return blockers;
}

/**
 * A destination change never silently updates work already approved: every
 * pending distribution on the old version must be revalidated.
 */
export function pendingDistributionsNeedingRevalidation(
  lines: { id: string; paymentInstructionId: string | null; approvalState: string; paymentState: string }[],
  supersededInstructionId: string,
): string[] {
  return lines
    .filter(
      (l) =>
        l.paymentInstructionId === supersededInstructionId &&
        l.paymentState !== "confirmed" &&
        l.paymentState !== "submitted" &&
        l.approvalState !== "cancelled",
    )
    .map((l) => l.id);
}

// ---------------------------------------------------------- execution gate

export type ExecutionFacts = {
  batchStatus: BatchStatus;
  batchBalances: boolean;
  economicAllocationApproved: boolean;
  managerApprovalRequired: boolean;
  managerApprovedBy: string | null;
  finalApprovedBy: string | null;
  investorConfirmationRequired: boolean;
  investorConfirmedAt: string | null;
  destinationStatus: PaymentInstructionStatus | null;
  destinationVerified: boolean;
  destinationCoolingOffUntil: string | null;
  destinationWaivedBy?: string | null;
  destinationWaiverReason?: string | null;
  destinationRequestedBy?: string | null;
  withholdingCalculated: boolean;
  availableCashCents: number;
  netPaymentCents: number;
  activeHolds: string[];
  nowIso: string;
};

/** Everything that must be true before a single cent leaves the fund. */
export function executionBlockers(f: ExecutionFacts): string[] {
  const blockers: string[] = [];

  if (!f.economicAllocationApproved) blockers.push("The economic allocation is not approved.");
  if (!f.batchBalances) blockers.push("The distribution does not balance to the cent.");
  if (f.batchStatus !== "approved" && f.batchStatus !== "executing") {
    blockers.push("The distribution has not reached final approval.");
  }
  if (f.managerApprovalRequired && !f.managerApprovedBy) {
    blockers.push("The fund manager has not approved this distribution.");
  }
  if (!f.finalApprovedBy) blockers.push("Harmonious final approval is missing.");
  if (f.investorConfirmationRequired && !f.investorConfirmedAt) {
    blockers.push("The investor has not confirmed their details.");
  }
  if (f.destinationStatus !== "approved") {
    blockers.push("The payment destination is not an approved version.");
  }
  if (!f.destinationVerified) blockers.push("The payment destination has not been verified.");

  const cooling = coolingOffSatisfied({
    coolingOffUntil: f.destinationCoolingOffUntil,
    nowIso: f.nowIso,
    waivedBy: f.destinationWaivedBy ?? null,
    waiverReason: f.destinationWaiverReason ?? null,
    requestedBy: f.destinationRequestedBy ?? null,
  });
  if (!cooling.satisfied) blockers.push(cooling.reason ?? "The cooling-off period is not satisfied.");

  if (!f.withholdingCalculated) blockers.push("Withholding has not been calculated.");
  if (round(f.availableCashCents) < round(f.netPaymentCents)) {
    blockers.push("The fund does not have confirmed cash available for this payment.");
  }
  for (const hold of f.activeHolds) blockers.push(`Blocked by a compliance hold: ${hold}.`);

  return blockers;
}

export const BLOCKING_HOLD_KINDS = [
  "aml_concern",
  "sanctions_concern",
  "kyc_incomplete",
  "kyb_incomplete",
  "tax_docs_incomplete",
  "legal_hold",
  "payment_instruction_verification",
  "manual_hold",
  "fraud_concern",
] as const;

// -------------------------------------------------- provider correlation

export type ProviderEventFacts = {
  providerPaymentId: string | null;
  reportedAmountCents: number | null;
  reportedCurrency: string | null;
  reportedDestinationMasked: string | null;
  reportedDirection: string | null;
  eventType: string;
};

export type ExpectedPaymentFacts = {
  providerPaymentId: string | null;
  submittedAmountCents: number;
  submittedCurrency: string;
  submittedDestinationMasked: string | null;
  offeringId: string;
};

export type Correlation = {
  status: "confirmed" | "failed" | "returned" | "mismatch" | "unknown";
  mismatches: string[];
};

/**
 * A provider callback is evidence, not authority. It can never change the
 * intended amount or destination; a mismatch is an exception, not completion.
 */
export function correlateProviderEvent(
  event: ProviderEventFacts,
  expected: ExpectedPaymentFacts,
): Correlation {
  const mismatches: string[] = [];

  if (
    event.providerPaymentId &&
    expected.providerPaymentId &&
    event.providerPaymentId !== expected.providerPaymentId
  ) {
    mismatches.push("The provider payment reference does not match.");
  }
  if (
    typeof event.reportedAmountCents === "number" &&
    round(event.reportedAmountCents) !== round(expected.submittedAmountCents)
  ) {
    mismatches.push("The amount the provider reports differs from the approved amount.");
  }
  if (
    event.reportedCurrency &&
    event.reportedCurrency.toUpperCase() !== expected.submittedCurrency.toUpperCase()
  ) {
    mismatches.push("The currency the provider reports differs from the approved currency.");
  }
  if (
    event.reportedDestinationMasked &&
    expected.submittedDestinationMasked &&
    event.reportedDestinationMasked !== expected.submittedDestinationMasked
  ) {
    mismatches.push("The destination the provider reports differs from the approved destination.");
  }
  if (event.reportedDirection && event.reportedDirection !== "outbound") {
    mismatches.push("The provider reports this as an inbound movement.");
  }

  if (mismatches.length > 0) return { status: "mismatch", mismatches };

  if (["paid", "settled", "completed", "confirmed"].includes(event.eventType)) {
    return { status: "confirmed", mismatches };
  }
  if (["failed", "rejected", "cancelled"].includes(event.eventType)) {
    return { status: "failed", mismatches };
  }
  if (["returned", "reversed", "returned_ach"].includes(event.eventType)) {
    return { status: "returned", mismatches };
  }
  return { status: "unknown", mismatches };
}

// ------------------------------------------------------------- exceptions

export const DISTRIBUTION_EXCEPTION_KINDS = [
  "batch_does_not_balance",
  "destination_unverified",
  "destination_superseded",
  "destination_change_pending",
  "cooling_off_active",
  "compliance_hold",
  "insufficient_cash",
  "withholding_missing_documentation",
  "provider_amount_mismatch",
  "provider_destination_mismatch",
  "provider_unknown_event",
  "payment_failed",
  "payment_returned",
  "payment_reversed",
  "duplicate_payment_attempt",
  "reconciliation_unmatched",
  "manual_adjustment_unapproved",
] as const;
export type DistributionExceptionKind = (typeof DISTRIBUTION_EXCEPTION_KINDS)[number];

// ----------------------------------------------------- capital account gate

/**
 * Capital accounts move only after accounting posts. A distribution button
 * never reduces investor capital.
 */
export function capitalAccountEffect(facts: {
  paymentStatus: DistributionPaymentStatus;
  reconciled: boolean;
  journalPosted: boolean;
  netCents: number;
  grossCents: number;
  distributionType: DistributionType;
}): { applies: boolean; reduceCapitalCents: number; reason: string } {
  if (facts.paymentStatus !== "confirmed") {
    return { applies: false, reduceCapitalCents: 0, reason: "The payment is not confirmed." };
  }
  if (!facts.reconciled) {
    return { applies: false, reduceCapitalCents: 0, reason: "The bank activity is not reconciled." };
  }
  if (!facts.journalPosted) {
    return { applies: false, reduceCapitalCents: 0, reason: "The journal entry is not posted." };
  }
  const treatment = DISTRIBUTION_TREATMENT[facts.distributionType];
  return {
    applies: true,
    reduceCapitalCents: treatment.reducesCapital ? round(facts.grossCents) : 0,
    reason: "Posted accounting confirms this distribution.",
  };
}

/** Self-reporting is informational; it never advances a payment. */
export function selfReportEffect(): { advancesState: false; note: string } {
  return {
    advancesState: false,
    note: "Recorded for information only. Nothing is treated as paid until the bank confirms it and the accounting posts.",
  };
}

// ------------------------------------------------------------ work buckets

export const DISTRIBUTION_BUCKETS = [
  "proposed",
  "awaiting_harmonious_review",
  "awaiting_manager_approval",
  "instruction_exception",
  "cooling_off",
  "ready_for_final_approval",
  "ready_to_execute",
  "sent",
  "failed_or_returned",
  "reconciliation_pending",
  "accounting_pending",
  "completed",
] as const;
export type DistributionBucket = (typeof DISTRIBUTION_BUCKETS)[number];

export const DISTRIBUTION_BUCKET_LABELS: Record<DistributionBucket, string> = {
  proposed: "Proposed",
  awaiting_harmonious_review: "Awaiting Harmonious review",
  awaiting_manager_approval: "Awaiting manager approval",
  instruction_exception: "Payment detail exceptions",
  cooling_off: "In cooling-off",
  ready_for_final_approval: "Ready for final approval",
  ready_to_execute: "Ready to send",
  sent: "Sent",
  failed_or_returned: "Failed or returned",
  reconciliation_pending: "Awaiting reconciliation",
  accounting_pending: "Awaiting accounting",
  completed: "Complete",
};

export function distributionBucket(line: {
  batchStatus: BatchStatus;
  approvalState: string;
  paymentState: DistributionPaymentStatus;
  reconciliationState: string;
  accountingState: string;
  hasOpenException: boolean;
  destinationStatus: PaymentInstructionStatus | null;
  coolingOffActive: boolean;
  executionBlockerCount: number;
}): DistributionBucket {
  if (["failed", "returned", "reversed"].includes(line.paymentState)) return "failed_or_returned";
  if (line.paymentState === "confirmed") {
    if (line.accountingState === "posted") return "completed";
    if (line.reconciliationState !== "reconciled") return "reconciliation_pending";
    return "accounting_pending";
  }
  if (line.paymentState === "submitted") return "sent";
  if (line.hasOpenException) return "instruction_exception";
  if (line.destinationStatus !== "approved") return "instruction_exception";
  if (line.coolingOffActive) return "cooling_off";
  if (line.batchStatus === "approved") {
    return line.executionBlockerCount === 0 ? "ready_to_execute" : "instruction_exception";
  }
  if (line.batchStatus === "final_approval") return "ready_for_final_approval";
  if (line.batchStatus === "manager_approval" || line.batchStatus === "investor_confirmation") {
    return "awaiting_manager_approval";
  }
  if (line.batchStatus === "harmonious_review") return "awaiting_harmonious_review";
  return "proposed";
}

// -------------------------------------------------------------- redaction

/** What a fund manager may see. Never a destination, never tax evidence. */
export function managerSafeLine(line: Record<string, any>) {
  return {
    id: line['id'],
    displayName: line['display_name'] ?? line['displayName'] ?? null,
    investmentProfileId: line['investment_profile_id'] ?? line['investmentProfileId'] ?? null,
    grossCents: Number(line['gross_cents'] ?? line['grossCents'] ?? 0),
    withholdingCents: Number(line['withholding_cents'] ?? line['withholdingCents'] ?? 0),
    netCents: Number(line['net_cents'] ?? line['netCents'] ?? 0),
    approvalState: line['approval_state'] ?? line['approvalState'] ?? "draft",
    paymentState: line['payment_state'] ?? line['paymentState'] ?? "not_started",
    // Deliberately absent: destination, masked account, secured details,
    // tax documentation, characterization evidence, internal workpapers.
  };
}

/** What an investor may see about their own line, and only their own. */
export function investorSafeLine(line: Record<string, any>, instructionMasked: string | null) {
  return {
    id: line['id'],
    offeringId: line['offering_id'] ?? line['offeringId'] ?? null,
    investmentProfileId: line['investment_profile_id'] ?? line['investmentProfileId'] ?? null,
    distributionType: line['distribution_type'] ?? line['distributionType'] ?? "ordinary",
    grossCents: Number(line['gross_cents'] ?? line['grossCents'] ?? 0),
    withholdingCents: Number(line['withholding_cents'] ?? line['withholdingCents'] ?? 0),
    feeCents: Number(line['fee_cents'] ?? line['feeCents'] ?? 0),
    netCents: Number(line['net_cents'] ?? line['netCents'] ?? 0),
    currency: line['currency'] ?? "USD",
    effectiveDate: line['effective_date'] ?? line['effectiveDate'] ?? null,
    destinationEnding: instructionMasked,
    paymentState: line['payment_state'] ?? line['paymentState'] ?? "not_started",
  };
}

