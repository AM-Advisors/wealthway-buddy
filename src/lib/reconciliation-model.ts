/**
 * The automated cash classification engine.
 *
 * Pure functions: given a bank transaction and the platform records that could
 * explain it, they propose a transaction type, a confidence, the reasons behind
 * it and any conflicts. They never decide anything on their own — confidence is
 * evidence, not approval, and no proposal is invented merely to make a
 * transaction reconcile.
 */

export const CASH_TRANSACTION_TYPES = [
  "investor_contribution",
  "capital_call",
  "subscription_receipt",
  "distribution",
  "management_fee",
  "fund_expense",
  "organizational_expense",
  "portfolio_investment",
  "investment_proceeds",
  "interest_income",
  "dividend_income",
  "internal_transfer",
  "tax_payment",
  "withholding",
  "receivable_receipt",
  "payable_settlement",
  "other",
] as const;
export type CashTransactionType = (typeof CASH_TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<CashTransactionType, string> = {
  investor_contribution: "Investor contribution",
  capital_call: "Capital call receipt",
  subscription_receipt: "Subscription receipt",
  distribution: "Distribution paid",
  management_fee: "Management fee",
  fund_expense: "Fund expense",
  organizational_expense: "Organisational expense",
  portfolio_investment: "Portfolio investment",
  investment_proceeds: "Investment proceeds",
  interest_income: "Interest",
  dividend_income: "Dividend",
  internal_transfer: "Transfer",
  tax_payment: "Tax payment",
  withholding: "Withholding",
  receivable_receipt: "Receivable received",
  payable_settlement: "Payable settled",
  other: "Other",
};

export type Confidence = "high" | "medium" | "low" | "unmatched";

export const EXCEPTION_KINDS = [
  "unmatched_cash",
  "duplicate_candidate",
  "suspected_duplicate",
  "amount_mismatch",
  "account_mismatch",
  "unknown_counterparty",
  "missing_investor",
  "missing_fund",
  "missing_accounting_mapping",
  "closed_period_transaction",
  "inconsistent_currency",
  "reconciliation_conflict",
  "posting_failure",
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

// ---------------------------------------------------------------- inputs

export type BankTxn = {
  id: string;
  offeringId: string | null;
  postedOn: string;
  amountCents: number;
  name?: string | null;
  description?: string | null;
  currency?: string | null;
};

export type CandidateApplication = {
  id: string;
  userId: string;
  investmentProfileId?: string | null;
  commitmentCents: number;
  fundingStatus?: string | null;
  paymentId?: string | null;
  paymentAmountCents?: number | null;
  paymentStatus?: string | null;
  referenceCode?: string | null;
  investorName?: string | null;
};

export type CandidateInvoice = {
  id: string;
  clientId: string | null;
  totalCents: number;
  reference?: string | null;
  declaredPaidOn?: string | null;
  number?: string | null;
};

export type CandidateWireRequest = {
  id: string;
  amountCents: number;
  purpose?: string | null;
  note?: string | null;
  expectedDate?: string | null;
};

export type ClassificationInput = {
  txn: BankTxn;
  applications: CandidateApplication[];
  invoices: CandidateInvoice[];
  wireRequests: CandidateWireRequest[];
  /** Other transactions already recorded for this fund, used to spot duplicates. */
  siblings?: { id: string; postedOn: string; amountCents: number; name?: string | null }[];
  bookCurrency?: string;
};

export type Proposal = {
  transactionType: CashTransactionType;
  confidence: Confidence;
  reasons: string[];
  conflicts: string[];
  matched: {
    applicationId?: string | null;
    paymentId?: string | null;
    invoiceId?: string | null;
    wireRequestId?: string | null;
    investorUserId?: string | null;
    investmentProfileId?: string | null;
  };
  exceptions: ExceptionKind[];
};

// ---------------------------------------------------------------- helpers

export function normalise(text: string) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function daysApart(a: string, b: string) {
  const one = Date.parse(`${a}T00:00:00Z`);
  const two = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(one) || Number.isNaN(two)) return 999;
  return Math.abs(one - two) / 86_400_000;
}

/** Stable identity for one cash movement, independent of the provider's id. */
export function dedupeKey(txn: Pick<BankTxn, "offeringId" | "postedOn" | "amountCents" | "name">) {
  return [txn.offeringId ?? "none", txn.postedOn, txn.amountCents, normalise(txn.name ?? "")].join("|");
}

const OUTFLOW_KEYWORDS: [RegExp, CashTransactionType][] = [
  [/(management\s*fee|mgmt\s*fee|advisory fee)/i, "management_fee"],
  [/(distribution|dividend to|lp distribution)/i, "distribution"],
  [/(organi[sz]ational|formation|legal formation)/i, "organizational_expense"],
  [/(investment in|portfolio|purchase of (shares|units|safe|note))/i, "portfolio_investment"],
  [/(withholding|1042|backup withhold)/i, "withholding"],
  [/(irs|franchise tax|state tax|tax payment)/i, "tax_payment"],
  [/(transfer to|internal transfer|book transfer)/i, "internal_transfer"],
  [/(invoice|vendor|payable|bill pay)/i, "payable_settlement"],
];

const INFLOW_KEYWORDS: [RegExp, CashTransactionType][] = [
  [/(capital call)/i, "capital_call"],
  [/(subscription|subscribe)/i, "subscription_receipt"],
  [/(interest|int pmt)/i, "interest_income"],
  [/(dividend)/i, "dividend_income"],
  [/(sale proceeds|exit|redemption|proceeds)/i, "investment_proceeds"],
  [/(transfer from|internal transfer|book transfer)/i, "internal_transfer"],
];

function keywordType(text: string, inflow: boolean): CashTransactionType | null {
  for (const [pattern, type] of inflow ? INFLOW_KEYWORDS : OUTFLOW_KEYWORDS) {
    if (pattern.test(text)) return type;
  }
  return null;
}

// ------------------------------------------------------------- the engine

export function classifyTransaction(input: ClassificationInput): Proposal {
  const { txn } = input;
  const amount = Math.abs(Number(txn.amountCents ?? 0));
  const inflow = Number(txn.amountCents ?? 0) >= 0;
  const raw = `${txn.name ?? ""} ${txn.description ?? ""}`;
  const text = normalise(raw);
  const reasons: string[] = [];
  const conflicts: string[] = [];
  const exceptions: ExceptionKind[] = [];
  const matched: Proposal["matched"] = {};

  if (!txn.offeringId) exceptions.push("missing_fund");
  if (input.bookCurrency && txn.currency && txn.currency !== input.bookCurrency) {
    exceptions.push("inconsistent_currency");
    conflicts.push(`Transaction is in ${txn.currency}, the book is in ${input.bookCurrency}.`);
  }

  // A cash movement that looks identical to one already recorded is never
  // silently accepted.
  const twin = (input.siblings ?? []).find(
    (s) =>
      s.id !== txn.id &&
      s.amountCents === txn.amountCents &&
      daysApart(s.postedOn, txn.postedOn) <= 1 &&
      normalise(s.name ?? "") === normalise(txn.name ?? ""),
  );
  if (twin) {
    exceptions.push("suspected_duplicate");
    conflicts.push("An identical amount from the same counterparty posted within a day.");
  }

  // 1. Money in: an investor whose wire is expected.
  if (inflow && amount > 0) {
    const open = input.applications.filter(
      (a) => (a.paymentStatus ?? "") !== "settled" && (a.fundingStatus ?? "") !== "settled",
    );
    const exact = open.filter(
      (a) => Number(a.paymentAmountCents ?? a.commitmentCents ?? 0) === amount,
    );
    const byReference = exact.find((a) => {
      const ref = normalise(a.referenceCode ?? "");
      return ref.length >= 4 && text.includes(ref);
    });
    const byName = exact.find((a) => {
      const name = normalise(a.investorName ?? "");
      return name.length >= 5 && text.includes(name);
    });

    if (byReference || byName || exact.length >= 1) {
      const ambiguous = !byReference && !byName && exact.length > 1;
      const hit = byReference ?? byName ?? exact[0]!;
      reasons.push(`Amount matches the ${(amount / 100).toLocaleString("en-US")} expected.`);
      if (byReference) reasons.push("The payment reference appears on the deposit.");
      if (!byReference && byName) reasons.push("The investor's name appears on the deposit.");
      if (!byReference && !byName && !ambiguous) {
        reasons.push("Only one investor owes exactly this amount.");
      }
      if (ambiguous) {
        // Several investors owe the same amount, so no investor is proposed: a
        // person picks. Guessing here would credit the wrong capital account.
        conflicts.push(`${exact.length} investors owe this same amount.`);
        exceptions.push("reconciliation_conflict");
      } else {
        matched.applicationId = hit.id;
        matched.paymentId = hit.paymentId ?? null;
        matched.investorUserId = hit.userId;
        matched.investmentProfileId = hit.investmentProfileId ?? null;
      }
      const confidence: Confidence = byReference ? "high" : byName ? "medium" : ambiguous ? "low" : "medium";
      const keyword = keywordType(raw, true);
      return {
        transactionType:
          keyword === "capital_call" || keyword === "subscription_receipt"
            ? keyword
            : "investor_contribution",
        confidence: exact.length > 1 && !byReference && !byName ? "low" : confidence,
        reasons,
        conflicts,
        matched,
        exceptions,
      };
    }

    // Close but not equal: worth a person's eyes, never an automatic match.
    const near = open.find((a) => {
      const expected = Number(a.paymentAmountCents ?? a.commitmentCents ?? 0);
      return expected > 0 && Math.abs(expected - amount) <= Math.max(5_000, expected * 0.01);
    });
    if (near) {
      exceptions.push("amount_mismatch");
      conflicts.push(
        `Close to the ${(Number(near.paymentAmountCents ?? near.commitmentCents) / 100).toLocaleString("en-US")} expected from an investor, but not equal.`,
      );
    }

    // 2. Money in: a client fee invoice they declared paid.
    const invoice = input.invoices.find((i) => {
      if (Number(i.totalCents) !== amount) return false;
      const ref = normalise(i.reference ?? "");
      if (ref.length >= 4 && text.includes(ref)) return true;
      return Boolean(i.declaredPaidOn) && daysApart(String(i.declaredPaidOn), txn.postedOn) <= 6;
    });
    if (invoice) {
      matched.invoiceId = invoice.id;
      reasons.push(`Matches invoice ${invoice.number ?? invoice.id} for the same amount.`);
      return {
        transactionType: "receivable_receipt",
        confidence: normalise(invoice.reference ?? "").length >= 4 ? "high" : "medium",
        reasons,
        conflicts,
        matched,
        exceptions,
      };
    }
  }

  // 3. Money out: a wire the fund had approved.
  if (!inflow && amount > 0) {
    const open = input.wireRequests.filter((r) => Number(r.amountCents) === amount);
    const byNote = open.find((r) => {
      const note = normalise(r.note ?? r.purpose ?? "");
      return note.length >= 5 && text.includes(note);
    });
    const byDate = open.find(
      (r) => r.expectedDate && daysApart(String(r.expectedDate).slice(0, 10), txn.postedOn) <= 6,
    );
    const hit = byNote ?? byDate ?? (open.length === 1 ? open[0] : null);
    if (hit) {
      matched.wireRequestId = hit.id;
      reasons.push("Matches an approved wire request for the same amount.");
      if (byNote) reasons.push("The wire purpose appears on the statement.");
      if (!byNote && byDate) reasons.push("Sent on the date the wire was expected.");
      const keyword = keywordType(raw, false);
      return {
        transactionType: keyword ?? "fund_expense",
        confidence: byNote ? "high" : byDate ? "medium" : "low",
        reasons,
        conflicts,
        matched,
        exceptions,
      };
    }
  }

  // 4. No platform record explains it. Classify by description only, and say so.
  const keyword = keywordType(raw, inflow);
  if (keyword) {
    reasons.push("Classified from the statement description alone; no platform record matches.");
    if (
      ["investor_contribution", "capital_call", "subscription_receipt", "distribution"].includes(
        keyword,
      )
    ) {
      exceptions.push("missing_investor");
    }
    return {
      transactionType: keyword,
      confidence: "low",
      reasons,
      conflicts,
      matched,
      exceptions,
    };
  }

  exceptions.push("unmatched_cash");
  if (text.length === 0) exceptions.push("unknown_counterparty");
  return {
    transactionType: "other",
    confidence: "unmatched",
    reasons: ["Nothing on the platform explains this cash movement."],
    conflicts,
    matched,
    exceptions,
  };
}

// ----------------------------------------------------------- posting rules

export type PostingRule = {
  id: string;
  book_id: string | null;
  offering_id: string | null;
  transaction_type: CashTransactionType;
  direction: "inflow" | "outflow" | "any";
  counterparty_pattern: string | null;
  min_amount_cents: number | null;
  max_amount_cents: number | null;
  debit_account_code: string;
  credit_account_code: string;
  approval_required: "none" | "fund_manager" | "client";
  approval_threshold_cents: number | null;
  materiality_threshold_cents: number;
  priority: number;
  version: number;
  is_active: boolean;
};

/**
 * The most specific active rule wins: a rule bound to this book beats one bound
 * to the fund, which beats the platform default. Priority breaks ties.
 */
export function selectPostingRule(
  rules: PostingRule[],
  context: {
    transactionType: CashTransactionType;
    inflow: boolean;
    amountCents: number;
    bookId?: string | null;
    offeringId?: string | null;
    counterparty?: string | null;
  },
): PostingRule | null {
  const amount = Math.abs(context.amountCents);
  const text = normalise(context.counterparty ?? "");
  const eligible = rules.filter((r) => {
    if (!r.is_active) return false;
    if (r.transaction_type !== context.transactionType) return false;
    if (r.direction !== "any" && r.direction !== (context.inflow ? "inflow" : "outflow")) {
      return false;
    }
    if (r.book_id && r.book_id !== context.bookId) return false;
    if (r.offering_id && r.offering_id !== context.offeringId) return false;
    if (r.min_amount_cents != null && amount < r.min_amount_cents) return false;
    if (r.max_amount_cents != null && amount > r.max_amount_cents) return false;
    if (r.counterparty_pattern && !text.includes(normalise(r.counterparty_pattern))) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  const specificity = (r: PostingRule) => (r.book_id ? 0 : r.offering_id ? 1 : 2);
  eligible.sort((a, b) => {
    const s = specificity(a) - specificity(b);
    if (s !== 0) return s;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.version - a.version;
  });
  return eligible[0]!;
}

/** Cash in debits the cash account; cash out credits it. */
export function journalShape(
  rule: PostingRule,
  amountCents: number,
): { debitCode: string; creditCode: string; amountCents: number } {
  return {
    debitCode: rule.debit_account_code,
    creditCode: rule.credit_account_code,
    amountCents: Math.abs(amountCents),
  };
}

// --------------------------------------------------------- approval routing

export type ApprovalDecision = {
  approver: "none" | "fund_manager" | "client";
  reason: string;
};

/**
 * Routine classifications post on Harmonious approval alone. External approval
 * is only asked for where the rule says so, where the amount crosses the rule's
 * threshold, or where a person overrode the engine.
 */
export function requiredApproval(input: {
  rule: PostingRule | null;
  amountCents: number;
  confidence: Confidence;
  manuallyCorrected?: boolean;
  isClientItem?: boolean;
}): ApprovalDecision {
  const amount = Math.abs(input.amountCents);
  if (input.manuallyCorrected) {
    return {
      approver: input.isClientItem ? "client" : "fund_manager",
      reason: "A person changed the automated classification.",
    };
  }
  if (!input.rule) {
    return { approver: "fund_manager", reason: "No accounting mapping covers this transaction." };
  }
  if (input.rule.approval_required === "none") {
    return { approver: "none", reason: "Routine classification approved by Harmonious." };
  }
  const threshold = input.rule.approval_threshold_cents;
  if (threshold != null && amount < threshold) {
    return {
      approver: "none",
      reason: "Below the amount this fund asks to review.",
    };
  }
  return {
    approver: input.rule.approval_required,
    reason:
      threshold != null
        ? "Above the amount this fund asks to review."
        : "This fund reviews every transaction of this kind.",
  };
}

// ------------------------------------------------------------ queue states

export const RECONCILIATION_FLOW = [
  "ingested",
  "auto_matched",
  "harmonious_reviewed",
  "acknowledged",
  "reconciled",
  "posted",
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_FLOW)[number] | "rejected" | "information_requested";

export function nextStatusAfterHarmonious(approval: ApprovalDecision["approver"]) {
  return approval === "none" ? "reconciled" : "harmonious_reviewed";
}

/** Confidence never approves anything by itself. */
export function autoApproves(_confidence: Confidence) {
  return false;
}

// -------------------------------------------------------- close readiness

export type ClosePolicy = {
  block_on_unreconciled_cash?: boolean;
  block_on_open_exceptions?: boolean;
  block_on_unposted_journals?: boolean;
  immaterial_cents?: number;
};

export type CloseCounts = {
  unreconciledCash: { count: number; largestCents: number };
  openExceptions: { count: number; materialCount: number };
  awaitingApproval: number;
  unpostedJournals: number;
};

export type CloseCheck = { key: string; label: string; count: number; blocking: boolean };

export function closeReadiness(counts: CloseCounts, policy: ClosePolicy = {}) {
  const immaterial = policy.immaterial_cents ?? 25_000;
  const checks: CloseCheck[] = [
    {
      key: "unreconciled_cash",
      label: "Bank transactions not yet reconciled",
      count: counts.unreconciledCash.count,
      blocking:
        (policy.block_on_unreconciled_cash ?? true) &&
        counts.unreconciledCash.count > 0 &&
        counts.unreconciledCash.largestCents >= immaterial,
    },
    {
      key: "open_exceptions",
      label: "Open accounting exceptions",
      count: counts.openExceptions.count,
      blocking:
        (policy.block_on_open_exceptions ?? true) && counts.openExceptions.materialCount > 0,
    },
    {
      key: "awaiting_approval",
      label: "Items awaiting manager or client approval",
      count: counts.awaitingApproval,
      blocking: counts.awaitingApproval > 0,
    },
    {
      key: "unposted_journals",
      label: "Journals not yet posted",
      count: counts.unpostedJournals,
      blocking: (policy.block_on_unposted_journals ?? true) && counts.unpostedJournals > 0,
    },
  ];
  return { checks, canLock: checks.every((c) => !c.blocking) };
}
