/**
 * DEMO / SYNTHETIC first operating period (Q1 2026) for the Harmonious Walkthrough
 * reference fund. Pure: no I/O, no live bank, never moves money.
 *
 * Chain: opening books -> capital call -> funding -> bank -> contribution journals ->
 * investments -> expenses -> management fee -> valuations -> trial balance ->
 * bank reconciliation -> NAV -> allocation -> capital accounts -> statements ->
 * close -> lock. Every figure is derived from the structured records below;
 * there is no target NAV and no balancing plug.
 */
import { splitProRata } from "@/lib/capital-calls-model";
import { computeFeeRun, reconcileFees, investorFacingFee, type StructuredFeeTerm } from "@/lib/economic-terms";
import { allocationSegregationError, distributeAmount, type Weight } from "@/lib/allocation-model";
import { segregationError as navSegregationError } from "@/lib/nav-model";
import {
  DEFAULT_VALUATION_POLICY,
  evidenceGateError,
  unrealizedJournal,
  valuationEvidenceStatus,
  type ValuationPolicy,
} from "@/lib/valuation-model";
import { trialBalance, type TbAccount, type TbLine } from "@/lib/ledger-trial-balance";
import { WALKTHROUGH_INVESTORS, capitalFor, FUND_COMMITMENTS } from "./walkthrough-source";

const $ = (d: number) => Math.round(d * 100);
export const PERIOD = { start: "2026-01-01", end: "2026-03-31" } as const;
export const DEMO_BANK = {
  label: "DEMO / SYNTHETIC OPERATING ACCOUNT",
  provider: "none",
  liveConnection: false,
  canInitiateAch: false,
  canInitiateWire: false,
  canMoveMoney: false,
  last4: "0000",
} as const;

/** Synthetic people. Distinct preparer / reviewer / approver / closer. */
export const PEOPLE = { preparer: "demo-preparer", reviewer: "demo-reviewer", approver: "demo-approver", closer: "demo-controller" } as const;

// ------------------------------------------------------------------ chart
export const CHART: (TbAccount & { subtype?: string })[] = [
  { id: "H-1000", code: "H-1000", name: "Cash - DEMO operating account", account_type: "asset", normal_balance: "debit", subtype: "cash" },
  { id: "H-1200", code: "H-1200", name: "Investments at cost", account_type: "asset", normal_balance: "debit" },
  { id: "H-1210", code: "H-1210", name: "Unrealized appreciation (depreciation)", account_type: "asset", normal_balance: "debit" },
  { id: "H-2000", code: "H-2000", name: "Accrued liabilities", account_type: "liability", normal_balance: "credit" },
  { id: "H-2100", code: "H-2100", name: "Investor overpayments held", account_type: "liability", normal_balance: "credit" },
  { id: "H-2200", code: "H-2200", name: "Management fee payable", account_type: "liability", normal_balance: "credit" },
  { id: "H-3000", code: "H-3000", name: "Partners' capital", account_type: "equity", normal_balance: "credit" },
  { id: "H-3100", code: "H-3100", name: "Capital contributions - current period", account_type: "equity", normal_balance: "credit" },
  { id: "H-4000", code: "H-4000", name: "Interest income", account_type: "income", normal_balance: "credit" },
  { id: "H-4100", code: "H-4100", name: "Unrealized gain (loss)", account_type: "income", normal_balance: "credit" },
  { id: "H-5000", code: "H-5000", name: "Management fee expense", account_type: "expense", normal_balance: "debit" },
  { id: "H-5100", code: "H-5100", name: "Legal fees", account_type: "expense", normal_balance: "debit" },
  { id: "H-5200", code: "H-5200", name: "Fund administration fees", account_type: "expense", normal_balance: "debit" },
  { id: "H-5300", code: "H-5300", name: "Bank fees", account_type: "expense", normal_balance: "debit" },
  { id: "H-5400", code: "H-5400", name: "Audit & tax fees", account_type: "expense", normal_balance: "debit" },
  { id: "H-5500", code: "H-5500", name: "Other professional fees", account_type: "expense", normal_balance: "debit" },
];

// ---------------------------------------------------------------- journals
export type JLine = { account: string; debit?: number; credit?: number; positionId?: string };
export type Journal = { id: string; date: string; memo: string; source: string; sourceRef: string; preparedBy: string; postedBy: string; lines: JLine[] };

export function journalError(j: Journal, ctx: { lockedThrough?: string | null; plugAccounts?: string[] } = {}): string | null {
  const d = j.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const c = j.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (d !== c || d <= 0) return "Journal does not balance.";
  if (!j.sourceRef) return "Journal has no structured source.";
  if (j.lines.some((l) => !CHART.some((a) => a.code === l.account))) return "Journal uses an unknown account.";
  if (j.lines.some((l) => (ctx.plugAccounts ?? ["H-9999"]).includes(l.account))) return "Balancing plugs are not allowed.";
  if (j.preparedBy === j.postedBy) return "Journals must be posted by someone other than the preparer.";
  if (ctx.lockedThrough && j.date <= ctx.lockedThrough) return "Period is locked; post a correction in an open period.";
  return null;
}

// ----------------------------------------------------------------- investors
export const KEY: Record<string, string> = Object.fromEntries(
  WALKTHROUGH_INVESTORS.map((i) => [i.key, i.key.split(/[ ,&(]/)[0]!.toLowerCase()]),
);
export const POSITIONS = WALKTHROUGH_INVESTORS.map((i) => ({
  positionId: KEY[i.key]!,
  name: i.key,
  classId: i.cls,
  commitmentCents: $(i.commitment),
  openingCapitalCents: capitalFor(i.commitment),
  previouslyCalledCents: $(i.commitment * 0.4), // $10M of $25M called before cutover
}));

// --------------------------------------------------------------- capital call
export const CALL_TOTAL = $(5_000_000);
export function capitalCall(totalCents = CALL_TOTAL) {
  const amounts = splitProRata(totalCents, POSITIONS.map((p) => p.commitmentCents));
  const lines = POSITIONS.map((p, i) => {
    const remainingBefore = p.commitmentCents - p.previouslyCalledCents;
    return { positionId: p.positionId, commitmentCents: p.commitmentCents, previouslyCalledCents: p.previouslyCalledCents, calledCents: amounts[i]!, remainingAfterCents: remainingBefore - amounts[i]! };
  });
  const overCalled = lines.filter((l) => l.remainingAfterCents < 0).map((l) => l.positionId);
  return { totalCents, lines, overCalled, error: overCalled.length ? "An investor would be called above remaining commitment." : null, sumCents: lines.reduce((s, l) => s + l.calledCents, 0) };
}

// ------------------------------------------------------------------- banking
export type BankLine = { id: string; postedOn: string | null; bookedOn: string; amountCents: number; description: string; kind: "deposit" | "payment" | "bank_fee" | "interest" | "opening_check"; positionId?: string; reference?: string | null };

const DUE = "2026-02-15";
/** Synthetic investor deposits. One arrives with no reference (initially unmatched). */
export const DEPOSITS: BankLine[] = [
  { id: "dep-northwind", bookedOn: "2026-02-10", postedOn: "2026-02-10", amountCents: $(1_000_000), description: "WIRE IN NORTHWIND FO CC1", kind: "deposit", positionId: "northwind", reference: "CC1-NORTHWIND" },
  { id: "dep-cedar-1", bookedOn: "2026-02-11", postedOn: "2026-02-11", amountCents: $(500_000), description: "WIRE IN CEDAR RIDGE 1/2", kind: "deposit", positionId: "cedar", reference: "CC1-CEDAR" },
  { id: "dep-cedar-2", bookedOn: "2026-02-14", postedOn: "2026-02-14", amountCents: $(300_000), description: "WIRE IN CEDAR RIDGE 2/2", kind: "deposit", positionId: "cedar", reference: "CC1-CEDAR" },
  { id: "dep-atlas", bookedOn: "2026-02-13", postedOn: "2026-02-13", amountCents: $(400_000), description: "WIRE IN ATLAS PEAK PARTIAL", kind: "deposit", positionId: "atlas", reference: "CC1-ATLAS" },
  { id: "dep-kestrel", bookedOn: "2026-02-20", postedOn: "2026-02-20", amountCents: $(570_000), description: "WIRE IN KESTREL GMBH (LATE)", kind: "deposit", positionId: "kestrel", reference: "CC1-KESTREL" },
  { id: "dep-harbor", bookedOn: "2026-02-12", postedOn: "2026-02-12", amountCents: $(400_000), description: "WIRE IN HARBOR PINE TRUST", kind: "deposit", positionId: "harbor", reference: "CC1-HARBOR" },
  { id: "dep-silverline", bookedOn: "2026-02-12", postedOn: "2026-02-12", amountCents: $(400_000), description: "WIRE IN SILVERLINE", kind: "deposit", positionId: "silverline", reference: "CC1-SILVERLINE" },
  { id: "dep-ada", bookedOn: "2026-02-13", postedOn: "2026-02-13", amountCents: $(300_050), description: "WIRE IN OKAFOR JTWROS", kind: "deposit", positionId: "ada", reference: "CC1-OKAFOR" },
  { id: "dep-lena", bookedOn: "2026-02-14", postedOn: "2026-02-14", amountCents: $(200_000), description: "WIRE IN IRA CUSTODIAN FBO RIVERA", kind: "deposit", positionId: "lena", reference: "CC1-RIVERA" },
  { id: "dep-avery", bookedOn: "2026-02-12", postedOn: "2026-02-12", amountCents: $(20_000), description: "WIRE IN AVERY T", kind: "deposit", positionId: "avery", reference: "CC1-AVERY" },
  { id: "dep-casey", bookedOn: "2026-02-14", postedOn: "2026-02-14", amountCents: $(10_000), description: "INCOMING WIRE", kind: "deposit", positionId: undefined, reference: null },
  // Deposit in transit: booked by the fund 3/31, clears the bank 4/1.
  { id: "dep-blake", bookedOn: "2026-03-31", postedOn: "2026-04-01", amountCents: $(50_000), description: "WIRE IN BLAKE TESTHOLDINGS", kind: "deposit", positionId: "blake", reference: "CC1-BLAKE" },
];

export type MatchDecision = { bankLineId: string; positionId: string | null; how: "exact" | "multi" | "partial" | "late" | "overpayment" | "manual" | "unmatched"; matchedBy: string | null };

/** Match deposits to call lines. Never guesses: no reference -> unmatched until a person decides. */
export function matchDeposits(deposits: BankLine[], call: ReturnType<typeof capitalCall>, manual: Record<string, string> = {}) {
  const due = new Map(call.lines.map((l) => [l.positionId, l.calledCents]));
  const received = new Map<string, number>();
  const decisions: MatchDecision[] = [];
  for (const d of deposits) {
    const pid = d.reference ? d.positionId ?? null : manual[d.id] ?? null;
    if (!pid) { decisions.push({ bankLineId: d.id, positionId: null, how: "unmatched", matchedBy: null }); continue; }
    received.set(pid, (received.get(pid) ?? 0) + d.amountCents);
    decisions.push({ bankLineId: d.id, positionId: pid, how: d.reference ? "exact" : "manual", matchedBy: d.reference ? "rule:reference" : PEOPLE.preparer });
  }
  const funding = call.lines.map((l) => {
    const got = received.get(l.positionId) ?? 0;
    const contribution = Math.min(got, l.calledCents);
    const overpayment = Math.max(0, got - l.calledCents);
    const depositsFor = deposits.filter((d) => decisions.find((x) => x.bankLineId === d.id)?.positionId === l.positionId);
    const late = depositsFor.some((d) => d.bookedOn > DUE);
    const status = got === 0 ? "outstanding" : got < l.calledCents ? "partially_funded" : "satisfied";
    return { positionId: l.positionId, calledCents: l.calledCents, receivedCents: got, contributionCents: contribution, overpaymentCents: overpayment, outstandingCents: l.calledCents - contribution, status, late, deposits: depositsFor.length };
  });
  return { decisions, funding, unmatched: decisions.filter((d) => d.how === "unmatched") };
}

/** Funding behaviour that is NOT a deposit: legitimately blocked or awaited. */
export const FUNDING_NOTES: Record<string, string> = {
  juniper: "Funding pending - wire expected after period end.",
  erik: "Blocked - AML review open; funding not accepted until cleared.",
  atlas: "Partially funded - $200,000 outstanding.",
  kestrel: "Late - received 2026-02-20 against 2026-02-15 due date.",
  ada: "Overpaid $50 - held as a liability; any refund is a manual decision, never automatic.",
  casey: "Deposit arrived without reference; matched manually by staff.",
};

// --------------------------------------------------------------- investments
export const NEW_INVESTMENTS = [
  { id: "inv-northstar", name: "Northstar Analytics, Inc. (Series A Preferred)", assetClass: "private_preferred", date: "2026-02-20", costCents: $(2_000_000), evidence: "DEMO SPA + wire confirmation" },
  { id: "inv-brightline", name: "Brightline Health, Inc. (SAFE)", assetClass: "safe", date: "2026-03-02", costCents: $(1_000_000), evidence: "DEMO SAFE agreement" },
  { id: "inv-gridwise-fo", name: "Gridwise Energy, Inc. (Seed follow-on)", assetClass: "private_preferred", date: "2026-03-10", costCents: $(250_000), followOnOf: "Gridwise Energy, Inc. (Seed)", evidence: "DEMO follow-on subscription" },
] as const;
export const GRIDWISE_PRIOR_COST = $(2_500_000);

// ------------------------------------------------------------------ expenses
export const EXPENSE_ACCOUNTS: Record<string, string> = {
  legal: "H-5100",
  administration: "H-5200",
  bank_fee: "H-5300",
  audit_tax: "H-5400",
  other_professional: "H-5500",
};
export type ExpenseInput = { id: string; category: string | null; description: string; amountCents: number; date: string; paid: boolean };
/** Unknown or missing category -> REVIEW REQUIRED, never a silent "Other". */
export function classifyExpense(e: ExpenseInput): { account: string } | { review: "REVIEW REQUIRED"; reason: string } {
  const account = e.category ? EXPENSE_ACCOUNTS[e.category] : undefined;
  if (!account) return { review: "REVIEW REQUIRED", reason: `No approved account for "${e.category ?? "(none)"}".` };
  return { account };
}
export const EXPENSES: ExpenseInput[] = [
  { id: "exp-legal", category: "legal", description: "DEMO fund counsel - Q1", amountCents: $(45_000), date: "2026-02-28", paid: true },
  { id: "exp-admin", category: "administration", description: "DEMO fund administration - Q1", amountCents: $(15_000), date: "2026-03-15", paid: true },
  { id: "exp-bank", category: "bank_fee", description: "DEMO wire fees", amountCents: $(250), date: "2026-03-31", paid: true },
  { id: "exp-audit", category: "audit_tax", description: "DEMO audit fieldwork accrual", amountCents: $(30_000), date: "2026-03-31", paid: false },
  { id: "exp-valuation", category: "other_professional", description: "DEMO independent valuation consultant", amountCents: $(12_500), date: "2026-03-30", paid: true },
];
export const AMBIGUOUS_EXPENSE: ExpenseInput = { id: "exp-misc", category: "consulting_misc", description: "DEMO consulting - unclear", amountCents: $(4_000), date: "2026-03-20", paid: false };

// --------------------------------------------------------------- fee terms
const term = (o: Partial<StructuredFeeTerm> & { id: string; rateBps: number }): StructuredFeeTerm => ({
  basis: "committed_capital", flatAmountCents: 0, frequency: "quarterly", startsOn: "2026-01-01", endsOn: null, classId: null, positionId: null, version: 1, approvalStatus: "approved", ...o,
});
export const FEE_TERMS: StructuredFeeTerm[] = [
  term({ id: "fund-std", rateBps: 200, sourceDocument: "DEMO LPA s.8.1" }),
  term({ id: "class-a", classId: "A", rateBps: 200, sourceDocument: "DEMO LPA Sched. A" }),
  term({ id: "class-b", classId: "B", rateBps: 150, sourceDocument: "DEMO LPA Sched. B" }),
  term({ id: "sl-northwind", positionId: "northwind", classId: "A", rateBps: 125, sourceDocument: "DEMO Northwind side letter v1", sideLetterId: "sl-1" }),
  // Approved prospective change: must not affect Q1.
  term({ id: "class-b-v2", classId: "B", rateBps: 125, startsOn: "2026-04-01", version: 2, sourceDocument: "DEMO LPA amendment 1" }),
];

// ---------------------------------------------------------------- valuations
export const VAL_POLICY: ValuationPolicy = { ...DEFAULT_VALUATION_POLICY, investmentAccountCode: "H-1210", unrealizedAccountCode: "H-4100" };
export type ValuationInput = { id: string; asset: string; priorCents: number; newCents: number; date: string; method: string; evidenceCount: number; preparedBy: string; reviewedBy: string | null };
export const VALUATIONS: ValuationInput[] = [
  { id: "val-lumen", asset: "Lumen Bio, Inc. (Series A)", priorCents: $(3_500_000), newCents: $(4_000_000), date: "2026-03-31", method: "recent_financing", evidenceCount: 1, preparedBy: PEOPLE.preparer, reviewedBy: PEOPLE.reviewer },
  { id: "val-parcel", asset: "Parcel Robotics, Inc. (SAFE)", priorCents: $(2_000_000), newCents: $(1_600_000), date: "2026-03-31", method: "market_comparable", evidenceCount: 1, preparedBy: PEOPLE.preparer, reviewedBy: PEOPLE.reviewer },
];
export function valuationError(v: ValuationInput, lockedThrough: string | null = null): string | null {
  const ev = evidenceGateError(valuationEvidenceStatus({ policyRequired: VAL_POLICY.evidenceRequired, evidenceCount: v.evidenceCount, waived: false }));
  if (ev) return ev;
  if (!v.reviewedBy) return "Valuation needs an independent reviewer.";
  if (v.reviewedBy === v.preparedBy) return "The preparer cannot review their own valuation.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || v.date < PERIOD.start || v.date > PERIOD.end) return "Valuation date is outside the period.";
  if (lockedThrough && v.date <= lockedThrough) return "Period is locked.";
  return null;
}

// ------------------------------------------------------------------- run
export function runPeriod() {
  const P = PEOPLE.preparer, R = PEOPLE.reviewer;
  const j = (id: string, date: string, memo: string, source: string, sourceRef: string, lines: JLine[]): Journal => ({ id, date, memo, source, sourceRef, preparedBy: P, postedBy: R, lines });

  // Opening (approved Phase 1 position, rolled into capital at cutover).
  const opening: Journal[] = [j("open", "2025-12-31", "Approved opening balances (Phase 1 take-over)", "migration", "walkthrough-opening-2025-12-31", [
    { account: "H-1000", debit: $(1_750_000) }, { account: "H-1200", debit: $(7_500_000) }, { account: "H-1210", debit: $(750_000) },
    { account: "H-2000", credit: $(50_000) }, { account: "H-3000", credit: $(9_950_000) },
  ])];

  const call = capitalCall();
  const match = matchDeposits(DEPOSITS, call, { "dep-casey": "casey" });
  const journals: Journal[] = [];

  journals.push(j("pay-accrued", "2026-01-15", "Settle opening accrued liabilities", "payment", "opening-accrual", [{ account: "H-2000", debit: $(50_000) }, { account: "H-1000", credit: $(50_000) }]));
  for (const d of DEPOSITS) {
    const dec = match.decisions.find((x) => x.bankLineId === d.id)!;
    if (!dec.positionId) continue;
    const f = match.funding.find((x) => x.positionId === dec.positionId)!;
    const priorForPos = journals.filter((x) => x.source === "capital_call" && x.lines.some((l) => l.positionId === dec.positionId)).reduce((s, x) => s + (x.lines.find((l) => l.account === "H-3100")?.credit ?? 0), 0);
    const toCapital = Math.min(d.amountCents, f.calledCents - priorForPos);
    const over = d.amountCents - toCapital;
    const lines: JLine[] = [{ account: "H-1000", debit: d.amountCents }];
    if (toCapital > 0) lines.push({ account: "H-3100", credit: toCapital, positionId: dec.positionId });
    if (over > 0) lines.push({ account: "H-2100", credit: over, positionId: dec.positionId });
    journals.push(j(`jc-${d.id}`, d.bookedOn, `Capital call #1 contribution - ${dec.positionId}`, "capital_call", `cc1/${dec.positionId}/${d.id}`, lines));
  }
  const investmentPayments: BankLine[] = NEW_INVESTMENTS.map((i) => ({ id: `pay-${i.id}`, bookedOn: i.date, postedOn: i.date, amountCents: -i.costCents, description: `WIRE OUT ${i.name}`, kind: "payment" }));
  for (const i of NEW_INVESTMENTS) journals.push(j(`ji-${i.id}`, i.date, `Purchase ${i.name}`, "investment", i.id, [{ account: "H-1200", debit: i.costCents }, { account: "H-1000", credit: i.costCents }]));

  const expenseReview = [AMBIGUOUS_EXPENSE].map((e) => ({ id: e.id, result: classifyExpense(e) }));
  const expensePayments: BankLine[] = [];
  for (const e of EXPENSES) {
    const c = classifyExpense(e);
    if (!("account" in c)) continue;
    journals.push(j(`je-${e.id}`, e.date, e.description, "expense", e.id, [{ account: c.account, debit: e.amountCents }, { account: e.paid ? "H-1000" : "H-2000", credit: e.amountCents }]));
    if (e.paid) expensePayments.push({
      id: `pay-${e.id}`, bookedOn: e.date,
      // The valuation consultant check is issued 3/30 but clears 4/2 (outstanding payment).
      postedOn: e.id === "exp-valuation" ? "2026-04-02" : e.date,
      amountCents: -e.amountCents, description: e.description, kind: e.category === "bank_fee" ? "bank_fee" : "payment",
    });
  }
  const interest: BankLine = { id: "int-mmf", bookedOn: "2026-03-31", postedOn: "2026-03-31", amountCents: $(2_100), description: "MMF SWEEP INTEREST", kind: "interest" };
  journals.push(j("j-interest", "2026-03-31", "Money market interest", "bank", interest.id, [{ account: "H-1000", debit: interest.amountCents }, { account: "H-4000", credit: interest.amountCents }]));

  // Management fee (Phase 2A engine) -> one accrual journal connected to the run.
  const feePositions = POSITIONS.map((p) => ({ positionId: p.positionId, classId: p.classId, commitmentCents: p.commitmentCents, contributedToDateCents: p.previouslyCalledCents, beginningCapitalCents: p.openingCapitalCents }));
  const feeRun = computeFeeRun(FEE_TERMS, feePositions, PERIOD);
  const feeRunId = "fee-run-2026Q1";
  if (!feeRun.blocked) journals.push(j("j-mgmt-fee", "2026-03-31", "Q1 management fee accrual (approved fee run)", "fee_accrual", feeRunId, [
    ...feeRun.lines.map((l) => ({ account: "H-5000", debit: l.netFeeCents, positionId: l.positionId })),
    { account: "H-2200", credit: feeRun.totalNetCents },
  ]));

  // Valuations: only the delta is booked.
  const valuationResults = VALUATIONS.map((v) => {
    const err = valuationError(v);
    const jr = err ? null : unrealizedJournal(v.priorCents, v.newCents, VAL_POLICY, `Revalue ${v.asset}`);
    if (jr) journals.push(j(`jv-${v.id}`, v.date, jr.memo, "valuation", v.id, jr.lines.map((l) => ({ account: l.accountCode, debit: l.debitCents, credit: l.creditCents }))));
    return { ...v, error: err, deltaCents: v.newCents - v.priorCents };
  });

  const journalErrors = [...opening, ...journals].map((x) => ({ id: x.id, error: journalError(x) })).filter((x) => x.error);

  // Trial balance.
  const all = [...opening, ...journals];
  const tbLines: TbLine[] = all.flatMap((x) => x.lines.map((l) => ({ account_id: l.account, debit_cents: l.debit ?? 0, credit_cents: l.credit ?? 0 })));
  const tb = trialBalance(CHART, tbLines);
  const bal = (code: string) => tb.rows.find((r) => r.code === code)?.balanceCents ?? 0;

  // Bank statement built independently from bank lines (what the bank shows).
  const openingBankCents = $(1_760_000);
  const bankLines: BankLine[] = [
    { id: "chk-opening", bookedOn: "2025-12-29", postedOn: "2026-01-05", amountCents: $(-10_000), description: "CHECK 1041 (pre-cutover)", kind: "opening_check" },
    { id: "pay-accrued", bookedOn: "2026-01-15", postedOn: "2026-01-15", amountCents: $(-40_000), description: "ACCRUED PAYABLES", kind: "payment" },
    ...DEPOSITS, ...investmentPayments, ...expensePayments, interest,
  ];
  // The opening $50,000 accrual: $10,000 was already paid by check 1041 before cutover? No -
  // check 1041 is the Phase 1 outstanding item; the remaining $40,000 is wired in January and
  // the GL entry settles the full $50,000 accrual it covers together with check 1041's $10,000
  // that was in GL cash but not yet in the bank at cutover.
  const cleared = bankLines.filter((b) => b.postedOn && b.postedOn <= PERIOD.end);
  const bankStatementCents = openingBankCents + cleared.reduce((s, b) => s + b.amountCents, 0);
  const notCleared = bankLines.filter((b) => b.bookedOn <= PERIOD.end && (!b.postedOn || b.postedOn > PERIOD.end));
  const depositsInTransit = notCleared.filter((b) => b.amountCents > 0).reduce((s, b) => s + b.amountCents, 0);
  const outstandingPayments = notCleared.filter((b) => b.amountCents < 0).reduce((s, b) => s + b.amountCents, 0);
  const adjustedBank = bankStatementCents + depositsInTransit + outstandingPayments;
  const glCash = bal("H-1000");
  const bankRec = { glCashCents: glCash, bankStatementCents, depositsInTransitCents: depositsInTransit, outstandingPaymentsCents: outstandingPayments, adjustedBankCents: adjustedBank, differenceCents: adjustedBank - glCash };

  // NAV from the trial balance.
  const assets = bal("H-1000") + bal("H-1200") + bal("H-1210");
  const liabilities = bal("H-2000") + bal("H-2100") + bal("H-2200");
  const nav = {
    cashCents: bal("H-1000"), investmentsAtCostCents: bal("H-1200"), unrealizedCents: bal("H-1210"),
    receivablesCents: 0, accruedCents: bal("H-2000"), overpaymentsHeldCents: bal("H-2100"), mgmtFeePayableCents: bal("H-2200"),
    totalAssetsCents: assets, totalLiabilitiesCents: liabilities, navCents: assets - liabilities,
  };
  const equityCents = bal("H-3000") + bal("H-3100") + bal("H-4000") + bal("H-4100") - ["H-5000", "H-5100", "H-5200", "H-5300", "H-5400", "H-5500"].reduce((s, c) => s + bal(c), 0);
  const navLineage = [
    { component: "Cash", source: "bank lines + journals", ok: true },
    { component: "Investments at cost", source: "opening + investment records", ok: true },
    { component: "Unrealized", source: "opening + reviewed valuations", ok: true },
    { component: "Accrued liabilities", source: "expense records", ok: true },
    { component: "Overpayments held", source: "bank match", ok: true },
    { component: "Management fee payable", source: feeRunId, ok: true },
  ];

  // Allocation: own contributions and own fee are specific; all other P&L pro rata on
  // opening capital + period contributions (not time-weighted - see gaps).
  const contrib = new Map<string, number>();
  for (const x of journals) for (const l of x.lines) if (l.account === "H-3100" && l.positionId) contrib.set(l.positionId, (contrib.get(l.positionId) ?? 0) + (l.credit ?? 0));
  const otherPnl = bal("H-4000") + bal("H-4100") - ["H-5100", "H-5200", "H-5300", "H-5400", "H-5500"].reduce((s, c) => s + bal(c), 0);
  const weights: Weight[] = POSITIONS.map((p) => ({ positionId: p.positionId, basisAmountCents: p.openingCapitalCents + (contrib.get(p.positionId) ?? 0), weight: 0, daysInPeriod: 90 }));
  const tw = weights.reduce((s, w) => s + w.basisAmountCents, 0);
  weights.forEach((w) => (w.weight = w.basisAmountCents / tw));
  const share = distributeAmount(otherPnl, weights);
  const capitalAccounts = POSITIONS.map((p) => {
    const fee = feeRun.lines.find((l) => l.positionId === p.positionId)!;
    const c = contrib.get(p.positionId) ?? 0;
    const pnl = share.get(p.positionId) ?? 0;
    return { positionId: p.positionId, name: p.name, classId: p.classId, openingCents: p.openingCapitalCents, contributionsCents: c, managementFeeCents: -fee.netFeeCents, otherPnlCents: pnl, endingCents: p.openingCapitalCents + c - fee.netFeeCents + pnl, feeLineage: fee };
  });
  const capitalTotal = capitalAccounts.reduce((s, a) => s + a.endingCents, 0);
  const allocationRec = { capitalTotalCents: capitalTotal, navCents: nav.navCents, equityCents, differenceCents: capitalTotal - nav.navCents };

  // Fee reconciliation: fund-level standard less class and side-letter reductions.
  const fundStandard = Math.round((FUND_COMMITMENTS * 200) / 10_000 / 4);
  const classBCommit = POSITIONS.filter((p) => p.classId === "B").reduce((s, p) => s + p.commitmentCents, 0);
  const classBReduction = Math.round((classBCommit * 50) / 10_000 / 4);
  const sideLetterReduction = Math.round((POSITIONS.find((p) => p.positionId === "northwind")!.commitmentCents * 75) / 10_000 / 4);
  const feeRec = {
    ...reconcileFees(feeRun, bal("H-5000")),
    fundStandardCents: fundStandard, classBReductionCents: classBReduction, sideLetterReductionCents: sideLetterReduction,
    explainedCents: fundStandard - classBReduction - sideLetterReduction,
    unexplainedCents: fundStandard - classBReduction - sideLetterReduction - feeRun.totalNetCents,
    allocatedToInvestorsCents: -capitalAccounts.reduce((s, a) => s + a.managementFeeCents, 0),
  };

  // Statements: each investor sees only their own figures.
  const statements = capitalAccounts.map((a) => ({
    positionId: a.positionId, period: PERIOD, opening: a.openingCents, contributions: a.contributionsCents,
    fee: investorFacingFee(a.feeLineage), otherPnl: a.otherPnlCents, ending: a.endingCents,
  }));

  const paidIn = POSITIONS.reduce((s, p) => s + p.previouslyCalledCents, 0) + [...contrib.values()].reduce((s, v) => s + v, 0);
  const performance = { paidInCents: paidIn, navCents: nav.navCents, tvpi: Number((nav.navCents / paidIn).toFixed(4)), periodNetChangeCents: nav.navCents - $(9_950_000) - [...contrib.values()].reduce((s, v) => s + v, 0) };

  return { opening, journals, journalErrors, call, match, feeRun, feeRec, valuationResults, expenseReview, tb, bankRec, nav, navLineage, capitalAccounts, allocationRec, statements, performance };
}

// ----------------------------------------------------------------- close & lock
export type CloseState = { navPeople: { preparedBy: string; reviewedBy: string | null; approvedBy: string | null; publishedBy: string | null }; allocationPeople: { preparedBy: string; reviewedBy: string | null; approvedBy: string | null }; lockedThrough: string | null };

export function closeBlockers(r: ReturnType<typeof runPeriod>, s: CloseState, closer: string) {
  const b: string[] = [];
  if (!r.tb.ties) b.push("Trial balance does not tie.");
  if (r.bankRec.differenceCents !== 0) b.push("Bank reconciliation has a difference.");
  if (r.allocationRec.differenceCents !== 0) b.push("Capital accounts do not equal NAV.");
  if (r.feeRun.blocked) b.push("Fee run blocked by term conflict.");
  if (r.journalErrors.length) b.push("Invalid journals.");
  if (!s.navPeople.approvedBy) b.push("NAV not approved.");
  if (!s.allocationPeople.approvedBy) b.push("Allocation not approved.");
  if ([s.navPeople.preparedBy, s.allocationPeople.preparedBy].includes(closer)) b.push("The preparer cannot close the period.");
  return b;
}

export { navSegregationError, allocationSegregationError };
