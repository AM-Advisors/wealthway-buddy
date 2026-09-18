/**
 * Pure fund-setup rules. No database access, no authorization, no side effects.
 *
 * This module decides WHAT a given fund structure has to complete before it can
 * be opened to investors, and how setup records version. Everything that reads
 * or writes the database lives in fund-setup.server.ts.
 */

// ------------------------------------------------------------- structures

export const FUND_STRUCTURES = [
  "spv",
  "vc_fund",
  "pe_fund",
  "hedge_fund",
  "real_estate_fund",
  "credit_fund",
  "fund_of_funds",
  "other",
] as const;
export type FundStructure = (typeof FUND_STRUCTURES)[number];

export const FUND_STRUCTURE_LABELS: Record<FundStructure, string> = {
  spv: "SPV / SPE",
  vc_fund: "Venture capital fund",
  pe_fund: "Private equity fund",
  hedge_fund: "Hedge fund",
  real_estate_fund: "Real estate fund",
  credit_fund: "Credit / debt fund",
  fund_of_funds: "Fund of funds",
  other: "Other structure",
};

export function isFundStructure(value: string): value is FundStructure {
  return (FUND_STRUCTURES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------- sections

export const SETUP_SECTIONS = [
  "client",
  "fund_information",
  "entity",
  "documents",
  "banking",
  "economics",
  "investment",
  "compliance",
  "offering",
  "investor_requirements",
  "tax_setup",
  "accounting_book",
  "reporting_configuration",
] as const;
export type SetupSection = (typeof SETUP_SECTIONS)[number];

export const SETUP_SECTION_LABELS: Record<SetupSection, string> = {
  client: "Client",
  fund_information: "Fund information",
  entity: "Entity & EIN",
  documents: "Legal documents",
  banking: "Banking",
  economics: "Economics",
  investment: "Investment / asset",
  compliance: "Compliance",
  offering: "Offering",
  investor_requirements: "Investor requirements",
  tax_setup: "Tax setup",
  accounting_book: "Accounting book",
  reporting_configuration: "Reporting configuration",
};

/**
 * Not every structure carries every section. A deal-specific vehicle has a
 * target asset; a blind-pool fund does not. Nothing is forced through
 * identical fields.
 */
export function sectionsForStructure(structure: FundStructure): SetupSection[] {
  const base: SetupSection[] = [
    "client",
    "fund_information",
    "entity",
    "documents",
    "banking",
    "economics",
    "compliance",
    "offering",
    "investor_requirements",
    "tax_setup",
    "accounting_book",
    "reporting_configuration",
  ];
  if (structure === "spv" || structure === "other") {
    return [...base.slice(0, 6), "investment", ...base.slice(6)];
  }
  if (structure === "real_estate_fund") {
    return [...base.slice(0, 6), "investment", ...base.slice(6)];
  }
  return base;
}

export function sectionApplies(structure: FundStructure, section: SetupSection): boolean {
  return sectionsForStructure(structure).includes(section);
}

// ------------------------------------------------------------- task status

export const TASK_STATUSES = [
  "not_started",
  "waiting_on_client",
  "in_progress",
  "review",
  "complete",
  "exception",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not started",
  waiting_on_client: "Waiting on client",
  in_progress: "In progress",
  review: "Review",
  complete: "Complete",
  exception: "Exception",
};

export const RESPONSIBLE_PARTIES = [
  "harmonious",
  "client",
  "client_counsel",
  "harmonious_and_client",
  "third_party",
] as const;
export type ResponsibleParty = (typeof RESPONSIBLE_PARTIES)[number];

export const RESPONSIBLE_PARTY_LABELS: Record<ResponsibleParty, string> = {
  harmonious: "Harmonious",
  client: "Client",
  client_counsel: "Client counsel",
  harmonious_and_client: "Harmonious + client",
  third_party: "Third party",
};

/**
 * What a client-side user is allowed to do to a task. A client can supply
 * information and move their own items forward, but a Harmonious-owned
 * requirement is never marked complete from the client portal.
 */
export function clientMayUpdateTask(task: {
  responsibleParty: string;
  clientEditable?: boolean;
}, nextStatus: TaskStatus): { allowed: boolean; reason?: string } {
  const clientOwned =
    task.responsibleParty === "client" ||
    task.responsibleParty === "client_counsel" ||
    task.responsibleParty === "harmonious_and_client";
  if (!clientOwned && !task.clientEditable) {
    return { allowed: false, reason: "This item is completed by Harmonious." };
  }
  if (nextStatus === "complete") {
    return {
      allowed: false,
      reason: "Submitted items go to Harmonious for review before they are marked complete.",
    };
  }
  if (nextStatus === "exception") {
    return { allowed: false, reason: "Exceptions are raised by Harmonious." };
  }
  return { allowed: true };
}

/** Client-portal grouping: what we need, what we're doing, third party, done. */
export function clientPortalBucket(task: {
  responsibleParty: string;
  status: string;
}): "needed_from_you" | "harmonious_working" | "third_party" | "completed" {
  if (task.status === "complete") return "completed";
  if (task.responsibleParty === "third_party") return "third_party";
  if (
    task.responsibleParty === "client" ||
    task.responsibleParty === "client_counsel" ||
    task.status === "waiting_on_client"
  ) {
    return "needed_from_you";
  }
  return "harmonious_working";
}

export function dependenciesSatisfied(
  task: { dependencies?: string[] | null },
  byKey: Map<string, { status: string }>,
): boolean {
  for (const dep of task.dependencies ?? []) {
    if (byKey.get(dep)?.status !== "complete") return false;
  }
  return true;
}

// ------------------------------------------------------------ task catalog

export interface TaskTemplate {
  taskKey: string;
  section: SetupSection;
  label: string;
  responsibleParty: ResponsibleParty;
  blocking?: boolean;
  clientEditable?: boolean;
  dependencies?: string[];
}

const CATALOG: TaskTemplate[] = [
  { taskKey: "client_profile", section: "client", label: "Manager / GP details confirmed", responsibleParty: "client", clientEditable: true },
  { taskKey: "client_signatories", section: "client", label: "Authorized signatories identified", responsibleParty: "client", clientEditable: true },
  { taskKey: "client_service_providers", section: "client", label: "Counsel, auditor, tax preparer, custodian named", responsibleParty: "harmonious_and_client", clientEditable: true },
  { taskKey: "fund_information", section: "fund_information", label: "Fund information captured", responsibleParty: "harmonious_and_client", clientEditable: true },
  { taskKey: "entity_formation", section: "entity", label: "Entity formed and accepted", responsibleParty: "client_counsel", dependencies: ["fund_information"] },
  { taskKey: "entity_ein", section: "entity", label: "EIN received", responsibleParty: "harmonious", dependencies: ["entity_formation"] },
  { taskKey: "entity_registered_agent", section: "entity", label: "Registered agent confirmed", responsibleParty: "third_party" },
  { taskKey: "docs_operating_agreement", section: "documents", label: "Operating agreement / LPA approved", responsibleParty: "client_counsel" },
  { taskKey: "docs_subscription", section: "documents", label: "Subscription agreement approved", responsibleParty: "client_counsel" },
  { taskKey: "docs_ppm", section: "documents", label: "PPM approved", responsibleParty: "client_counsel", blocking: false },
  { taskKey: "banking_account", section: "banking", label: "Bank account active", responsibleParty: "harmonious_and_client", dependencies: ["entity_ein"] },
  { taskKey: "economics_terms", section: "economics", label: "Economic terms approved", responsibleParty: "harmonious_and_client" },
  { taskKey: "investment_target", section: "investment", label: "Target asset and purchase terms captured", responsibleParty: "client", clientEditable: true },
  { taskKey: "compliance_config", section: "compliance", label: "Regulatory configuration reviewed", responsibleParty: "harmonious_and_client" },
  { taskKey: "offering_config", section: "offering", label: "Offering configuration complete", responsibleParty: "harmonious" },
  { taskKey: "investor_eligibility", section: "investor_requirements", label: "Investor eligibility rules configured", responsibleParty: "harmonious" },
  { taskKey: "investor_onboarding_steps", section: "investor_requirements", label: "Investor onboarding steps configured", responsibleParty: "harmonious" },
  { taskKey: "tax_setup", section: "tax_setup", label: "Tax setup complete", responsibleParty: "harmonious" },
  { taskKey: "accounting_book", section: "accounting_book", label: "Accounting book opened", responsibleParty: "harmonious" },
  { taskKey: "reporting_configuration", section: "reporting_configuration", label: "Reporting configuration complete", responsibleParty: "harmonious" },
];

export function taskTemplates(structure: FundStructure): TaskTemplate[] {
  const sections = new Set(sectionsForStructure(structure));
  return CATALOG.filter((t) => sections.has(t.section)).map((t, i) => ({ ...t, sortOrder: i }) as TaskTemplate);
}

// -------------------------------------------------------------- checklist

export interface SectionSummary {
  section: SetupSection;
  label: string;
  status: TaskStatus;
  total: number;
  complete: number;
}

export function sectionSummaries(
  structure: FundStructure,
  tasks: { section: string; status: string; blocking?: boolean }[],
): SectionSummary[] {
  return sectionsForStructure(structure).map((section) => {
    const own = tasks.filter((t) => t.section === section);
    const total = own.length;
    const complete = own.filter((t) => t.status === "complete").length;
    let status: TaskStatus = "not_started";
    if (own.some((t) => t.status === "exception")) status = "exception";
    else if (total > 0 && complete === total) status = "complete";
    else if (own.some((t) => t.status === "review")) status = "review";
    else if (own.some((t) => t.status === "waiting_on_client")) status = "waiting_on_client";
    else if (own.some((t) => t.status === "in_progress" || t.status === "complete")) status = "in_progress";
    return { section, label: SETUP_SECTION_LABELS[section], status, total, complete };
  });
}

// ------------------------------------------------------------ entity steps

export const ENTITY_STEPS = [
  "name_selected",
  "formation_requested",
  "formation_filed",
  "formation_accepted",
  "ein_requested",
  "ein_received",
  "registered_agent_confirmed",
  "entity_active",
] as const;
export type EntityStep = (typeof ENTITY_STEPS)[number];

/** Steps that assert something happened on the record need evidence on file. */
const EVIDENCE_REQUIRED: Partial<Record<EntityStep, string>> = {
  formation_filed: "formationDocumentId",
  formation_accepted: "certificateDocumentId",
  ein_received: "einLetterDocumentId",
};

export function entityStepError(
  from: EntityStep,
  to: EntityStep,
  evidence: Record<string, unknown>,
): string | null {
  const fromIndex = ENTITY_STEPS.indexOf(from);
  const toIndex = ENTITY_STEPS.indexOf(to);
  if (toIndex < 0) return `${to} is not an entity formation step.`;
  if (toIndex <= fromIndex) return "Entity formation moves forward, not backward.";
  if (toIndex > fromIndex + 1) return "Entity formation steps are completed in order.";
  const needed = EVIDENCE_REQUIRED[to];
  if (needed && !evidence[needed]) {
    return `${to.replace(/_/g, " ")} needs the supporting document on file first.`;
  }
  return null;
}

// ---------------------------------------------------------------- banking

export const BANKING_STATUSES = [
  "not_started",
  "application",
  "pending",
  "approved",
  "account_active",
] as const;
export type BankingStatus = (typeof BANKING_STATUSES)[number];

export function bankingTransitionError(from: BankingStatus, to: BankingStatus): string | null {
  const f = BANKING_STATUSES.indexOf(from);
  const t = BANKING_STATUSES.indexOf(to);
  if (t < 0) return `${to} is not a banking status.`;
  if (t === f) return null;
  if (t < f) return "Banking status moves forward; record an exception instead of reversing it.";
  if (t > f + 1) return "Banking status advances one step at a time.";
  return null;
}

/** Investor-facing funding instructions stay hidden until explicitly released. */
export function bankingInstructionsVisible(banking: {
  status?: string | null;
  investorInstructionsReleased?: boolean | null;
}): boolean {
  return banking.investorInstructionsReleased === true && banking.status === "account_active";
}

export function canReleaseBankingInstructions(banking: { status?: string | null }): string | null {
  if (banking.status !== "account_active") {
    return "Funding instructions are released only once the account is active.";
  }
  return null;
}

// ------------------------------------------------------------ versioning

export interface VersionedRecord {
  id: string;
  version: number;
  status: string;
}

export function nextVersion(existing: { version: number }[]): number {
  return existing.reduce((max, r) => Math.max(max, r.version), 0) + 1;
}

export function economicsEditError(current: { status: string }): string | null {
  if (current.status === "approved" || current.status === "superseded") {
    return "Approved economics are preserved; create a new version instead.";
  }
  return null;
}

export function documentStatusFlow(): Record<string, string[]> {
  return {
    template: ["draft", "superseded"],
    draft: ["counsel_review", "approved", "superseded"],
    counsel_review: ["draft", "approved", "superseded"],
    approved: ["current", "superseded"],
    current: ["superseded"],
    superseded: [],
  };
}

export function canTransitionDocument(from: string, to: string): boolean {
  return (documentStatusFlow()[from] ?? []).includes(to);
}

/**
 * After launch a regulatory configuration is only changed through a controlled
 * amendment: a new version, by Harmonious, with a stated reason.
 */
export function regulatoryAmendmentError(input: {
  launched: boolean;
  actorIsStaff: boolean;
  reason?: string | null;
  createsNewVersion: boolean;
}): string | null {
  if (!input.launched) return null;
  if (!input.actorIsStaff) {
    return "After launch, regulatory configuration is amended by Harmonious only.";
  }
  if (!input.createsNewVersion) {
    return "After launch, regulatory configuration changes create a new version.";
  }
  if (!input.reason?.trim()) {
    return "An amendment after launch needs a stated reason.";
  }
  return null;
}

// -------------------------------------------------------- readiness gate

export const DEFAULT_LAUNCH_CONDITIONS: { key: string; label: string; required: boolean }[] = [
  { key: "entity_active", label: "Entity active with EIN", required: true },
  { key: "documents_current", label: "Current subscription and governing documents", required: true },
  { key: "banking_active", label: "Bank account active", required: true },
  { key: "economics_approved", label: "Approved economic terms", required: true },
  { key: "regulatory_reviewed", label: "Regulatory configuration reviewed", required: true },
  { key: "eligibility_approved", label: "Investor eligibility rules approved", required: true },
  { key: "onboarding_configured", label: "Investor onboarding steps configured", required: true },
  { key: "blocking_tasks_complete", label: "All blocking setup tasks complete", required: true },
  { key: "harmonious_approval", label: "Harmonious launch approval", required: true },
];

export interface ReadinessInput {
  conditions: { conditionKey: string; label: string; required: boolean; satisfied: boolean }[];
  tasks: { status: string; blocking?: boolean | null }[];
  harmoniousApproved: boolean;
}

export interface ReadinessResult {
  ready: boolean;
  state: "not_ready" | "ready";
  headline: string;
  unmet: { key: string; label: string }[];
}

export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const unmet: { key: string; label: string }[] = [];
  for (const c of input.conditions) {
    if (!c.required) continue;
    if (c.conditionKey === "harmonious_approval") continue;
    if (!c.satisfied) unmet.push({ key: c.conditionKey, label: c.label });
  }
  const blockingOpen = input.tasks.filter(
    (t) => (t.blocking ?? true) && t.status !== "complete",
  ).length;
  if (blockingOpen > 0) {
    unmet.push({
      key: "blocking_tasks_complete",
      label: `${blockingOpen} blocking setup task${blockingOpen === 1 ? "" : "s"} outstanding`,
    });
  }
  if (!input.harmoniousApproved) {
    unmet.push({ key: "harmonious_approval", label: "Harmonious launch approval" });
  }
  const ready = unmet.length === 0;
  return {
    ready,
    state: ready ? "ready" : "not_ready",
    headline: ready ? "READY FOR INVESTOR ONBOARDING" : "NOT READY FOR INVESTORS",
    unmet,
  };
}

/** Launch approval is a Harmonious act and never an inference from progress. */
export function launchApprovalError(input: {
  actorIsStaff: boolean;
  unmetBeforeApproval: { key: string }[];
}): string | null {
  if (!input.actorIsStaff) return "Only Harmonious can approve a fund for launch.";
  const blockers = input.unmetBeforeApproval.filter((u) => u.key !== "harmonious_approval");
  if (blockers.length > 0) {
    return `Required setup is incomplete: ${blockers.map((b) => b.key).join(", ")}.`;
  }
  return null;
}

// --------------------------------------------------- onboarding & launch

export const ONBOARDING_STEPS = [
  "account",
  "investment_profile",
  "kyc_kyb",
  "aml",
  "accreditation",
  "tax",
  "subscription",
  "signature",
  "funding",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const INVESTOR_TYPES = ["all", "individual", "entity", "trust", "foreign"] as const;
export type OnboardingInvestorType = (typeof INVESTOR_TYPES)[number];

export function defaultOnboardingRequirements(
  structure: FundStructure,
): { investorType: OnboardingInvestorType; step: OnboardingStep; required: boolean }[] {
  void structure;
  return ONBOARDING_STEPS.map((step) => ({
    investorType: "all" as const,
    step,
    required: true,
  }));
}

export const SETUP_STAGES = [
  "new_request",
  "fund_information",
  "entity",
  "documents",
  "banking",
  "economics",
  "compliance",
  "offering_configuration",
  "investor_requirements",
  "harmonious_review",
  "ready_to_launch",
  "investor_onboarding",
  "active",
] as const;
export type SetupStage = (typeof SETUP_STAGES)[number];

export function stageTransitionError(from: string, to: string): string | null {
  const f = (SETUP_STAGES as readonly string[]).indexOf(from);
  const t = (SETUP_STAGES as readonly string[]).indexOf(to);
  if (t < 0) return `${to} is not a fund setup stage.`;
  if (f < 0) return null;
  if (t > f + 1) return "Setup stages advance one step at a time.";
  return null;
}

/** The investor entry point is derived from the offering, never free text. */
export function investorOnboardingPath(offeringSlug: string): string {
  const clean = offeringSlug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(clean)) {
    throw new Error("That offering reference cannot be used in an investor link.");
  }
  return `/invest/${clean}`;
}
