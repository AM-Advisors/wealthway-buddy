/**
 * Canonical Fund Setup — pure rules (no I/O).
 *
 * The offering row is the single source for the fund's Legal Name, entity,
 * signatory and offering terms. Economics and classes live in the existing
 * versioned fund_economics_versions (maker-checker). This module only decides
 * section status, applicability and validation; it never writes anything.
 */

export const CANONICAL_SECTIONS = [
  "fund_details",
  "entity_ein",
  "offering_economics",
  "classes",
  "offering_documents",
  "banking",
  "administration",
  "review",
] as const;
export type CanonicalSection = (typeof CANONICAL_SECTIONS)[number];

export const CANONICAL_SECTION_LABELS: Record<CanonicalSection, string> = {
  fund_details: "Fund Details",
  entity_ein: "Entity & EIN",
  offering_economics: "Offering & Economics",
  classes: "Classes",
  offering_documents: "Offering Documents",
  banking: "Banking",
  administration: "Administration & Regulatory",
  review: "Review",
};

export type SectionStatus = "not_started" | "in_progress" | "complete" | "needs_attention" | "not_applicable";

/** A read-only summary of applicable Fund Setup sections, not investor readiness. */
export function setupCompletion(statuses: Record<CanonicalSection, { status: SectionStatus }>): number {
  const applicable = CANONICAL_SECTIONS.filter((section) => statuses[section].status !== "not_applicable");
  if (!applicable.length) return 0;
  const complete = applicable.filter((section) => statuses[section].status === "complete").length;
  return Math.round((complete / applicable.length) * 100);
}

export const SECTION_STATUS_LABELS: Record<SectionStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Complete",
  needs_attention: "Needs Attention",
  not_applicable: "Not Applicable",
};

/** Existing canonical fund-type labels (kept as stored text so current funds stay valid). */
export const FUND_TYPES = [
  "SPV",
  "Single asset SPV",
  "Venture capital",
  "Private equity",
  "Hedge fund",
  "Real estate",
  "Private credit",
  "Other",
] as const;

/** Pooled, time-limited vehicles carry a term and investment period; SPVs and hedge funds don't. */
export function termApplies(fundType: string | null | undefined): boolean {
  const t = String(fundType ?? "").toLowerCase();
  return t.includes("venture") || t.includes("private equity") || t.includes("real estate") || t.includes("credit");
}

/** Maps a fund-type label onto the existing fund_setups structure. */
export function structureForFundType(fundType: string | null | undefined): string {
  const t = String(fundType ?? "").toLowerCase();
  if (t.includes("spv")) return "spv";
  if (t.includes("venture")) return "vc_fund";
  if (t.includes("private equity")) return "pe_fund";
  if (t.includes("hedge")) return "hedge_fund";
  if (t.includes("real estate")) return "real_estate_fund";
  if (t.includes("credit")) return "credit_fund";
  return "other";
}

export const FEE_BASES = ["committed_capital", "invested_capital", "nav", "flat"] as const;
export const FEE_FREQUENCIES = ["one_time", "annual", "quarterly", "monthly"] as const;

export type ManagementFee = {
  ratePercent: number | null;
  basis: (typeof FEE_BASES)[number] | null;
  frequency: (typeof FEE_FREQUENCIES)[number] | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};
export type Carry = { ratePercent: number | null; applicability?: string | null };
export type EconomicTerms = {
  managementFee: ManagementFee | null;
  carry: Carry | null;
  preferredReturnPercent?: number | null;
  orgExpenseTreatment?: string | null;
  distributionFrequency?: string | null;
  /** Terms explicitly marked Not applicable (counts as answered, never as a value). */
  notApplicable?: EconomicTermKey[] | undefined;
};
export const ECONOMIC_TERM_KEYS = ["managementFee", "carry", "preferredReturn", "orgExpense", "distributionFrequency", "minInvestment"] as const;
export type EconomicTermKey = (typeof ECONOMIC_TERM_KEYS)[number];
export type FundClass = {
  key: string;
  name: string;
  description?: string | null;
  managementFee?: ManagementFee | null;
  carry?: Carry | null;
  preferredReturnPercent?: number | null;
  minInvestmentCents?: number | null;
  notApplicable?: EconomicTermKey[] | undefined;
};

const pct = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

/** Validates structured economics. Never infers one term from another. */
export function economicsErrors(terms: EconomicTerms): string[] {
  const errors: string[] = [];
  const fee = terms.managementFee;
  if (fee) {
    if (fee.ratePercent != null && !pct(fee.ratePercent)) errors.push("Management fee rate must be between 0 and 100%.");
    if (fee.ratePercent != null && !fee.basis) errors.push("Management fee needs a basis.");
    if (fee.ratePercent != null && !fee.frequency) errors.push("Management fee needs a frequency.");
    if (fee.basis && !FEE_BASES.includes(fee.basis)) errors.push("Unknown management fee basis.");
    if (fee.frequency && !FEE_FREQUENCIES.includes(fee.frequency)) errors.push("Unknown management fee frequency.");
  }
  if (terms.carry?.ratePercent != null && !pct(terms.carry.ratePercent)) errors.push("Carry must be between 0 and 100%.");
  if (terms.preferredReturnPercent != null && !pct(terms.preferredReturnPercent)) {
    errors.push("Preferred return must be between 0 and 100%.");
  }
  return errors;
}

export function classKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function classErrors(classes: FundClass[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const c of classes) {
    if (!c.name?.trim()) errors.push("Every class needs a name.");
    const k = c.key || classKey(c.name ?? "");
    if (seen.has(k)) errors.push(`Class "${c.name}" appears twice.`);
    seen.add(k);
    errors.push(...economicsErrors({ managementFee: c.managementFee ?? null, carry: c.carry ?? null, preferredReturnPercent: c.preferredReturnPercent ?? null }));
  }
  return errors;
}

/** Class-specific values override the fund default; missing class values fall back. */
export function effectiveEconomics(defaults: EconomicTerms, cls?: FundClass | null): EconomicTerms {
  if (!cls) return defaults;
  return {
    ...defaults,
    managementFee: cls.managementFee ?? defaults.managementFee,
    carry: cls.carry ?? defaults.carry,
    preferredReturnPercent: cls.preferredReturnPercent ?? defaults.preferredReturnPercent ?? null,
  };
}

/** An investment may reference only a class that exists on the fund's approved economics. */
export function classAssignmentError(input: {
  hasMultipleClasses: boolean;
  classes: FundClass[];
  classKey: string | null;
}): string | null {
  if (!input.classKey) return input.hasMultipleClasses ? "Choose a class for this investment." : null;
  if (!input.hasMultipleClasses) return "This fund does not have multiple classes.";
  if (!input.classes.some((c) => c.key === input.classKey)) return "That class does not exist on this fund.";
  return null;
}

/** EIN: store 9 digits, display ##-#######. */
export function normalizeEin(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length === 9 ? digits : null;
}
export function formatEin(raw: string | null | undefined): string | null {
  const d = normalizeEin(raw);
  return d ? `${d.slice(0, 2)}-${d.slice(2)}` : null;
}

export type SetupFacts = {
  fundType: string | null;
  legalName: string | null;
  displayName: string | null;
  gpName: string | null;
  signatoryPersonId: string | null;
  signatoryTitle: string | null;
  fiscalYearEnd: string | null;
  fundTermMonths: number | null;
  investmentPeriodMonths: number | null;
  entityType: string | null;
  jurisdiction: string | null;
  formationDate: string | null;
  hasEin: boolean;
  regType: string | null;
  minInvestmentCents: number | null;
  targetRaiseCents: number | null;
  economicsStatus: "none" | "draft" | "approved";
  managementFeeSet: boolean;
  carrySet: boolean;
  hasMultipleClasses: boolean;
  classCount: number;
  documentCount: number;
  /** Offering Documents configuration status (Phase 2); falls back to documentCount when absent. */
  documentsStatus?: { status: "not_started" | "in_progress" | "complete"; next: string | null };
  bankingState: "none" | "requested" | "in_progress" | "active";
  adminConfigured: boolean;
};

type Result = { status: SectionStatus; next: string | null };

function tally(required: [boolean, string][]): Result {
  const filled = required.filter(([ok]) => ok).length;
  if (filled === required.length) return { status: "complete", next: null };
  const next = required.find(([ok]) => !ok)![1];
  return { status: filled === 0 ? "not_started" : "in_progress", next };
}

/** Fund Setup status per section — separate from Investment Readiness. */
export function sectionStatuses(f: SetupFacts): Record<CanonicalSection, Result> {
  const term = termApplies(f.fundType);
  const details = tally([
    [!!f.legalName, "Enter the fund's Legal Name"],
    [!!f.fundType, "Choose the Fund Type"],
    [!!f.gpName, "Name the Fund Manager / GP"],
    [!!f.signatoryPersonId && !!f.signatoryTitle, "Choose the Fund Signatory and title"],
    [!!f.fiscalYearEnd, "Set the fiscal year end"],
    ...(term ? ([[f.fundTermMonths != null, "Set the Fund Term"], [f.investmentPeriodMonths != null, "Set the Investment Period"]] as [boolean, string][]) : []),
  ]);
  const entity = tally([
    [!!f.entityType, "Choose the entity type"],
    [!!f.jurisdiction, "Choose the jurisdiction of formation"],
    [!!f.formationDate, "Enter the formation date"],
    [f.hasEin, "Enter the EIN"],
  ]);
  let offering = tally([
    [!!f.regType, "Choose the offering exemption"],
    [f.minInvestmentCents != null && f.minInvestmentCents > 0, "Set the minimum investment"],
    [f.targetRaiseCents != null, "Set the target raise"],
    [f.managementFeeSet, "Enter the management fee"],
    [f.carrySet, "Enter the carry"],
    [f.economicsStatus === "approved", "Have a second Harmonious reviewer approve the economics"],
  ]);
  if (offering.status === "in_progress" && f.economicsStatus === "draft" && f.managementFeeSet && f.carrySet) {
    offering = { status: "in_progress", next: "Have a second Harmonious reviewer approve the economics" };
  }
  const classes: Result = !f.hasMultipleClasses
    ? { status: "not_applicable", next: null }
    : f.classCount >= 1 && f.economicsStatus === "approved"
      ? { status: "complete", next: null }
      : f.classCount >= 1
        ? { status: "in_progress", next: "Approve the class economics" }
        : { status: "not_started", next: "Add at least one class" };
  const documents: Result = f.documentsStatus ? f.documentsStatus : f.documentCount > 0 ? { status: "in_progress", next: "Review offering documents" } : { status: "not_started", next: "Upload the offering documents" };
  const banking: Result =
    f.bankingState === "active" ? { status: "complete", next: null }
      : f.bankingState === "none" ? { status: "not_started", next: "Choose how the fund's bank account is set up" }
        : { status: "in_progress", next: "Bank account setup is in progress" };
  const admin: Result = f.adminConfigured ? { status: "complete", next: null } : { status: "not_started", next: "Record which Harmonious services apply" };
  const all = [details, entity, offering, classes, documents, banking, admin];
  const review: Result = all.every((r) => r.status === "complete" || r.status === "not_applicable")
    ? { status: "complete", next: null }
    : all.some((r) => r.status !== "not_started")
      ? { status: "in_progress", next: all.find((r) => r.next)?.next ?? null }
      : { status: "not_started", next: all.find((r) => r.next)?.next ?? null };
  return {
    fund_details: details,
    entity_ein: entity,
    offering_economics: offering,
    classes,
    offering_documents: documents,
    banking,
    administration: admin,
    review,
  };
}

/** Before a Legal Name change: warn when downstream records already rely on it. */
export function legalNameChangeWarning(input: { current: string | null; next: string; downstream: { investments: number; signedDocuments: number } }): string | null {
  if (!input.current || input.current.trim() === input.next.trim()) return null;
  const { investments, signedDocuments } = input.downstream;
  if (investments === 0 && signedDocuments === 0) return null;
  return `This fund already has ${investments} investment${investments === 1 ? "" : "s"} and ${signedDocuments} signed document${signedDocuments === 1 ? "" : "s"}. They keep the name they were created with; only new records use the new Legal Name.`;
}
