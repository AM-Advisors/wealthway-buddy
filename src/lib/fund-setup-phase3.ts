/**
 * Fund Setup Phase 3 — pure rules for Banking, EIN / SS-4, Administration &
 * Regulatory, class changes and the Review "Ready for" summary. No I/O.
 */

export type BankingPath = "harmonious" | "client" | "not_required";
export const BANKING_PATH_LABELS: Record<BankingPath, string> = {
  harmonious: "Harmonious will establish the bank account",
  client: "Client will provide an existing bank account",
  not_required: "Banking not required",
};

export const HARMONIOUS_BANK_STATUSES = [
  "not_started",
  "information_needed",
  "in_progress",
  "account_opened",
  "wire_pending_verification",
  "funding_instructions_ready",
] as const;
export type HarmoniousBankStatus = (typeof HARMONIOUS_BANK_STATUSES)[number];
export const HARMONIOUS_BANK_STATUS_LABELS: Record<HarmoniousBankStatus, string> = {
  not_started: "Not Started",
  information_needed: "Information Needed",
  in_progress: "Application / Setup In Progress",
  account_opened: "Account Opened",
  wire_pending_verification: "Wire Instructions Pending Verification",
  funding_instructions_ready: "Funding Instructions Ready",
};

export type BankVersion = {
  version: number;
  status: "pending_verification" | "verified" | "rejected";
  ownershipReview: "not_needed" | "review_required" | "accepted";
};
export const BANK_VERSION_STATUS_LABELS: Record<BankVersion["status"], string> = {
  pending_verification: "Pending Verification",
  verified: "Verified",
  rejected: "Rejected / Needs Correction",
};

/** Only the current version, verified and with any ownership question resolved, may be released. */
export function bankInstructionsReleasable(versions: BankVersion[]): boolean {
  const current = [...versions].sort((a, b) => b.version - a.version)[0];
  return !!current && current.status === "verified" && current.ownershipReview !== "review_required";
}

/** "Banking not required" is only allowed for funds that won't receive investor money, with a reason. */
export function bankingNotRequiredError(input: { reason: string | null | undefined; hasInvestments: boolean }): string | null {
  if (!String(input.reason ?? "").trim()) return "Explain why this fund doesn't need a bank account.";
  if (input.hasInvestments) return "This fund already has investments, so it needs banking for funding.";
  return null;
}

export function normalizeName(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function accountNameNeedsReview(accountName: string | null | undefined, legalName: string | null | undefined): boolean {
  if (!legalName) return false;
  return normalizeName(accountName) !== normalizeName(legalName);
}

export function maskTail(value: string | null | undefined, keep = 4): string {
  const v = String(value ?? "").replace(/\s/g, "");
  if (!v) return "";
  return `••••${v.slice(-keep)}`;
}

/** Domestic accounts don't need international fields. */
export function requiredBankFields(international: boolean): string[] {
  const base = ["bank_name", "account_name", "account_number", "bank_address"];
  return international ? [...base, "swift"] : [...base, "routing_number"];
}

export function bankingSection(input: {
  path: BankingPath | null;
  harmoniousStatus: HarmoniousBankStatus | null;
  versions: BankVersion[];
}): { status: "not_started" | "in_progress" | "complete" | "not_applicable" | "needs_attention"; next: string | null; owner: "harmonious" | "client" | null } {
  if (!input.path) return { status: "not_started", next: "Choose how the fund's bank account is handled", owner: "harmonious" };
  if (input.path === "not_required") return { status: "not_applicable", next: null, owner: null };
  const current = [...input.versions].sort((a, b) => b.version - a.version)[0];
  if (bankInstructionsReleasable(input.versions)) return { status: "complete", next: null, owner: null };
  if (current?.ownershipReview === "review_required") return { status: "needs_attention", next: "Review account ownership", owner: "harmonious" };
  if (current?.status === "rejected") return { status: "needs_attention", next: "Provide corrected wire instructions", owner: input.path === "client" ? "client" : "harmonious" };
  if (current?.status === "pending_verification") return { status: "in_progress", next: "Verify the wire instructions", owner: "harmonious" };
  if (input.path === "client") return { status: "in_progress", next: "Provide the bank details and wire instructions", owner: "client" };
  if (input.harmoniousStatus === "information_needed") return { status: "in_progress", next: "Provide the information the bank needs", owner: "client" };
  return { status: "in_progress", next: "Establish the bank account", owner: "harmonious" };
}

// ------------------------------------------------------------------ EIN / SS-4

export type EinPath = "existing" | "harmonious";
export const EIN_STATUSES = [
  "information_needed",
  "ready_for_review",
  "awaiting_signature",
  "ready_for_submission",
  "submitted",
  "ein_received",
  "needs_attention",
] as const;
export type EinStatus = (typeof EIN_STATUSES)[number];
export const EIN_STATUS_LABELS: Record<EinStatus, string> = {
  information_needed: "Information Needed",
  ready_for_review: "Ready for Review",
  awaiting_signature: "Awaiting Signature",
  ready_for_submission: "Ready for Submission",
  submitted: "Submitted / Processing",
  ein_received: "EIN Received",
  needs_attention: "Needs Attention",
};

/** Generated ≠ submitted ≠ issued. EIN Received only via recording a real EIN. */
const EIN_NEXT: Record<EinStatus, EinStatus[]> = {
  information_needed: ["ready_for_review", "needs_attention"],
  ready_for_review: ["awaiting_signature", "ready_for_submission", "information_needed", "needs_attention"],
  awaiting_signature: ["ready_for_submission", "needs_attention"],
  ready_for_submission: ["submitted", "needs_attention"],
  submitted: ["needs_attention"],
  ein_received: [],
  needs_attention: ["information_needed", "ready_for_review", "ready_for_submission", "submitted"],
};
export function einTransitionError(from: EinStatus | null, to: EinStatus): string | null {
  if (to === "ein_received") return "Record the EIN from the IRS letter to mark it received.";
  const f = from ?? "information_needed";
  if (f === to) return null;
  return EIN_NEXT[f].includes(to) ? null : `Can't move from ${EIN_STATUS_LABELS[f]} to ${EIN_STATUS_LABELS[to]}.`;
}

export function validEin(ein: string): boolean {
  return /^\d{2}-?\d{7}$/.test(ein.trim()) && !/^0{2}-?0{7}$/.test(ein.trim());
}

export type CanonicalEntity = {
  legalName: string | null;
  entityType: string | null;
  jurisdiction: string | null;
  formationDate: string | null;
  principalAddress: string | null;
  fiscalYearEnd: string | null;
  gpName: string | null;
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function closingMonth(fye: string | null): string {
  if (!fye) return "";
  const s = fye.trim().toLowerCase();
  const m = MONTHS.find((x) => s.startsWith(x.slice(0, 3)));
  if (m) return m[0]!.toUpperCase() + m.slice(1);
  const n = Number(s.split(/[-/]/)[0]);
  return n >= 1 && n <= 12 ? MONTHS[n - 1]![0]!.toUpperCase() + MONTHS[n - 1]!.slice(1) : "";
}

/** SS-4 answers drawn from canonical fund data; the client is never asked to retype these. */
export function ss4Prefill(e: CanonicalEntity): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  if (e.legalName) out.legal_name = e.legalName;
  if (e.jurisdiction) out.state_incorporated = e.jurisdiction;
  if (e.formationDate) out.date_started = e.formationDate;
  const cm = closingMonth(e.fiscalYearEnd);
  if (cm) out.closing_month = cm;
  if (e.principalAddress) out.street_address = e.principalAddress;
  const t = String(e.entityType ?? "").toLowerCase();
  if (t.includes("llc")) out.is_llc = true;
  if (t === "lp" || t.includes("partnership")) out.entity_kind = "partnership";
  return out;
}

export const SS4_REQUIRED = ["legal_name", "responsible_party_name", "responsible_party_tin", "reason", "date_started", "closing_month", "principal_activity", "principal_line"] as const;

/** Which SS-4 answers are still missing after prefill; employee/wage/designee questions are conditional. */
export function ss4Missing(answers: Record<string, unknown>, opts: { hasEmployees: boolean; usesDesignee: boolean }): string[] {
  const need: string[] = [...SS4_REQUIRED];
  if (answers.is_llc) need.push("llc_members");
  if (opts.hasEmployees) need.push("first_wages_date");
  if (opts.usesDesignee) need.push("designee_name", "designee_phone");
  if (answers.previous_ein_applied) need.push("previous_ein");
  if (answers.principal_activity === "other") need.push("principal_activity_other");
  return need.filter((k) => !String(answers[k] ?? "").trim());
}

export function entitySection(input: { path: EinPath | null; hasEin: boolean; hasEinLetter: boolean; status: EinStatus | null; basicsComplete: boolean }) {
  if (input.hasEin && input.hasEinLetter && input.basicsComplete) return { status: "complete" as const, next: null, owner: null };
  if (input.hasEin && !input.hasEinLetter) return { status: "in_progress" as const, next: "Upload the IRS EIN letter", owner: "client" as const };
  if (!input.path) return { status: input.basicsComplete ? ("in_progress" as const) : ("not_started" as const), next: "Choose how the EIN will be handled", owner: "harmonious" as const };
  if (input.path === "existing") return { status: "in_progress" as const, next: "Enter the EIN and upload the IRS letter", owner: "client" as const };
  const s = input.status ?? "information_needed";
  if (s === "needs_attention") return { status: "needs_attention" as const, next: "Resolve the SS-4 issue", owner: "harmonious" as const };
  if (s === "information_needed") return { status: "in_progress" as const, next: "Complete the SS-4 information", owner: "client" as const };
  if (s === "awaiting_signature") return { status: "in_progress" as const, next: "Sign the SS-4", owner: "client" as const };
  return { status: "in_progress" as const, next: s === "submitted" ? "Waiting for the IRS to issue the EIN" : "Review and submit the SS-4", owner: "harmonious" as const };
}

// ------------------------------------------------------------------ Administration & Regulatory

export const ADMIN_SERVICES = ["fund_administration", "tax", "financial_statements", "nav_accounting", "registered_agent", "form_d", "blue_sky"] as const;
export type AdminService = (typeof ADMIN_SERVICES)[number];
export const ADMIN_SERVICE_LABELS: Record<AdminService, string> = {
  fund_administration: "Fund Administration",
  tax: "Tax",
  financial_statements: "Financial Statements",
  nav_accounting: "NAV / Accounting",
  registered_agent: "Registered Agent",
  form_d: "Form D",
  blue_sky: "Blue Sky",
};
/** Each service is explicitly included or excluded; "unknown" is never treated as purchased. */
export type ServiceChoice = "included" | "not_included";

export type FilingResponsibility = "not_applicable" | "required" | "harmonious" | "client_counsel";
export const FILING_RESPONSIBILITY_LABELS: Record<FilingResponsibility, string> = {
  not_applicable: "Not Applicable",
  required: "Required — responsibility not yet assigned",
  harmonious: "To Be Handled by Harmonious",
  client_counsel: "Client / Legal Counsel Handling",
};

export function adminSection(input: { services: Partial<Record<AdminService, ServiceChoice>>; formD: FilingResponsibility | null; blueSky: FilingResponsibility | null; regType: string | null }) {
  const decided = ADMIN_SERVICES.filter((s) => input.services[s]).length;
  if (!input.regType) return { status: decided ? ("in_progress" as const) : ("not_started" as const), next: "Choose the offering exemption first", owner: "harmonious" as const };
  if (decided < ADMIN_SERVICES.length) return { status: decided ? ("in_progress" as const) : ("not_started" as const), next: "Confirm which services apply", owner: "harmonious" as const };
  if (!input.formD || !input.blueSky) return { status: "in_progress" as const, next: "Record Form D and Blue Sky responsibility", owner: "harmonious" as const };
  if (input.formD === "required" || input.blueSky === "required") return { status: "needs_attention" as const, next: "Assign who handles the filings", owner: "harmonious" as const };
  return { status: "complete" as const, next: null, owner: null };
}

// ------------------------------------------------------------------ class changes

export type ClassChangeFacts = { stage: string; applicableDocuments: number; signedDocuments: number; hasFundingActivity: boolean };

/** Warn on documents; block (route to Harmonious review) when history would be rewritten. */
export function classChangeImpact(f: ClassChangeFacts): { blocked: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const closed = ["funded", "accepted", "closed"].includes(f.stage);
  if (f.applicableDocuments > 0) warnings.push(`${f.applicableDocuments} document(s) apply to this investment and may change with the class.`);
  if (f.signedDocuments > 0) warnings.push(`${f.signedDocuments} signed document(s) reflect the current class.`);
  if (f.hasFundingActivity) warnings.push("Funding activity has been recorded.");
  if (closed) warnings.push("The investment is funded or closed.");
  return { blocked: closed || f.signedDocuments > 0 || f.hasFundingActivity, warnings };
}

// ------------------------------------------------------------------ Review

export type ReadyFacts = {
  isOpen: boolean;
  legalName: boolean;
  regType: boolean;
  economicsApproved: boolean;
  subscriptionReady: boolean;
  subscriptionRequired: boolean;
  signatoryChosen: boolean;
  countersignRequired: boolean;
  bankingReleasable: boolean;
  bankingNotRequired: boolean;
};

/** Separate operational states — never one giant "setup complete" gate. */
export function readyFor(f: ReadyFacts) {
  const inviteMissing = [
    !f.legalName && "Legal Name",
    !f.regType && "offering exemption",
    !f.isOpen && "fund opened for investors",
  ].filter(Boolean) as string[];
  const signingMissing = [
    f.subscriptionRequired && !f.subscriptionReady && "approved Subscription Agreement with signing setup",
    f.countersignRequired && !f.signatoryChosen && "Fund Signatory",
    !f.economicsApproved && "approved economics",
  ].filter(Boolean) as string[];
  const fundingMissing = f.bankingNotRequired ? ["banking marked not required"] : [!f.bankingReleasable && "verified wire instructions"].filter(Boolean) as string[];
  return [
    { key: "invite", label: "Ready to Invite Investors", ready: inviteMissing.length === 0, missing: inviteMissing },
    { key: "signing", label: "Ready for Investor Signing", ready: signingMissing.length === 0, missing: signingMissing },
    { key: "funding", label: "Ready to Release Funding Instructions", ready: !f.bankingNotRequired && fundingMissing.length === 0, missing: fundingMissing },
  ];
}

export type Owner = "harmonious" | "client" | null;
export const OWNER_LABELS: Record<Exclude<Owner, null>, string> = { harmonious: "Needs Harmonious", client: "Needs Client Information" };
