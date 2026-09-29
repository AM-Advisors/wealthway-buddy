/**
 * Investment Readiness — one canonical checklist per Investment (investor_onboardings row),
 * projected from the existing requirement engine (determineOnboardingRequirements),
 * funding derivation and closing gate. Pure; never decides compliance, never stores facts.
 * Fund, Investor and Operations views are role-filtered projections of the same result.
 */
import type { RequirementKey, RequirementResult, RequirementState, FundingStatus } from "@/lib/investor-onboarding-model";
import { isReconciledFunding } from "@/lib/funding-status";

export const READINESS_RULE_VERSION = "readiness-v1";

export const READINESS_STAGES = [
  "investment_profile",
  "identity",
  "eligibility",
  "tax",
  "subscription",
  "funding",
  "close_readiness",
  "closed",
] as const;
export type ReadinessStage = (typeof READINESS_STAGES)[number];

export const STAGE_TITLES: Record<ReadinessStage, string> = {
  investment_profile: "Investment Profile",
  identity: "Identity / Entity Verification",
  eligibility: "Eligibility & Accreditation",
  tax: "Tax",
  subscription: "Subscription Documents",
  funding: "Funding",
  close_readiness: "Close Readiness",
  closed: "Closed",
};

export const READINESS_STATUSES = [
  "not_started",
  "in_progress",
  "needs_investor",
  "needs_fund_manager",
  "needs_harmonious",
  "under_review",
  "complete",
  "blocked",
  "not_applicable",
] as const;
export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

export const STATUS_LABELS: Record<ReadinessStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  needs_investor: "Needs Investor",
  needs_fund_manager: "Needs Fund Manager",
  needs_harmonious: "Needs Harmonious",
  under_review: "Under Review",
  complete: "Complete",
  blocked: "Blocked",
  not_applicable: "Not Applicable",
};

export type Owner = "investor" | "fund_manager" | "harmonious" | null;
export const OWNER_LABELS: Record<Exclude<Owner, null>, string> = { investor: "Investor", fund_manager: "Fund Manager", harmonious: "Harmonious" };

/** Which canonical requirement feeds which stage (display order within stage). */
export const REQUIREMENT_STAGE: Record<RequirementKey, ReadinessStage> = {
  account: "investment_profile",
  investment_profile: "investment_profile",
  investment_amount: "investment_profile",
  identity_verification: "identity",
  entity_verification: "identity",
  beneficial_owners: "identity",
  aml: "identity",
  eligibility: "eligibility",
  accreditation: "eligibility",
  bad_actor: "eligibility",
  bsa_aml: "eligibility",
  tax_classification: "tax",
  tax_documentation: "tax",
  subscription_questionnaire: "subscription",
  certifications: "subscription",
  subscription_documents: "subscription",
  signature: "subscription",
  funding: "funding",
};

/** Source system per requirement — for audit and staff display. */
export const REQUIREMENT_SOURCE: Record<string, string> = {
  account: "accounts",
  investment_profile: "investment_profiles",
  investment_amount: "investor_onboardings",
  identity_verification: "identity_verification (Didit)",
  entity_verification: "entity_verifications (KYB)",
  beneficial_owners: "profile_relationships",
  aml: "aml_screenings",
  eligibility: "offering eligibility rules",
  accreditation: "accreditation_records",
  bad_actor: "compliance questionnaire",
  bsa_aml: "compliance questionnaire",
  tax_classification: "tax classification engine",
  tax_documentation: "investor_tax_profiles",
  subscription_questionnaire: "subscription questionnaire",
  certifications: "investor certifications",
  subscription_documents: "document snapshots",
  signature: "document_signatures (Box)",
  approved_to_fund: "Harmonious review",
  funding: "bank reconciliation",
  exceptions: "investor_onboarding_exceptions",
  acceptance: "subscription acceptance",
  closed: "closing",
};

/** Missing requirements Harmonious (not the investor) must act on. */
const HARMONIOUS_WHEN_MISSING = new Set<string>(["aml", "subscription_documents"]);

/** Fund-manager-safe high-level labels. Never evidence, scores, providers, TINs or documents. */
const SAFE_LABEL: Record<ReadinessStage, Partial<Record<ReadinessStatus, string>>> = {
  investment_profile: { complete: "Profile complete" },
  identity: { complete: "Identity complete", under_review: "Verification pending", needs_harmonious: "Verification pending", needs_investor: "Verification pending" },
  eligibility: { complete: "Eligibility complete", needs_investor: "Accreditation incomplete", under_review: "Harmonious review" },
  tax: { complete: "Tax — Complete", needs_investor: "Tax information required", under_review: "Tax information required" },
  subscription: { complete: "Documents executed", needs_investor: "Documents awaiting signature", needs_harmonious: "Documents being prepared" },
  funding: { complete: "Funded", needs_investor: "Funding pending", needs_harmonious: "Funding pending", under_review: "Funding pending" },
  close_readiness: { complete: "Ready to close", needs_harmonious: "Harmonious review", blocked: "Harmonious review" },
  closed: { complete: "Closed" },
};

export interface ReadinessItem {
  key: string;
  stage: ReadinessStage;
  label: string;
  status: ReadinessStatus;
  owner: Owner;
  /** Required items count toward completion and block Close Ready. */
  required: boolean;
  blocking: boolean;
  action: string | null;
  reason?: string | undefined;
  source: string;
  dependsOn: ReadinessStage[];
  automatic: boolean;
}

export interface ReadinessInput {
  requirements: RequirementResult[];
  stage: string;
  fundingStatus: FundingStatus | string | null;
  approvedToFundAt: string | null;
  acceptedAt: string | null;
  acceptedAmountCents: number | null;
  closedAt: string | null;
  /** Open exceptions only; owner uses the existing exception-owner vocabulary. */
  exceptions: { severity: string; owner: string | null; type?: string | null }[];
  requestedCloseDate?: string | null;
  /** When evaluating inside a Close Request: the amount that close expects. */
  closeAmountCents?: number | null;
}

export interface StageSummary {
  stage: ReadinessStage;
  title: string;
  status: ReadinessStatus;
}

export interface ReadinessResult {
  ruleVersion: string;
  items: ReadinessItem[];
  stages: StageSummary[];
  currentStage: ReadinessStage;
  percentComplete: number;
  requiredCount: number;
  completeCount: number;
  closeReady: boolean;
  closeBlockers: string[];
  nextAction: { label: string; owner: Owner } | null;
  requestedCloseDate: string | null;
  terminal: "closed" | "declined" | "cancelled" | null;
}

const STAGE_DEPENDS: Record<ReadinessStage, ReadinessStage[]> = {
  investment_profile: [],
  identity: ["investment_profile"],
  eligibility: ["investment_profile"],
  tax: ["investment_profile"],
  subscription: ["investment_profile"],
  funding: ["investment_profile", "identity", "eligibility", "tax", "subscription"],
  close_readiness: ["investment_profile", "identity", "eligibility", "tax", "subscription", "funding"],
  closed: ["close_readiness"],
};

function fromRequirement(r: RequirementResult): Pick<ReadinessItem, "status" | "owner" | "action"> {
  const s: RequirementState = r.state;
  if (s === "valid") return { status: "complete", owner: null, action: null };
  if (s === "not_applicable") return { status: "not_applicable", owner: null, action: null };
  if (s === "review_required") return { status: "under_review", owner: "harmonious", action: `Review ${r.label.toLowerCase()}` };
  if (s === "refresh_required") return { status: "needs_investor", owner: "investor", action: `Update ${r.label.toLowerCase()}` };
  if (HARMONIOUS_WHEN_MISSING.has(r.key)) {
    return { status: "needs_harmonious", owner: "harmonious", action: r.key === "aml" ? "Complete compliance screening" : "Prepare subscription documents" };
  }
  const verb: Record<string, string> = {
    identity_verification: "Complete identity verification",
    entity_verification: "Complete entity verification",
    beneficial_owners: "Provide owners and signers",
    accreditation: "Provide accreditation information",
    tax_documentation: "Complete tax form",
    tax_classification: "Complete tax questions",
    signature: "Sign subscription documents",
    investment_amount: "Enter investment amount",
    investment_profile: "Choose who is investing",
    subscription_questionnaire: "Complete subscription information",
    certifications: "Review and certify",
    bad_actor: "Complete compliance questionnaire",
    bsa_aml: "Complete financial background",
    account: "Create account",
    eligibility: "Confirm eligibility",
  };
  return { status: "needs_investor", owner: "investor", action: verb[r.key] ?? `Complete ${r.label.toLowerCase()}` };
}

function fundingItem(input: ReadinessInput, preFundingDone: boolean, blockingExceptions: number): ReadinessItem[] {
  const f = String(input.fundingStatus ?? "not_funded");
  const approved = Boolean(input.approvedToFundAt);
  const base = { stage: "funding" as const, required: true, blocking: true, dependsOn: STAGE_DEPENDS.funding, automatic: true };
  const approval: ReadinessItem = {
    ...base,
    key: "approved_to_fund",
    label: "Approved to receive funding instructions",
    source: REQUIREMENT_SOURCE["approved_to_fund"]!,
    ...(approved
      ? { status: "complete" as const, owner: null, action: null }
      : !preFundingDone
        ? { status: "not_started" as const, owner: null, action: null, reason: "Earlier steps must be complete first." }
        : blockingExceptions > 0
          ? { status: "blocked" as const, owner: "harmonious" as const, action: "Resolve open issue" }
          : { status: "needs_harmonious" as const, owner: "harmonious" as const, action: "Approve investor to fund" }),
  };
  let funding: Pick<ReadinessItem, "status" | "owner" | "action"> & { reason?: string };
  // Only reconciled cash completes funding. An investor saying "sent" never does.
  if (isReconciledFunding(f)) funding = { status: "complete", owner: null, action: null };
  else if (!approved) funding = { status: "not_started", owner: null, action: null };
  else if (f === "funding_exception" || f === "returned" || f === "overfunded") funding = { status: "blocked", owner: "harmonious", action: "Resolve funding exception" };
  else if (f === "investor_reports_sent" || f === "bank_transaction_detected" || f === "reconciliation_pending" || f === "partially_funded")
    funding = { status: "needs_harmonious", owner: "harmonious", action: "Reconcile incoming wire", reason: f === "investor_reports_sent" ? "Investor reports funds sent; not yet reconciled." : undefined as any };
  else funding = { status: "needs_investor", owner: "investor", action: "Send funds" };
  return [approval, { ...base, key: "funding", label: "Capital received and reconciled", source: REQUIREMENT_SOURCE["funding"]!, ...funding }];
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const terminal = (["closed", "declined", "cancelled"] as const).find((t) => t === input.stage) ?? null;
  const items: ReadinessItem[] = [];
  for (const r of input.requirements) {
    if (r.key === "funding") continue; // funding is modelled below from reconciliation
    const stage = REQUIREMENT_STAGE[r.key];
    const m = fromRequirement(r);
    items.push({
      key: r.key,
      stage,
      label: r.label,
      ...m,
      required: m.status !== "not_applicable",
      blocking: m.status !== "not_applicable",
      reason: r.reason,
      source: REQUIREMENT_SOURCE[r.key] ?? "canonical record",
      dependsOn: STAGE_DEPENDS[stage],
      automatic: true,
    });
  }
  const blockingEx = input.exceptions.filter((e) => e.severity === "blocking");
  const preFunding = items.filter((i) => STAGE_DEPENDS.funding.includes(i.stage));
  const preFundingDone = preFunding.length > 0 && preFunding.every((i) => i.status === "complete" || i.status === "not_applicable");
  items.push(...fundingItem(input, preFundingDone, blockingEx.length));

  // Close readiness: open blocking exceptions, acceptance, and (in a close) the amount match.
  const exOwner = (o: string | null): Owner => (o === "investor" ? "investor" : o === "manager" ? "fund_manager" : "harmonious");
  const cr = { stage: "close_readiness" as const, required: true, blocking: true, dependsOn: STAGE_DEPENDS.close_readiness, automatic: true };
  items.push({
    ...cr,
    key: "exceptions",
    label: "No open blocking issues",
    source: REQUIREMENT_SOURCE["exceptions"]!,
    ...(blockingEx.length
      ? { status: "blocked" as const, owner: exOwner(blockingEx[0]!.owner), action: exOwner(blockingEx[0]!.owner) === "fund_manager" ? "Resolve issue raised for the fund" : exOwner(blockingEx[0]!.owner) === "investor" ? "Resolve issue raised for the investor" : "Resolve open review issue" }
      : { status: "complete" as const, owner: null, action: null }),
  });
  const funded = isReconciledFunding(input.fundingStatus);
  items.push({
    ...cr,
    key: "acceptance",
    label: "Subscription accepted",
    source: REQUIREMENT_SOURCE["acceptance"]!,
    ...(input.acceptedAt && (input.acceptedAmountCents ?? 0) > 0
      ? { status: "complete" as const, owner: null, action: null }
      : funded
        ? { status: "needs_harmonious" as const, owner: "harmonious" as const, action: "Accept subscription" }
        : { status: "not_started" as const, owner: null, action: null }),
  });
  if (input.closeAmountCents != null) {
    const match = (input.acceptedAmountCents ?? 0) === input.closeAmountCents;
    items.push({
      ...cr,
      key: "close_amount",
      label: "Close amount matches accepted amount",
      source: "close request",
      ...(match ? { status: "complete" as const, owner: null, action: null } : { status: "needs_fund_manager" as const, owner: "fund_manager" as const, action: "Correct the amount in this close" }),
    });
  }
  items.push({
    key: "closed",
    stage: "closed",
    label: "Investment closed",
    source: REQUIREMENT_SOURCE["closed"]!,
    status: input.stage === "closed" ? "complete" : "not_started",
    owner: null,
    action: null,
    required: false,
    blocking: false,
    dependsOn: STAGE_DEPENDS.closed,
    automatic: true,
  });

  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.status === "complete");
  const percentComplete = required.length ? Math.floor((done.length / required.length) * 100) : 0;

  const stages: StageSummary[] = READINESS_STAGES.map((stage) => ({ stage, title: STAGE_TITLES[stage], status: stageStatus(items.filter((i) => i.stage === stage)) }));
  const blockers = items.filter((i) => i.blocking && i.status !== "complete" && i.status !== "not_applicable");
  const closeReady = !terminal && blockers.length === 0;
  const done_ = (s: ReadinessStage) => ["complete", "not_applicable"].includes(stages.find((x) => x.stage === s)!.status);
  const currentStage = terminal === "closed" ? "closed" : (READINESS_STAGES.find((s) => s !== "closed" && !done_(s)) ?? (input.stage === "closed" ? "closed" : "close_readiness"));

  // Next action: the first actionable unresolved item whose stage dependencies are met, in stage order.
  let nextAction: ReadinessResult["nextAction"] = null;
  if (!terminal) {
    for (const s of READINESS_STAGES) {
      const deps = STAGE_DEPENDS[s].every(done_);
      if (!deps) continue;
      const it = items.find((i) => i.stage === s && i.action && i.status !== "complete" && i.status !== "not_applicable");
      if (it) { nextAction = { label: it.action!, owner: it.owner }; break; }
    }
    if (!nextAction && closeReady) nextAction = { label: "Ready to close", owner: null };
  }

  return {
    ruleVersion: READINESS_RULE_VERSION,
    items,
    stages,
    currentStage,
    percentComplete,
    requiredCount: required.length,
    completeCount: done.length,
    closeReady,
    closeBlockers: blockers.map((b) => b.label),
    nextAction,
    requestedCloseDate: input.requestedCloseDate ?? null,
    terminal,
  };
}

function stageStatus(items: ReadinessItem[]): ReadinessStatus {
  const live = items.filter((i) => i.status !== "not_applicable");
  if (!items.length || !live.length) return "not_applicable";
  if (live.every((i) => i.status === "complete")) return "complete";
  for (const s of ["blocked", "needs_fund_manager", "needs_investor", "needs_harmonious", "under_review"] as const) {
    if (live.some((i) => i.status === s)) return s;
  }
  return live.some((i) => i.status === "complete") ? "in_progress" : "not_started";
}

export type ReadinessViewer = "staff" | "investor" | "manager";

/**
 * Role projection. Investors see their own reasons; fund managers see only safe
 * high-level labels (no reasons, no sources); staff see everything.
 */
export function readinessView(r: ReadinessResult, viewer: ReadinessViewer) {
  if (viewer === "staff") return r;
  return {
    ...r,
    items: r.items.map((i) => ({
      key: i.key,
      stage: i.stage,
      label: i.label,
      status: i.status,
      owner: i.owner,
      required: i.required,
      blocking: i.blocking,
      action: i.action,
      ...(viewer === "investor" && i.reason ? { reason: i.reason } : {}),
    })),
    stages: r.stages.map((s) => ({ ...s, ...(viewer === "manager" ? { safeLabel: SAFE_LABEL[s.stage][s.status] ?? STATUS_LABELS[s.status] } : {}) })),
  };
}

/** Transitions between two computed results — the basis for audit events. */
export function readinessTransitions(prev: Record<string, string>, next: ReadinessResult) {
  return next.items
    .filter((i) => prev[i.key] !== i.status)
    .map((i) => ({ key: i.key, stage: i.stage, from: prev[i.key] ?? null, to: i.status, source: i.source, owner: i.owner }));
}

/**
 * Task plan: one open task per unresolved actionable item (dedupe key = onboarding + item).
 * Tasks never send email; they are internal work items.
 */
export function readinessTaskPlan(openTaskKeys: Set<string>, r: ReadinessResult) {
  const actionable = r.terminal ? [] : r.items.filter((i) => i.action && i.owner && i.status !== "complete" && i.status !== "not_applicable" && i.status !== "not_started");
  const wanted = new Set(actionable.map((i) => i.key));
  return {
    create: actionable.filter((i) => !openTaskKeys.has(i.key)).map((i) => ({ key: i.key, title: i.action!, owner: i.owner! })),
    resolve: [...openTaskKeys].filter((k) => !wanted.has(k)),
  };
}
