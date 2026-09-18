/**
 * Pure tax rules. No database access, no I/O, no authorization.
 *
 * Deliberate separations encoded here:
 *  - book capital, tax capital and outside basis are different concepts and
 *    never substituted for one another;
 *  - book-to-tax differences are their own ledger: book + adjustment = tax;
 *  - "generated" is not "filed"; "transmitted" is not "accepted";
 *  - a foreign investor's treatment depends on documentation, not on a guess;
 *  - the engine may *identify* a 1099 obligation but refuses to *determine*
 *    one when required information is missing.
 */

// ---------------------------------------------------------------- identity

export const TAX_CLASSIFICATIONS = [
  "us_individual",
  "partnership",
  "c_corporation",
  "s_corporation",
  "trust",
  "estate",
  "disregarded_entity",
  "tax_exempt",
  "government",
  "ira_retirement",
  "foreign_individual",
  "foreign_entity",
  "intermediary",
  "other",
] as const;
export type TaxClassification = (typeof TAX_CLASSIFICATIONS)[number];

export const FOREIGN_CLASSIFICATIONS: ReadonlySet<TaxClassification> = new Set([
  "foreign_individual",
  "foreign_entity",
  "intermediary",
]);

export function isForeignClassification(value: string): boolean {
  return FOREIGN_CLASSIFICATIONS.has(value as TaxClassification);
}

export function isTaxClassification(value: unknown): value is TaxClassification {
  return typeof value === "string" && (TAX_CLASSIFICATIONS as readonly string[]).includes(value);
}

export const TAX_DOCUMENT_FORMS = [
  "w9",
  "w8ben",
  "w8bene",
  "w8eci",
  "w8exp",
  "w8imy",
  "substitute_w9",
  "substitute_w8",
  "other_supporting",
] as const;
export type TaxDocumentForm = (typeof TAX_DOCUMENT_FORMS)[number];

const W8_FORMS: ReadonlySet<string> = new Set([
  "w8ben",
  "w8bene",
  "w8eci",
  "w8exp",
  "w8imy",
  "substitute_w8",
]);

export function isW8(form: string): boolean {
  return W8_FORMS.has(form);
}

/** The documentation a classification is expected to certify on. */
export function expectedDocumentForms(classification: string): TaxDocumentForm[] {
  if (classification === "foreign_individual") return ["w8ben", "substitute_w8"];
  if (classification === "foreign_entity") return ["w8bene", "w8eci", "w8exp", "substitute_w8"];
  if (classification === "intermediary") return ["w8imy"];
  return ["w9", "substitute_w9"];
}

/**
 * W-8 validity: the last day of the third calendar year after certification.
 * W-9 does not expire on a date; it expires when the facts change.
 */
export function documentExpiry(form: string, certificationDate: string | null): string | null {
  if (!isW8(form) || !certificationDate) return null;
  const year = Number(certificationDate.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return `${year + 3}-12-31`;
}

export type DocumentValidity = "valid" | "expired" | "missing" | "invalid" | "unreviewed";

export function documentValidityAsOf(
  doc: { form_type?: string; validation_status?: string; expires_on?: string | null } | null,
  asOf: string,
): DocumentValidity {
  if (!doc) return "missing";
  if (doc.validation_status === "invalid") return "invalid";
  if (doc.validation_status === "superseded") return "missing";
  if (doc.expires_on && doc.expires_on < asOf) return "expired";
  if (doc.validation_status === "expired") return "expired";
  if (doc.validation_status !== "valid") return "unreviewed";
  return "valid";
}

// ------------------------------------------------------------ sensitive data

const SSN_PATTERN = /\b\d{3}-?\d{2}-?\d{4}\b/;
const EIN_PATTERN = /\b\d{2}-\d{7}\b/;

/** Mask for display. Only ever the last four characters are stored at all. */
export function maskTin(last4: string | null | undefined, type?: string | null): string {
  if (!last4) return "No TIN on file";
  return type === "ein" ? `**-***${last4}` : `***-**-${last4}`;
}

/**
 * True when a payload carries something that looks like a full TIN/SSN.
 * Used to refuse writing such a value into JSON, events or browser payloads.
 */
export function containsRawTin(value: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (v: unknown): boolean => {
    if (typeof v === "string") return SSN_PATTERN.test(v) || EIN_PATTERN.test(v);
    if (typeof v !== "object" || v === null) return false;
    if (seen.has(v)) return false;
    seen.add(v);
    return Object.values(v as Record<string, unknown>).some(walk);
  };
  return walk(value);
}

export function assertNoRawTin(value: unknown, where: string): void {
  if (containsRawTin(value)) {
    throw new Error(`Refusing to store a full TIN/SSN in ${where}.`);
  }
}

// --------------------------------------------------------------- tax year

export const TAX_YEAR_STATUSES = [
  "not_started",
  "collecting_documents",
  "accounting_ready",
  "tax_adjustments",
  "allocation_review",
  "return_preparation",
  "review",
  "approved",
  "ready_to_file",
  "filed",
  "accepted",
  "rejected",
  "delivered",
  "amended",
] as const;
export type TaxYearStatus = (typeof TAX_YEAR_STATUSES)[number];

export const TAX_YEAR_FLOW: Record<TaxYearStatus, TaxYearStatus[]> = {
  not_started: ["collecting_documents"],
  collecting_documents: ["accounting_ready"],
  accounting_ready: ["tax_adjustments", "collecting_documents"],
  tax_adjustments: ["allocation_review", "accounting_ready"],
  allocation_review: ["return_preparation", "tax_adjustments"],
  return_preparation: ["review", "allocation_review"],
  review: ["approved", "return_preparation"],
  approved: ["ready_to_file", "review"],
  ready_to_file: ["filed"],
  filed: ["accepted", "rejected"],
  accepted: ["delivered", "amended"],
  rejected: ["return_preparation", "amended"],
  delivered: ["amended"],
  amended: ["return_preparation"],
};

export function canTransitionTaxYear(from: string, to: string): boolean {
  const allowed = TAX_YEAR_FLOW[from as TaxYearStatus];
  return Array.isArray(allowed) && allowed.includes(to as TaxYearStatus);
}

// --------------------------------------------------------- close readiness

export type ReadinessInput = {
  accountingPeriodsClosed: boolean;
  financialStatementsFinal: boolean;
  navFinal: boolean;
  navApplicable: boolean;
  capitalAccountsFinalized: boolean;
  capitalActivityFinalized: boolean;
  ownershipHistoryComplete: boolean;
  valuationsFinal: boolean;
  valuationsApplicable: boolean;
  taxDocumentsOutstanding: number;
  unclassifiedTransactions: number;
  documentExceptionsRecorded: boolean;
};

export type TaxException = {
  kind: string;
  severity: "blocking" | "warning";
  detail: string;
};

export function taxCloseReadiness(input: ReadinessInput): TaxException[] {
  const out: TaxException[] = [];
  const block = (kind: string, detail: string) =>
    out.push({ kind, severity: "blocking", detail });
  const warn = (kind: string, detail: string) => out.push({ kind, severity: "warning", detail });

  if (!input.accountingPeriodsClosed)
    block("accounting_not_closed", "The accounting year is not closed.");
  if (!input.financialStatementsFinal)
    block("statements_not_final", "Financial statements are not approved or published.");
  if (input.navApplicable && !input.navFinal)
    block("nav_not_final", "NAV for the year end is not approved.");
  if (!input.capitalAccountsFinalized)
    block("capital_not_final", "Investor capital accounts are not finalized.");
  if (!input.capitalActivityFinalized)
    block("capital_activity_open", "Contributions and distributions are not finalized.");
  if (!input.ownershipHistoryComplete)
    block("ownership_incomplete", "Ownership history for the year is incomplete.");
  if (input.valuationsApplicable && !input.valuationsFinal)
    warn("valuations_open", "Some valuations for the year are not effective.");
  if (input.taxDocumentsOutstanding > 0 && !input.documentExceptionsRecorded)
    block(
      "tax_documents_missing",
      `${input.taxDocumentsOutstanding} investor tax certification(s) are missing and no exception was recorded.`,
    );
  else if (input.taxDocumentsOutstanding > 0)
    warn(
      "tax_documents_excepted",
      `${input.taxDocumentsOutstanding} tax certification(s) outstanding with a recorded exception.`,
    );
  if (input.unclassifiedTransactions > 0)
    block(
      "transactions_unclassified",
      `${input.unclassifiedTransactions} tax-relevant transaction(s) are not classified.`,
    );
  return out;
}

export function blockingExceptions(list: TaxException[]): TaxException[] {
  return list.filter((e) => e.severity === "blocking");
}

// ----------------------------------------------------- book-to-tax ledger

export const ADJUSTMENT_CATEGORIES = [
  "depreciation",
  "organization_costs",
  "syndication_costs",
  "accrual_to_cash",
  "unrealized_gain_loss",
  "non_deductible",
  "meals_entertainment",
  "management_fee_timing",
  "carried_interest",
  "wash_sale",
  "section_704c",
  "other",
] as const;
export type AdjustmentCategory = (typeof ADJUSTMENT_CATEGORIES)[number];

export type BookTaxRow = {
  itemCode: string;
  bookAmountCents: number;
  adjustmentCents: number;
  differenceType: "timing" | "permanent";
};

/** Book + adjustment = tax. Book is never rewritten to reach the tax number. */
export function taxAmountCents(bookAmountCents: number, adjustmentCents: number): number {
  return bookAmountCents + adjustmentCents;
}

export function bookToTaxSummary(rows: BookTaxRow[]) {
  const book = rows.reduce((s, r) => s + r.bookAmountCents, 0);
  const timing = rows
    .filter((r) => r.differenceType === "timing")
    .reduce((s, r) => s + r.adjustmentCents, 0);
  const permanent = rows
    .filter((r) => r.differenceType === "permanent")
    .reduce((s, r) => s + r.adjustmentCents, 0);
  return {
    bookCents: book,
    timingCents: timing,
    permanentCents: permanent,
    adjustmentCents: timing + permanent,
    taxCents: book + timing + permanent,
  };
}

// ------------------------------------------------- separately stated items

export const TAX_ITEMS = [
  "ordinary_business_income",
  "net_rental_real_estate",
  "other_net_rental_income",
  "guaranteed_payments",
  "interest_income",
  "ordinary_dividends",
  "qualified_dividends",
  "royalties",
  "net_short_term_capital_gain",
  "net_long_term_capital_gain",
  "section_1231_gain",
  "other_income",
  "section_179_deduction",
  "other_deductions",
  "self_employment_earnings",
  "credits",
  "foreign_taxes_paid",
  "section_199a_income",
  "tax_exempt_income",
  "distributions",
  "nondeductible_expenses",
] as const;
export type TaxItem = (typeof TAX_ITEMS)[number];

/** K-1 (Form 1065) box for each modelled item. Presentation, not accounting. */
export const K1_BOX: Record<TaxItem, string> = {
  ordinary_business_income: "1",
  net_rental_real_estate: "2",
  other_net_rental_income: "3",
  guaranteed_payments: "4",
  interest_income: "5",
  ordinary_dividends: "6a",
  qualified_dividends: "6b",
  royalties: "7",
  net_short_term_capital_gain: "8",
  net_long_term_capital_gain: "9a",
  section_1231_gain: "10",
  other_income: "11",
  section_179_deduction: "12",
  other_deductions: "13",
  self_employment_earnings: "14",
  credits: "15",
  foreign_taxes_paid: "16",
  section_199a_income: "20Z",
  tax_exempt_income: "18B",
  distributions: "19A",
  nondeductible_expenses: "18C",
};

export function isTaxItem(value: unknown): value is TaxItem {
  return typeof value === "string" && (TAX_ITEMS as readonly string[]).includes(value);
}

// ------------------------------------------------ tax allocation machinery

export const TAX_ALLOCATION_METHODOLOGIES = [
  {
    code: "pro_rata_year_end",
    name: "Pro-rata on year-end ownership",
    description: "Each item is allocated on ownership percentages at year end.",
  },
  {
    code: "time_weighted_ownership",
    name: "Time-weighted ownership",
    description: "Each item is allocated on ownership weighted by days held in the year.",
  },
  {
    code: "targeted_capital",
    name: "Targeted capital accounts",
    description: "Items are allocated so ending tax capital equals the target from the agreement.",
  },
] as const;
export type TaxAllocationMethodology = (typeof TAX_ALLOCATION_METHODOLOGIES)[number]["code"];

export type Participant = {
  positionId: string;
  investorUserId: string;
  investmentProfileId: string | null;
  /** Share of the item, 0..1. Must sum to 1 across participants. */
  share: number;
};

/**
 * Allocate one whole-cent amount across participants with largest-remainder
 * rounding so the allocated amounts sum to the entity amount EXACTLY.
 */
export function allocateCents(amountCents: number, participants: Participant[]): number[] {
  if (participants.length === 0) return [];
  const sign = amountCents < 0 ? -1 : 1;
  const magnitude = Math.abs(amountCents);
  const raw = participants.map((p) => magnitude * p.share);
  const floors = raw.map((v) => Math.floor(v));
  let remainder = magnitude - floors.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (const entry of order) {
    if (remainder <= 0) break;
    out[entry.i] = (out[entry.i] ?? 0) + 1;
    remainder -= 1;
  }
  return out.map((v) => v * sign);
}

export function normalizeShares(participants: Participant[]): Participant[] {
  const total = participants.reduce((s, p) => s + p.share, 0);
  if (total <= 0) return participants.map((p) => ({ ...p, share: 0 }));
  return participants.map((p) => ({ ...p, share: p.share / total }));
}

export type AllocatedLine = {
  positionId: string;
  investorUserId: string;
  investmentProfileId: string | null;
  itemCode: string;
  k1Box: string | null;
  amountCents: number;
  ownershipPct: number;
};

export function allocateTaxItems(
  entityTotals: Record<string, number>,
  participants: Participant[],
): AllocatedLine[] {
  const normalized = normalizeShares(participants);
  const lines: AllocatedLine[] = [];
  for (const [itemCode, amount] of Object.entries(entityTotals)) {
    const amounts = allocateCents(amount, normalized);
    normalized.forEach((p, i) => {
      lines.push({
        positionId: p.positionId,
        investorUserId: p.investorUserId,
        investmentProfileId: p.investmentProfileId,
        itemCode,
        k1Box: isTaxItem(itemCode) ? K1_BOX[itemCode] : null,
        amountCents: amounts[i] ?? 0,
        ownershipPct: p.share,
      });
    });
  }
  return lines;
}

export function sumByItem(lines: { itemCode: string; amountCents: number }[]) {
  const out: Record<string, number> = {};
  for (const line of lines) out[line.itemCode] = (out[line.itemCode] ?? 0) + line.amountCents;
  return out;
}

/** A single unexplained cent is a blocking exception. */
export function reconcileTaxAllocations(
  entityTotals: Record<string, number>,
  allocated: Record<string, number>,
): { differences: Record<string, number>; totalDifferenceCents: number; exceptions: TaxException[] } {
  const keys = new Set([...Object.keys(entityTotals), ...Object.keys(allocated)]);
  const differences: Record<string, number> = {};
  const exceptions: TaxException[] = [];
  let total = 0;
  for (const key of keys) {
    const diff = (entityTotals[key] ?? 0) - (allocated[key] ?? 0);
    differences[key] = diff;
    total += Math.abs(diff);
    if (diff !== 0) {
      exceptions.push({
        kind: "allocation_out_of_balance",
        severity: "blocking",
        detail: `${key} differs by ${diff} cent(s) between the partnership and the partners.`,
      });
    }
  }
  return { differences, totalDifferenceCents: total, exceptions };
}

// ------------------------------------------------------ return lifecycles

export const ENTITY_RETURN_STATUSES = [
  "draft",
  "prepared",
  "review",
  "approved",
  "ready_to_file",
  "transmitted",
  "accepted",
  "rejected",
  "amended",
  "superseded",
] as const;
export type EntityReturnStatus = (typeof ENTITY_RETURN_STATUSES)[number];

export const ENTITY_RETURN_FLOW: Record<EntityReturnStatus, EntityReturnStatus[]> = {
  draft: ["prepared"],
  prepared: ["review", "draft"],
  review: ["approved", "prepared"],
  approved: ["ready_to_file", "review"],
  ready_to_file: ["transmitted"],
  transmitted: ["accepted", "rejected"],
  accepted: ["amended"],
  rejected: ["prepared", "amended"],
  amended: [],
  superseded: [],
};

export function canTransitionEntityReturn(from: string, to: string): boolean {
  const allowed = ENTITY_RETURN_FLOW[from as EntityReturnStatus];
  return Array.isArray(allowed) && allowed.includes(to as EntityReturnStatus);
}

export const K1_STATUSES = [
  "draft",
  "review",
  "approved",
  "final",
  "delivered",
  "superseded",
  "amended",
] as const;
export type K1Status = (typeof K1_STATUSES)[number];

export const K1_FLOW: Record<K1Status, K1Status[]> = {
  draft: ["review"],
  review: ["approved", "draft"],
  approved: ["final", "review"],
  final: ["delivered", "superseded"],
  delivered: ["superseded"],
  superseded: [],
  amended: ["review"],
};

export function canTransitionK1(from: string, to: string): boolean {
  const allowed = K1_FLOW[from as K1Status];
  return Array.isArray(allowed) && allowed.includes(to as K1Status);
}

const IMMUTABLE_FORM_STATUSES: ReadonlySet<string> = new Set([
  "final",
  "delivered",
  "filed",
  "recipient_delivered",
  "accepted",
  "superseded",
  "corrected",
  "amended",
]);

/** Final, filed and delivered forms are never rewritten in place. */
export function isImmutableTaxForm(status: string): boolean {
  return IMMUTABLE_FORM_STATUSES.has(status);
}

export const FILING_STATUSES = [
  "not_filed",
  "ready_to_file",
  "transmitted",
  "accepted",
  "rejected",
] as const;
export type FilingStatus = (typeof FILING_STATUSES)[number];

/**
 * Generating a PDF never changes the filing status, and transmitting never
 * implies acceptance. These are separate facts about separate events.
 */
export function filingStatusAfterGeneration(current: string): FilingStatus {
  return (FILING_STATUSES as readonly string[]).includes(current)
    ? (current as FilingStatus)
    : "not_filed";
}

export function isFiled(filingStatus: string): boolean {
  return filingStatus === "transmitted" || filingStatus === "accepted";
}

export function isAccepted(filingStatus: string): boolean {
  return filingStatus === "accepted";
}

/** Maker/checker: the preparer of a material form may not give final approval. */
export function segregationError(
  preparedBy: string | null | undefined,
  approverId: string,
): string | null {
  if (preparedBy && preparedBy === approverId) {
    return "The preparer of a tax return cannot give it final approval.";
  }
  return null;
}

// ------------------------------------------------------------ withholding

export const WITHHOLDING_INCOME_CODES = [
  { code: "01", label: "Interest paid by U.S. obligors" },
  { code: "06", label: "Dividends paid by U.S. corporations" },
  { code: "23", label: "Other income" },
  { code: "27", label: "Publicly traded partnership distributions" },
  { code: "50", label: "Other income (partnership ECI)" },
] as const;

export const STATUTORY_RATE_BPS = 3000;

export type WithholdingDecision = {
  rateBps: number;
  basis: "statutory" | "treaty" | "exempt" | "effectively_connected";
  reasons: string[];
  exceptions: TaxException[];
};

/**
 * Withholding never assumes: the treaty rate applies only with a valid W-8
 * claiming it. Missing or expired documentation falls back to the statutory
 * rate AND raises an exception for Tax Operations.
 */
export function withholdingDecision(input: {
  classification: string;
  documentValidity: DocumentValidity;
  documentForm?: string | null;
  treatyClaimed?: boolean;
  treatyRateBps?: number | null;
  exemptionCode?: string | null;
}): WithholdingDecision {
  const reasons: string[] = [];
  const exceptions: TaxException[] = [];

  if (!isForeignClassification(input.classification)) {
    reasons.push("Payee is not classified as foreign; chapter 3 withholding does not apply.");
    return { rateBps: 0, basis: "exempt", reasons, exceptions };
  }

  if (input.documentValidity !== "valid") {
    exceptions.push({
      kind: `w8_${input.documentValidity}`,
      severity: "blocking",
      detail: `Foreign payee documentation is ${input.documentValidity}; statutory withholding applied.`,
    });
    reasons.push("No valid W-8 on file at the payment date.");
    return { rateBps: STATUTORY_RATE_BPS, basis: "statutory", reasons, exceptions };
  }

  if (input.documentForm === "w8eci") {
    reasons.push("W-8ECI on file: income is effectively connected and reported separately.");
    return { rateBps: 0, basis: "effectively_connected", reasons, exceptions };
  }

  if (input.documentForm === "w8exp" || input.exemptionCode) {
    reasons.push("Documented exemption applies.");
    return { rateBps: 0, basis: "exempt", reasons, exceptions };
  }

  if (input.treatyClaimed) {
    if (input.treatyRateBps === null || input.treatyRateBps === undefined) {
      exceptions.push({
        kind: "treaty_rate_missing",
        severity: "blocking",
        detail: "A treaty benefit is claimed but no rate is recorded; statutory rate applied.",
      });
      reasons.push("Treaty claimed without a documented rate.");
      return { rateBps: STATUTORY_RATE_BPS, basis: "statutory", reasons, exceptions };
    }
    reasons.push("Valid W-8 claiming treaty benefits.");
    return { rateBps: input.treatyRateBps, basis: "treaty", reasons, exceptions };
  }

  reasons.push("Valid W-8 without a treaty claim.");
  return { rateBps: STATUTORY_RATE_BPS, basis: "statutory", reasons, exceptions };
}

export function withheldCents(grossCents: number, rateBps: number): number {
  return Math.round((grossCents * rateBps) / 10000);
}

export type WithholdingRow = {
  id: string;
  recipientUserId: string | null;
  investmentProfileId: string | null;
  incomeCode: string;
  chapter?: string;
  country: string | null;
  grossCents: number;
  withheldCents: number;
  rateBps: number;
  exemptionCode?: string | null;
};

/**
 * 1042-S records are built from the underlying withholding transactions,
 * grouped by recipient profile + income code + chapter — never from a plain
 * annual distribution total.
 */
export function build1042sRecords(rows: WithholdingRow[]) {
  const groups = new Map<
    string,
    {
      recipientUserId: string | null;
      investmentProfileId: string | null;
      incomeCode: string;
      chapter: string;
      country: string | null;
      grossCents: number;
      withheldCents: number;
      rateBps: number;
      exemptionCode: string | null;
      withholdingRecordIds: string[];
    }
  >();
  for (const row of rows) {
    const chapter = row.chapter ?? "3";
    const key = [row.investmentProfileId ?? row.recipientUserId, row.incomeCode, chapter].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.grossCents += row.grossCents;
      existing.withheldCents += row.withheldCents;
      existing.withholdingRecordIds.push(row.id);
      if (existing.rateBps !== row.rateBps) existing.rateBps = row.rateBps;
    } else {
      groups.set(key, {
        recipientUserId: row.recipientUserId,
        investmentProfileId: row.investmentProfileId,
        incomeCode: row.incomeCode,
        chapter,
        country: row.country,
        grossCents: row.grossCents,
        withheldCents: row.withheldCents,
        rateBps: row.rateBps,
        exemptionCode: row.exemptionCode ?? null,
        withholdingRecordIds: [row.id],
      });
    }
  }
  return [...groups.values()];
}

export function reconcile1042(
  recipientTotals: { grossCents: number; withheldCents: number },
  controlTotals: { grossCents: number; withheldCents: number },
): TaxException[] {
  const out: TaxException[] = [];
  if (recipientTotals.grossCents !== controlTotals.grossCents) {
    out.push({
      kind: "form_1042_gross_mismatch",
      severity: "blocking",
      detail: `Recipient gross income totals ${recipientTotals.grossCents} against 1042 control total ${controlTotals.grossCents}.`,
    });
  }
  if (recipientTotals.withheldCents !== controlTotals.withheldCents) {
    out.push({
      kind: "form_1042_withholding_mismatch",
      severity: "blocking",
      detail: `Recipient withholding totals ${recipientTotals.withheldCents} against 1042 control total ${controlTotals.withheldCents}.`,
    });
  }
  return out;
}

// ---------------------------------------------------- 1099 determination

export const FORM_1099_TYPES = [
  "1099-NEC",
  "1099-MISC",
  "1099-INT",
  "1099-DIV",
  "1099-B",
  "1099-R",
] as const;
export type Form1099Type = (typeof FORM_1099_TYPES)[number];

export const PAYMENT_TYPE_TO_FORM: Record<string, Form1099Type> = {
  nonemployee_compensation: "1099-NEC",
  professional_services: "1099-NEC",
  rent: "1099-MISC",
  other_income: "1099-MISC",
  legal_settlement: "1099-MISC",
  interest: "1099-INT",
  dividend: "1099-DIV",
  broker_proceeds: "1099-B",
  retirement_distribution: "1099-R",
};

/** Classifications that ordinarily remove a payment from 1099 reporting. */
const EXEMPT_PAYEE_CLASSIFICATIONS: ReadonlySet<string> = new Set([
  "c_corporation",
  "s_corporation",
  "tax_exempt",
  "government",
]);

export const REPORTING_THRESHOLD_CENTS: Record<Form1099Type, number> = {
  "1099-NEC": 60000,
  "1099-MISC": 60000,
  "1099-INT": 1000,
  "1099-DIV": 1000,
  "1099-B": 0,
  "1099-R": 0,
};

export type DeterminationInput = {
  paymentType: string;
  grossCents: number;
  payeeClassification: string | null;
  documentValidity: DocumentValidity;
  filingResponsibility: string;
  arrangementSupportsForm?: boolean;
};

export type Determination = {
  formType: Form1099Type | null;
  status: "identified" | "documentation_check" | "needs_review" | "calculated" | "excluded";
  reportableCents: number | null;
  reasons: string[];
  filingResponsibility: string;
};

/**
 * Identify a potential reporting obligation. Where required information is
 * missing, this returns `needs_review` and refuses to decide — the question
 * goes to Tax Operations, not to a default.
 */
export function determine1099(input: DeterminationInput): Determination {
  const reasons: string[] = [];
  const formType = PAYMENT_TYPE_TO_FORM[input.paymentType] ?? null;

  if (!formType) {
    reasons.push(`No 1099 form type is mapped to payment type "${input.paymentType}".`);
    return {
      formType: null,
      status: "needs_review",
      reportableCents: null,
      reasons,
      filingResponsibility: input.filingResponsibility,
    };
  }

  if (formType === "1099-R" && input.arrangementSupportsForm !== true) {
    reasons.push("1099-R requires a retirement or custodial arrangement that supports reporting.");
    return {
      formType,
      status: "needs_review",
      reportableCents: null,
      reasons,
      filingResponsibility: input.filingResponsibility,
    };
  }

  if (input.filingResponsibility === "undetermined") {
    reasons.push("Filing responsibility for this payer has not been determined.");
    return {
      formType,
      status: "needs_review",
      reportableCents: null,
      reasons,
      filingResponsibility: input.filingResponsibility,
    };
  }

  if (input.filingResponsibility !== "harmonious") {
    reasons.push(`Filing responsibility sits with: ${input.filingResponsibility}.`);
    return {
      formType,
      status: "excluded",
      reportableCents: 0,
      reasons,
      filingResponsibility: input.filingResponsibility,
    };
  }

  if (!input.payeeClassification) {
    reasons.push("Payee tax classification is unknown.");
    return {
      formType,
      status: "documentation_check",
      reportableCents: null,
      reasons,
      filingResponsibility: input.filingResponsibility,
    };
  }

  if (isForeignClassification(input.payeeClassification)) {
    reasons.push("Foreign payee: reportable on 1042-S, not on a 1099.");
    return {
      formType: null,
      status: "excluded",
      reportableCents: 0,
      reasons,
      filingResponsibility: input.filingResponsibility,
    };
  }

  if (input.documentValidity !== "valid") {
    reasons.push(`Payee W-9 is ${input.documentValidity}.`);
    return {
      formType,
      status: "documentation_check",
      reportableCents: null,
      reasons,
      filingResponsibility: input.filingResponsibility,
    };
  }

  if (
    EXEMPT_PAYEE_CLASSIFICATIONS.has(input.payeeClassification) &&
    formType !== "1099-MISC" &&
    input.paymentType !== "legal_settlement"
  ) {
    reasons.push(`Payee classification ${input.payeeClassification} is ordinarily exempt.`);
    return {
      formType,
      status: "excluded",
      reportableCents: 0,
      reasons,
      filingResponsibility: input.filingResponsibility,
    };
  }

  const threshold = REPORTING_THRESHOLD_CENTS[formType];
  if (input.grossCents < threshold) {
    reasons.push(`Below the ${formType} reporting threshold.`);
    return {
      formType,
      status: "excluded",
      reportableCents: 0,
      reasons,
      filingResponsibility: input.filingResponsibility,
    };
  }

  reasons.push(`${formType} reporting identified from authoritative payment records.`);
  return {
    formType,
    status: "calculated",
    reportableCents: input.grossCents,
    reasons,
    filingResponsibility: input.filingResponsibility,
  };
}

export const FORM_1099_STATUSES = [
  "identified",
  "documentation_check",
  "calculated",
  "draft",
  "review",
  "approved",
  "ready_to_file",
  "filed",
  "recipient_delivered",
  "corrected",
  "superseded",
] as const;
export type Form1099Status = (typeof FORM_1099_STATUSES)[number];

export const FORM_1099_FLOW: Record<Form1099Status, Form1099Status[]> = {
  identified: ["documentation_check", "calculated"],
  documentation_check: ["calculated", "identified"],
  calculated: ["draft"],
  draft: ["review"],
  review: ["approved", "draft"],
  approved: ["ready_to_file", "review"],
  ready_to_file: ["filed"],
  filed: ["recipient_delivered", "corrected"],
  recipient_delivered: ["corrected"],
  corrected: [],
  superseded: [],
};

export function canTransition1099(from: string, to: string): boolean {
  const allowed = FORM_1099_FLOW[from as Form1099Status];
  return Array.isArray(allowed) && allowed.includes(to as Form1099Status);
}

/**
 * The same authoritative payment must never be reported twice on final forms.
 * Returns the payment ids that appear on more than one non-corrected form.
 */
export function duplicateReportedPayments(
  forms: { id: string; status: string; isCorrection: boolean; paymentRecordIds: string[] }[],
): string[] {
  const counts = new Map<string, number>();
  for (const form of forms) {
    if (form.isCorrection) continue;
    if (form.status === "superseded" || form.status === "corrected") continue;
    for (const paymentId of form.paymentRecordIds) {
      counts.set(paymentId, (counts.get(paymentId) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}

export function reconcile1099Totals(
  forms: { formType: string; totalAmountCents: number; withheldCents: number }[],
  payments: { formType: string | null; reportableCents: number; withheldCents: number }[],
): TaxException[] {
  const byForm = (list: { formType: string | null; amount: number; withheld: number }[]) => {
    const out: Record<string, { amount: number; withheld: number }> = {};
    for (const row of list) {
      if (!row.formType) continue;
      const bucket = out[row.formType] ?? { amount: 0, withheld: 0 };
      bucket.amount += row.amount;
      bucket.withheld += row.withheld;
      out[row.formType] = bucket;
    }
    return out;
  };
  const formTotals = byForm(
    forms.map((f) => ({ formType: f.formType, amount: f.totalAmountCents, withheld: f.withheldCents })),
  );
  const paymentTotals = byForm(
    payments.map((p) => ({ formType: p.formType, amount: p.reportableCents, withheld: p.withheldCents })),
  );
  const exceptions: TaxException[] = [];
  for (const formType of new Set([...Object.keys(formTotals), ...Object.keys(paymentTotals)])) {
    const a = formTotals[formType] ?? { amount: 0, withheld: 0 };
    const b = paymentTotals[formType] ?? { amount: 0, withheld: 0 };
    if (a.amount !== b.amount) {
      exceptions.push({
        kind: "form_1099_total_mismatch",
        severity: "blocking",
        detail: `${formType} forms total ${a.amount} against source payments of ${b.amount}.`,
      });
    }
    if (a.withheld !== b.withheld) {
      exceptions.push({
        kind: "form_1099_withholding_mismatch",
        severity: "blocking",
        detail: `${formType} withholding totals ${a.withheld} against source payments of ${b.withheld}.`,
      });
    }
  }
  return exceptions;
}

// --------------------------------------------------------- individual tax

export const FILING_UNIT_STATUSES = [
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household",
  "qualifying_surviving_spouse",
] as const;
export type FilingUnitStatus = (typeof FILING_UNIT_STATUSES)[number];

/**
 * Being someone's spouse is not authorization. Joint access to a return
 * requires an explicit, recorded authorization for that tax year.
 */
export function memberMayAccessReturn(
  member: { relationship?: string; access_authorized?: boolean; tax_year?: number } | null,
  taxYear: number,
): boolean {
  if (!member) return false;
  if (member.tax_year !== undefined && member.tax_year !== taxYear) return false;
  return member.access_authorized === true;
}

export const INDIVIDUAL_SCHEDULES = [
  "1040",
  "schedule_1",
  "schedule_a",
  "schedule_b",
  "schedule_c",
  "schedule_d",
  "schedule_e",
  "schedule_se",
  "form_8949",
] as const;
export type IndividualSchedule = (typeof INDIVIDUAL_SCHEDULES)[number];

export const INDIVIDUAL_DOCUMENT_TYPES = [
  "k1_1065",
  "k1_1120s",
  "k1_1041",
  "1099-NEC",
  "1099-MISC",
  "1099-INT",
  "1099-DIV",
  "1099-B",
  "1099-R",
  "1042-S",
  "w2",
  "1098",
  "1098-E",
  "1098-T",
  "brokerage_statement",
  "estimated_payment",
  "withholding_record",
  "deduction_document",
  "credit_document",
  "carryforward",
  "other",
] as const;
export type IndividualDocumentType = (typeof INDIVIDUAL_DOCUMENT_TYPES)[number];

export type ReturnLine = {
  scheduleCode: IndividualSchedule;
  lineCode: string;
  lineLabel: string;
  amountCents: number;
  provenance: {
    documentId: string;
    documentType: string;
    field: string;
    sourceTable: string | null;
    sourceId: string | null;
    sourceVersion: number | null;
  }[];
};

type MappingRule = {
  schedule: IndividualSchedule;
  line: string;
  label: string;
  field: string;
};

/**
 * Versioned mapping from a source tax document field to a return line.
 * Calculation rules live here, never inside a component.
 */
export const CALCULATION_VERSION = "ind-1040-v1";

export const DOCUMENT_LINE_MAP: Record<string, MappingRule[]> = {
  w2: [
    { schedule: "1040", line: "1a", label: "Wages, salaries, tips", field: "wages_cents" },
    { schedule: "1040", line: "25a", label: "Federal income tax withheld (W-2)", field: "federal_withheld_cents" },
  ],
  "1099-INT": [
    { schedule: "schedule_b", line: "1", label: "Interest income", field: "interest_cents" },
    { schedule: "1040", line: "25b", label: "Federal income tax withheld (1099)", field: "federal_withheld_cents" },
  ],
  "1099-DIV": [
    { schedule: "schedule_b", line: "5", label: "Ordinary dividends", field: "ordinary_dividends_cents" },
    { schedule: "1040", line: "3a", label: "Qualified dividends", field: "qualified_dividends_cents" },
  ],
  "1099-NEC": [
    { schedule: "schedule_c", line: "1", label: "Gross receipts", field: "nonemployee_compensation_cents" },
  ],
  "1099-MISC": [
    { schedule: "schedule_1", line: "8z", label: "Other income", field: "other_income_cents" },
    { schedule: "schedule_e", line: "3", label: "Rents received", field: "rent_cents" },
  ],
  "1099-B": [
    { schedule: "form_8949", line: "proceeds", label: "Proceeds from broker transactions", field: "proceeds_cents" },
    { schedule: "form_8949", line: "basis", label: "Cost or other basis", field: "cost_basis_cents" },
  ],
  "1099-R": [
    { schedule: "1040", line: "5b", label: "Pensions and annuities, taxable", field: "taxable_amount_cents" },
  ],
  k1_1065: [
    { schedule: "schedule_e", line: "28-ordinary", label: "Partnership ordinary income", field: "ordinary_business_income" },
    { schedule: "schedule_b", line: "1", label: "Interest income", field: "interest_income" },
    { schedule: "schedule_b", line: "5", label: "Ordinary dividends", field: "ordinary_dividends" },
    { schedule: "schedule_d", line: "12", label: "Long-term capital gain", field: "net_long_term_capital_gain" },
    { schedule: "schedule_d", line: "5", label: "Short-term capital gain", field: "net_short_term_capital_gain" },
    { schedule: "schedule_se", line: "2", label: "Self-employment earnings", field: "self_employment_earnings" },
  ],
  "1042-S": [
    { schedule: "1040", line: "25c", label: "Other federal withholding (1042-S)", field: "withheld_cents" },
  ],
  estimated_payment: [
    { schedule: "1040", line: "26", label: "Estimated tax payments", field: "amount_cents" },
  ],
  1098: [{ schedule: "schedule_a", line: "8a", label: "Home mortgage interest", field: "mortgage_interest_cents" }],
};

export type SourceDocument = {
  id: string;
  documentType: string;
  structuredData: Record<string, unknown>;
  sourceTable?: string | null;
  sourceId?: string | null;
  sourceVersion?: number | null;
  status?: string;
};

/** Build return lines with full provenance from imported documents. */
export function buildReturnLines(documents: SourceDocument[]): ReturnLine[] {
  const byKey = new Map<string, ReturnLine>();
  for (const doc of documents) {
    if (doc.status === "excluded" || doc.status === "superseded") continue;
    const rules = DOCUMENT_LINE_MAP[doc.documentType] ?? [];
    for (const rule of rules) {
      const raw = doc.structuredData[rule.field];
      if (raw === undefined || raw === null) continue;
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount === 0) continue;
      const key = `${rule.schedule}|${rule.line}`;
      const existing = byKey.get(key);
      const provenance = {
        documentId: doc.id,
        documentType: doc.documentType,
        field: rule.field,
        sourceTable: doc.sourceTable ?? null,
        sourceId: doc.sourceId ?? null,
        sourceVersion: doc.sourceVersion ?? null,
      };
      if (existing) {
        existing.amountCents += amount;
        existing.provenance.push(provenance);
      } else {
        byKey.set(key, {
          scheduleCode: rule.schedule,
          lineCode: rule.line,
          lineLabel: rule.label,
          amountCents: amount,
          provenance: [provenance],
        });
      }
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.scheduleCode.localeCompare(b.scheduleCode) || a.lineCode.localeCompare(b.lineCode),
  );
}

export function missingInformation(documents: SourceDocument[]): TaxException[] {
  const out: TaxException[] = [];
  for (const doc of documents) {
    if (doc.status === "requested") {
      out.push({
        kind: "document_outstanding",
        severity: "blocking",
        detail: `${doc.documentType} has been requested but not received.`,
      });
      continue;
    }
    const rules = DOCUMENT_LINE_MAP[doc.documentType] ?? [];
    if (rules.length === 0) continue;
    const hasAny = rules.some((r) => doc.structuredData[r.field] !== undefined);
    if (!hasAny) {
      out.push({
        kind: "document_unparsed",
        severity: "warning",
        detail: `${doc.documentType} carries no structured amounts yet.`,
      });
    }
  }
  return out;
}

export const RETURN_1040_STATUSES = [
  "document_collection",
  "organizer",
  "data_import",
  "calculation",
  "missing_information",
  "preparer_review",
  "taxpayer_review",
  "approved",
  "ready_to_file",
  "transmitted",
  "accepted",
  "rejected",
  "delivered",
  "amended",
  "superseded",
] as const;
export type Return1040Status = (typeof RETURN_1040_STATUSES)[number];

export const RETURN_1040_FLOW: Record<Return1040Status, Return1040Status[]> = {
  document_collection: ["organizer"],
  organizer: ["data_import", "document_collection"],
  data_import: ["calculation", "missing_information"],
  calculation: ["preparer_review", "missing_information"],
  missing_information: ["data_import", "calculation"],
  preparer_review: ["taxpayer_review", "calculation"],
  taxpayer_review: ["approved", "preparer_review"],
  approved: ["ready_to_file", "taxpayer_review"],
  ready_to_file: ["transmitted"],
  transmitted: ["accepted", "rejected"],
  accepted: ["delivered", "amended"],
  rejected: ["preparer_review", "amended"],
  delivered: ["amended"],
  amended: ["data_import"],
  superseded: [],
};

export function canTransition1040(from: string, to: string): boolean {
  const allowed = RETURN_1040_FLOW[from as Return1040Status];
  return Array.isArray(allowed) && allowed.includes(to as Return1040Status);
}

// ------------------------------------------------------------- workpapers

export const TAX_WORKPAPER_KINDS = [
  "book_to_tax_reconciliation",
  "tax_trial_balance",
  "partner_allocation_reconciliation",
  "tax_capital_reconciliation",
  "tax_document_completeness",
  "k1_control_totals",
  "form_1099_control_totals",
  "withholding_reconciliation",
  "form_1042_reconciliation",
  "individual_return_source_reconciliation",
  "amended_return_impact",
] as const;
export type TaxWorkpaperKind = (typeof TAX_WORKPAPER_KINDS)[number];

export const WORKPAPER_FLOW: Record<string, string[]> = {
  draft: ["prepared"],
  prepared: ["reviewed", "draft"],
  reviewed: ["approved", "prepared"],
  approved: ["superseded"],
  superseded: [],
};

export function canTransitionTaxWorkpaper(from: string, to: string): boolean {
  const allowed = WORKPAPER_FLOW[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function workpaperSignoffError(
  preparedBy: string | null | undefined,
  reviewerId: string,
): string | null {
  if (!preparedBy) return "A workpaper must be prepared before it can be reviewed.";
  if (preparedBy === reviewerId) return "A tax workpaper cannot be reviewed by its preparer.";
  return null;
}

// ------------------------------------------------------- source manifests

export type TaxSourceManifest = {
  taxYear: number;
  offeringId?: string | null;
  householdId?: string | null;
  accountingPeriodIds?: string[];
  financialReportIds?: string[];
  navVersionId?: string | null;
  navVersion?: number | null;
  allocationRunId?: string | null;
  capitalAccountIds?: string[];
  valuationVersionIds?: string[];
  taxAdjustmentIds?: string[];
  taxAllocationRunId?: string | null;
  taxAllocationVersion?: number | null;
  ownershipSnapshot?: unknown;
  taxDocumentIds?: string[];
  withholdingRecordIds?: string[];
  inputFormIds?: string[];
  methodologyCode?: string | null;
  methodologyVersion?: number | null;
  calculationVersion?: string | null;
  preparedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
  generatedAt?: string | null;
};

export function missingManifestFields(
  manifest: TaxSourceManifest | null | undefined,
  required: (keyof TaxSourceManifest)[],
): string[] {
  if (!manifest) return required.map(String);
  return required
    .filter((key) => {
      const value = manifest[key];
      return value === null || value === undefined || (Array.isArray(value) && value.length === 0);
    })
    .map(String);
}

// -------------------------------------------------------- provider bridge

export const PROVIDER_OPERATIONS = [
  "exportTaxPackage",
  "sendToTaxProvider",
  "receivePreparedReturn",
  "validateReturn",
  "receiveFilingStatus",
  "importFinalTaxForms",
] as const;
export type ProviderOperation = (typeof PROVIDER_OPERATIONS)[number];

/**
 * A provider can report a status, but never promotes a Harmonious record past
 * review on its own. Inbound work always lands back in a reviewable state.
 */
export function statusFromProvider(operation: ProviderOperation, providerStatus: string | null) {
  if (operation === "receiveFilingStatus") {
    if (providerStatus === "accepted") return "accepted";
    if (providerStatus === "rejected") return "rejected";
    return null;
  }
  if (operation === "receivePreparedReturn" || operation === "importFinalTaxForms") return "review";
  return null;
}

// --------------------------------------------------------- tax capabilities

export const TAX_DELEGATION_CAPABILITIES = [
  "view_tax_documents",
  "view_tax_returns",
  "prepare_entity_return",
  "review_entity_return",
  "prepare_individual_return",
  "review_individual_return",
  "request_tax_information",
  "deliver_tax_return",
  "manage_tax_workpapers",
] as const;
export type TaxDelegationCapability = (typeof TAX_DELEGATION_CAPABILITIES)[number];

/** Which explicit capability each tax surface demands. */
export const TAX_RESOURCE_CAPABILITY = {
  investor_tax_documents: "view_tax_documents",
  entity_return_view: "view_tax_returns",
  entity_return_prepare: "prepare_entity_return",
  entity_return_review: "review_entity_return",
  individual_return_view: "view_tax_returns",
  individual_return_prepare: "prepare_individual_return",
  individual_return_review: "review_individual_return",
  tax_information_request: "request_tax_information",
  tax_return_delivery: "deliver_tax_return",
  tax_workpapers: "manage_tax_workpapers",
} as const;
export type TaxResource = keyof typeof TAX_RESOURCE_CAPABILITY;

/**
 * General financial reporting access never implies tax access, and preparing
 * a return never implies authority to file, sign or move money.
 */
export function impliesTaxAccess(capability: string): boolean {
  return (TAX_DELEGATION_CAPABILITIES as readonly string[]).includes(capability);
}

export function impliesFilingAuthority(_capability: string): boolean {
  return false;
}

/** Entity-return access is not individual-return access, and vice versa. */
export function coversResource(granted: string[], resource: TaxResource): boolean {
  return granted.includes(TAX_RESOURCE_CAPABILITY[resource]);
}

// --------------------------------------------------- money movement guard

/**
 * Step 8 deliberately ships no tax money movement. Any attempt to route a
 * payment, refund, direct debit or estimated payment through the tax
 * subsystem is refused here, in one place.
 */
export const TAX_MONEY_MOVEMENT_DISABLED = true;

export function assertNoTaxMoneyMovement(operation: string): never {
  throw new Error(
    `Tax money movement is not enabled (${operation}). Payments, refunds and estimated payments require the later transaction-authority phase.`,
  );
}
