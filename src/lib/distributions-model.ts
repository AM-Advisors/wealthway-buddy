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
  | "resolve_exception"
  | "reconcile"
  | "approve_reconciliation"
  | "post"
  | "request_reversal"
  | "approve_reversal"
  | "review_withholding";

/**
 * The granular Operations capability each staff action requires. Being staff
 * grants nothing by itself: every step is re-checked against this map.
 */
export const DISTRIBUTION_CAPABILITY: Record<
  Exclude<DistributionAction, "manager_approve" | "investor_confirm">,
  { area: "capital" | "accounting" | "tax"; action: "prepare" | "review" | "approve" | "execute" }
> = {
  prepare: { area: "capital", action: "prepare" },
  request: { area: "capital", action: "prepare" },
  correct: { area: "capital", action: "prepare" },
  cancel: { area: "capital", action: "prepare" },
  review: { area: "capital", action: "review" },
  resolve_exception: { area: "capital", action: "review" },
  final_approve: { area: "capital", action: "approve" },
  execute: { area: "capital", action: "execute" },
  reconcile: { area: "accounting", action: "prepare" },
  approve_reconciliation: { area: "accounting", action: "review" },
  post: { area: "accounting", action: "approve" },
  request_reversal: { area: "capital", action: "prepare" },
  approve_reversal: { area: "capital", action: "approve" },
  review_withholding: { area: "tax", action: "review" },
};

/** Whether a staff member's capabilities cover a distribution action. */
export function staffCapabilityError(
  capabilities: readonly string[],
  action: DistributionAction,
): string | null {
  if (action === "manager_approve" || action === "investor_confirm") {
    return "Harmonious staff cannot act as the fund manager or the investor.";
  }
  const need = DISTRIBUTION_CAPABILITY[action];
  if (!capabilities.includes(`${need.area}:${need.action}`)) {
    return `This step needs the ${need.area} ${need.action} capability.`;
  }
  return null;
}

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

export type ApprovalStep =
  | "prepared"
  | "requested"
  | "reviewed"
  | "manager_approved"
  | "final_approved"
  | "executed"
  | "reconciled"
  | "reconciliation_approved"
  | "posted"
  | "reversal_requested"
  | "reversal_approved";

export type ApprovalChainEntry = {
  step: ApprovalStep;
  userId: string;
  isServicePrincipal?: boolean;
  at: string;
};

/**
 * Segregation of duties on outbound cash. Each rule names the pair of roles
 * that must be different humans:
 *   preparer/requester  != final approver
 *   requester/preparer  != executor (sent-by)
 *   final approver      != executor
 *   executor            != accounting poster
 *   reconciler          != reconciliation approver
 *   reversal requester  != reversal approver
 * An automated/service identity never satisfies any human step.
 */
export function makerCheckerError(
  chain: ApprovalChainEntry[],
  next: { step: ApprovalStep; actor: ApprovalActor },
): string | null {
  if (next.actor.isServicePrincipal) {
    return "An automated process cannot approve, record, reconcile, post or reverse an outbound payment.";
  }
  const by = (step: ApprovalStep) =>
    chain.filter((c) => c.step === step && !c.isServicePrincipal).map((c) => c.userId);
  const me = next.actor.userId;
  const preparers = [...by("prepared"), ...by("requested")];

  switch (next.step) {
    case "final_approved":
      if (preparers.includes(me)) {
        return "The person who prepared or requested this distribution cannot give the final approval. A second authorised person is required.";
      }
      if (preparers.length === 0 && by("reviewed").includes(me)) {
        return "A second authorised person is required for final approval.";
      }
      return null;
    case "executed": {
      if (by("final_approved").length === 0) {
        return "This payment has no human final approval and cannot be recorded as sent.";
      }
      if (preparers.includes(me)) {
        return "The person who requested or prepared this distribution cannot record it as sent.";
      }
      if (by("final_approved").includes(me)) {
        return "The final approver cannot also record the payment as sent.";
      }
      return null;
    }
    case "reconciliation_approved":
      if (by("reconciled").length === 0) return "Nothing has been reconciled yet.";
      if (by("reconciled").includes(me)) return "The reconciler cannot approve their own reconciliation.";
      return null;
    case "posted":
      if (by("reconciliation_approved").length === 0) {
        return "The reconciliation must be approved by a second person before posting.";
      }
      if (by("executed").includes(me)) {
        return "The person who recorded the payment as sent cannot post it to the ledger.";
      }
      return null;
    case "reversal_approved":
      if (by("reversal_requested").length === 0) return "No reversal has been requested.";
      if (by("reversal_requested").includes(me)) {
        return "The person who requested the reversal cannot approve it.";
      }
      return null;
    default:
      return null;
  }
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


// ---------------------------------------------------- financial states (D1)

/**
 * Explicit, ordered financial states. SETTLED is reached only by evidence:
 * bank activity, approved reconciliation and a posted journal.
 */
export const FINANCIAL_STATES = [
  "proposed",
  "reviewed",
  "approved_for_payment",
  "execution_recorded",
  "bank_confirmed",
  "reconciled",
  "accounting_posted",
  "settled",
  "exception",
] as const;
export type FinancialState = (typeof FINANCIAL_STATES)[number];

export type FinancialFacts = {
  batchStatus: BatchStatus | string;
  reviewed: boolean;
  paymentStatus: DistributionPaymentStatus | string | null;
  bankTransactionLinked: boolean;
  reconciliationApproved: boolean;
  journalPosted: boolean;
  hasOpenException?: boolean;
};

export function financialState(f: FinancialFacts): FinancialState {
  if (f.hasOpenException || ["failed", "returned", "reversed"].includes(String(f.paymentStatus))) {
    return "exception";
  }
  const settledEvidence = f.bankTransactionLinked && f.reconciliationApproved && f.journalPosted;
  if (settledEvidence) return "settled";
  if (f.journalPosted && f.reconciliationApproved) return "accounting_posted";
  if (f.reconciliationApproved && f.bankTransactionLinked) return "reconciled";
  if (f.paymentStatus === "confirmed" || f.bankTransactionLinked) return "bank_confirmed";
  if (f.paymentStatus === "submitted") return "execution_recorded";
  if (["approved", "executing", "completed"].includes(String(f.batchStatus))) return "approved_for_payment";
  if (f.reviewed) return "reviewed";
  return "proposed";
}

/** Only these states may be shown to an investor as paid. */
export function isSettled(f: FinancialFacts): boolean {
  return financialState(f) === "settled";
}

export type InvestorPaymentLabel = "Scheduled" | "Sent" | "Completed" | "Needs attention" | "Pending";

/** Investor wording: Completed strictly requires reconciliation + posted accounting. */
export function investorPaymentLabel(f: FinancialFacts): InvestorPaymentLabel {
  const s = financialState(f);
  if (s === "settled") return "Completed";
  if (s === "exception") return "Needs attention";
  if (["execution_recorded", "bank_confirmed", "reconciled", "accounting_posted"].includes(s)) return "Sent";
  if (s === "approved_for_payment") return "Scheduled";
  return "Pending";
}

export const OPERATIONS_STAGES = [
  "ready_for_review",
  "approved_for_payment",
  "awaiting_bank_confirmation",
  "reconciliation_required",
  "accounting_required",
  "completed",
  "exception",
] as const;
export type OperationsStage = (typeof OPERATIONS_STAGES)[number];
export const OPERATIONS_STAGE_LABELS: Record<OperationsStage, string> = {
  ready_for_review: "Ready for review",
  approved_for_payment: "Approved for payment",
  awaiting_bank_confirmation: "Awaiting bank confirmation",
  reconciliation_required: "Reconciliation required",
  accounting_required: "Accounting required",
  completed: "Completed",
  exception: "Exception",
};

export function operationsStage(f: FinancialFacts): OperationsStage {
  const s = financialState(f);
  switch (s) {
    case "exception":
      return "exception";
    case "settled":
      return "completed";
    case "accounting_posted":
    case "reconciled":
      return "accounting_required";
    case "bank_confirmed":
      return f.reconciliationApproved ? "accounting_required" : "reconciliation_required";
    case "execution_recorded":
      return "awaiting_bank_confirmation";
    case "approved_for_payment":
      return "approved_for_payment";
    default:
      return "ready_for_review";
  }
}

// ------------------------------------------- multi-factor outbound matching

export type MatchOutcome = "EXACT" | "STRONG" | "AMBIGUOUS" | "CONFLICT" | "UNMATCHED";

export type ExpectedOutbound = {
  offeringId: string;
  sourceBankAccountId?: string | null;
  amountCents: number;
  currency: string;
  destinationFingerprint?: string | null;
  providerReference?: string | null;
  recordedAtIso: string;
  windowDays?: number;
};

export type BankCandidate = {
  id: string;
  offeringId: string | null;
  bankAccountId?: string | null;
  /** Negative amounts are outbound when direction is not recorded. */
  amountCents: number;
  direction?: string | null;
  currency?: string | null;
  counterpartyFingerprint?: string | null;
  reference?: string | null;
  postedOn?: string | null;
  alreadyMatched?: boolean;
};

export type MatchField =
  | "fund"
  | "source_account"
  | "direction"
  | "amount"
  | "currency"
  | "destination"
  | "reference"
  | "date_window";

export type CandidateEvidence = {
  candidateId: string;
  matched: MatchField[];
  mismatched: MatchField[];
  unavailable: MatchField[];
  outcome: MatchOutcome;
  rule: string;
};

function candidateDirection(c: BankCandidate): "outbound" | "inbound" | null {
  if (c.direction) return c.direction === "outbound" || c.direction === "debit" ? "outbound" : "inbound";
  if (typeof c.amountCents === "number" && c.amountCents !== 0) return c.amountCents < 0 ? "outbound" : "inbound";
  return null;
}

/** Deterministic evidence for one candidate. Amount alone never matches. */
export function evaluateCandidate(expected: ExpectedOutbound, c: BankCandidate): CandidateEvidence {
  const matched: MatchField[] = [];
  const mismatched: MatchField[] = [];
  const unavailable: MatchField[] = [];
  const check = (field: MatchField, have: unknown, want: unknown, eq: boolean) => {
    if (have === null || have === undefined || have === "" || want === null || want === undefined || want === "") {
      unavailable.push(field);
    } else if (eq) matched.push(field);
    else mismatched.push(field);
  };

  check("fund", c.offeringId, expected.offeringId, c.offeringId === expected.offeringId);
  check(
    "source_account",
    c.bankAccountId,
    expected.sourceBankAccountId,
    c.bankAccountId === expected.sourceBankAccountId,
  );
  const dir = candidateDirection(c);
  check("direction", dir, "outbound", dir === "outbound");
  check("amount", c.amountCents, expected.amountCents, Math.abs(c.amountCents) === Math.abs(expected.amountCents));
  check(
    "currency",
    c.currency,
    expected.currency,
    String(c.currency ?? "").toUpperCase() === String(expected.currency ?? "").toUpperCase(),
  );
  check(
    "destination",
    c.counterpartyFingerprint,
    expected.destinationFingerprint,
    c.counterpartyFingerprint === expected.destinationFingerprint,
  );
  const ref = expected.providerReference?.trim();
  check(
    "reference",
    c.reference,
    ref,
    !!ref && !!c.reference && String(c.reference).toLowerCase().includes(ref.toLowerCase()),
  );
  if (c.postedOn) {
    const days = Math.abs(Date.parse(c.postedOn) - Date.parse(expected.recordedAtIso)) / 86_400_000;
    check("date_window", c.postedOn, expected.recordedAtIso, days <= (expected.windowDays ?? 5));
  } else unavailable.push("date_window");

  let outcome: MatchOutcome;
  let rule: string;
  const has = (f: MatchField) => matched.includes(f);
  const corroborating = (["reference", "destination", "source_account", "date_window"] as MatchField[]).filter(has);

  if (c.alreadyMatched) {
    outcome = "CONFLICT";
    rule = "The bank transaction is already matched to another record.";
  } else if (mismatched.length > 0) {
    outcome = "CONFLICT";
    rule = `Authoritative fields disagree: ${mismatched.join(", ")}.`;
  } else if (!has("fund") || !has("amount") || !has("direction")) {
    outcome = "UNMATCHED";
    rule = "Fund, outbound direction and amount must all be evidenced.";
  } else if (has("reference") && (has("destination") || has("source_account")) && has("date_window")) {
    outcome = "EXACT";
    rule = "Fund, direction, amount, provider reference, account evidence and date all agree.";
  } else if (corroborating.length >= 2) {
    outcome = "STRONG";
    rule = `Fund, direction and amount agree, corroborated by ${corroborating.join(" and ")}.`;
  } else {
    outcome = "AMBIGUOUS";
    rule = "Only fund, direction and amount agree; that is not enough evidence to match.";
  }
  return { candidateId: c.id, matched, mismatched, unavailable, outcome, rule };
}

export type MatchResult = {
  outcome: MatchOutcome;
  chosenCandidateId: string | null;
  evidence: CandidateEvidence[];
  reason: string;
};

/**
 * Evaluate the selected candidate in the context of every other plausible
 * candidate. Two candidates that both look acceptable stay AMBIGUOUS.
 */
export function matchOutbound(
  expected: ExpectedOutbound,
  selectedId: string,
  candidates: BankCandidate[],
): MatchResult {
  const evidence = candidates.map((c) => evaluateCandidate(expected, c));
  const selected = evidence.find((e) => e.candidateId === selectedId);
  if (!selected) {
    return { outcome: "UNMATCHED", chosenCandidateId: null, evidence, reason: "The selected bank transaction is not a candidate." };
  }
  if (selected.outcome === "CONFLICT" || selected.outcome === "UNMATCHED" || selected.outcome === "AMBIGUOUS") {
    return { outcome: selected.outcome, chosenCandidateId: null, evidence, reason: selected.rule };
  }
  const plausibleRivals = evidence.filter((e) => {
    if (e.candidateId === selectedId) return false;
    if (e.outcome === "CONFLICT" || e.outcome === "UNMATCHED") return false;
    // An EXACT selection is only contested by another EXACT/STRONG rival;
    // a STRONG selection is contested by any plausible same-amount rival.
    if (selected.outcome === "EXACT") return e.outcome === "EXACT" || e.outcome === "STRONG";
    return true;
  });
  if (plausibleRivals.length > 0) {
    return {
      outcome: "AMBIGUOUS",
      chosenCandidateId: null,
      evidence,
      reason: "Another bank transaction is equally consistent with this payment; more evidence is needed.",
    };
  }
  return { outcome: selected.outcome, chosenCandidateId: selectedId, evidence, reason: selected.rule };
}

export function matchAdvancesSettlement(outcome: MatchOutcome): boolean {
  return outcome === "EXACT" || outcome === "STRONG";
}

// ----------------------------------------------------- compliance gate (D1)

export type EvidenceState = "clear" | "blocked" | "expired" | "missing" | "unknown";

export type ComplianceGateFacts = {
  kyc: EvidenceState;
  aml: EvidenceState;
  sanctions: EvidenceState;
  taxDocument: EvidenceState;
  taxDocumentRequired: boolean;
  destinationVerified: boolean;
  coolingOffSatisfied: boolean;
  openAccountingExceptions: number;
  availableCashCents: number | null;
  netPaymentCents: number;
  batchBalances: boolean;
  withholdingReviewed: boolean;
};

export type GateBlocker = { code: string; reason: string };

/**
 * Missing sources never clear: an unknown state becomes REVIEW_REQUIRED, not
 * an assumed pass.
 */
export function complianceGateBlockers(f: ComplianceGateFacts): GateBlocker[] {
  const out: GateBlocker[] = [];
  const evaluate = (code: string, label: string, s: EvidenceState) => {
    if (s === "clear") return;
    if (s === "unknown" || s === "missing") out.push({ code: "REVIEW_REQUIRED", reason: `${label}: no authoritative record — review required.` });
    else if (s === "expired") out.push({ code: `${code}_EXPIRED`, reason: `${label} has expired.` });
    else out.push({ code: `${code}_BLOCKED`, reason: `${label} is not cleared.` });
  };
  evaluate("KYC", "Identity verification", f.kyc);
  evaluate("AML", "AML screening", f.aml);
  evaluate("SANCTIONS", "Sanctions screening", f.sanctions);
  if (f.taxDocumentRequired) evaluate("TAX_DOCUMENT", "Required tax documentation", f.taxDocument);
  if (!f.destinationVerified) out.push({ code: "DESTINATION_UNVERIFIED", reason: "The payment destination is not verified." });
  if (!f.coolingOffSatisfied) out.push({ code: "COOLING_OFF", reason: "The destination cooling-off period has not passed." });
  if (f.openAccountingExceptions > 0) {
    out.push({ code: "ACCOUNTING_EXCEPTION", reason: "An unresolved material accounting exception is open for this fund." });
  }
  if (f.availableCashCents === null) {
    out.push({ code: "REVIEW_REQUIRED", reason: "Available fund cash has no authoritative figure — review required." });
  } else if (f.availableCashCents < f.netPaymentCents) {
    out.push({ code: "INSUFFICIENT_CASH", reason: "The fund does not have confirmed cash for this payment." });
  }
  if (!f.batchBalances) out.push({ code: "UNBALANCED", reason: "The distribution does not balance to the cent." });
  if (!f.withholdingReviewed) {
    out.push({ code: "WITHHOLDING_REVIEW", reason: "Withholding has not been reviewed by Harmonious tax." });
  }
  return out;
}

// ------------------------------------------------ withholding treatment (D1)

/**
 * Hard-coded rules are a calculation aid, never tax authority. The exact
 * figures used are preserved with their source and require human review.
 */
export function withholdingBasis(input: {
  lines: { lineId: string; withholdingCents: number; ruleIds: string[]; taxDocument: EvidenceState }[];
  ruleSource: "default_calculation_aid" | "managed_rules";
}) {
  return {
    ruleSource: input.ruleSource,
    authoritative: false as const,
    requiresReview: true as const,
    lines: input.lines.map((l) => ({ ...l })),
  };
}

export function withholdingReviewBlockers(input: {
  reviewedBy: string | null;
  preparedBy: string | null;
  lines: { taxDocument: EvidenceState; taxDocumentRequired: boolean }[];
}): string[] {
  const out: string[] = [];
  if (!input.reviewedBy) out.push("Withholding has not been reviewed by Harmonious tax.");
  if (input.reviewedBy && input.reviewedBy === input.preparedBy) {
    out.push("The preparer cannot review their own withholding.");
  }
  if (input.lines.some((l) => l.taxDocumentRequired && l.taxDocument !== "clear")) {
    out.push("Required tax documentation is missing or expired for at least one investor.");
  }
  return out;
}

// ---------------------------------------------------- economic snapshot (D1)

export type EconomicSnapshotLine = {
  lineId: string;
  investorUserId: string | null;
  investmentProfileId: string | null;
  positionId: string | null;
  grossCents: number;
  returnOfCapitalCents: number | null;
  incomeGainCents: number | null;
  withholdingCents: number;
  feeCents: number;
  netCents: number;
  capitalAccountSource: string | null;
};

export type EconomicSnapshot = {
  allocationRunId: string | null;
  navVersionId: string | null;
  distributionType: string;
  calculatedAt: string;
  lines: EconomicSnapshotLine[];
};

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

/** Deterministic FNV-1a fingerprint of the snapshot (tamper evidence, not crypto). */
export function snapshotHash(s: EconomicSnapshot): string {
  const text = stableStringify({ ...s, lines: [...s.lines].sort((a, b) => a.lineId.localeCompare(b.lineId)) });
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return `fnv1a:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/** A later calculation that differs from the frozen one is a change, never silent. */
export function snapshotDrift(frozen: EconomicSnapshot, current: EconomicSnapshot): string[] {
  const out: string[] = [];
  const byId = new Map(current.lines.map((l) => [l.lineId, l]));
  for (const f of frozen.lines) {
    const c = byId.get(f.lineId);
    if (!c) { out.push(`Line ${f.lineId} no longer exists in the current calculation.`); continue; }
    for (const k of ["grossCents", "withholdingCents", "feeCents", "netCents", "investmentProfileId"] as const) {
      if (f[k] !== c[k]) out.push(`Line ${f.lineId}: ${k} changed from ${f[k]} to ${c[k]}.`);
    }
  }
  if (frozen.allocationRunId !== current.allocationRunId) out.push("The allocation run changed.");
  return out;
}

// ------------------------------------------------------ reversal controls

export function reversalRequestError(input: {
  reason: string | null | undefined;
  originalPaymentId: string | null | undefined;
  originalJournalEntryId: string | null | undefined;
  paymentStatus: string;
  reconciled?: boolean;
}): string | null {
  if (!input.reason || input.reason.trim().length < 4) return "A reversal needs a reason.";
  if (!input.originalPaymentId) return "A reversal must reference the original payment.";
  if (input.paymentStatus === "reversed") return "This payment has already been reversed.";
  if (!["submitted", "confirmed", "returned", "failed"].includes(input.paymentStatus)) {
    return "Only a recorded payment can be reversed.";
  }
  if (input.reconciled && !input.originalJournalEntryId) {
    return "A reconciled payment's reversal must reference its original accounting entry.";
  }
  return null;
}
