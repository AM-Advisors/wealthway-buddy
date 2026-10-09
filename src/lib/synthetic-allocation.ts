/**
 * Synthetic investor allocation preview (pure). Used only for TEST/DEMO funds
 * against an internal_synthetic_only NAV. Never produces capital-account rows,
 * GL entries or statements; the DB layer (synthetic_allocation_*) enforces the
 * same isolation. Every component is split with exact integer largest-remainder
 * rounding so investor totals tie to the fund without a balancing adjustment.
 */

export const SYNTHETIC_ALLOCATION_LABEL =
  "DEMO / SYNTHETIC — UNAUDITED — NOT A CAPITAL ACCOUNT — NOT FOR INVESTOR DISTRIBUTION";

export type SyntheticPolicyRules = {
  version: number;
  status: "draft" | "approved" | "superseded";
  /** Fund-wide weighting for general income, operating expenses and gains. */
  generalBasis: "beginning_capital_plus_time_weighted_contributions";
  dayCount: "ACT/ACT_period_inclusive";
  contributionDate: "cash_receipt_date";
  managementFees: "trace_investor_fee_lines";
  unpaidCalls: "exclude_from_contributed_capital";
  carry: "none";
  rounding: "largest_remainder_cents_stable_id_tiebreak";
};

export const WALKTHROUGH_Q1_POLICY: SyntheticPolicyRules = {
  version: 1,
  status: "approved",
  generalBasis: "beginning_capital_plus_time_weighted_contributions",
  dayCount: "ACT/ACT_period_inclusive",
  contributionDate: "cash_receipt_date",
  managementFees: "trace_investor_fee_lines",
  unpaidCalls: "exclude_from_contributed_capital",
  carry: "none",
  rounding: "largest_remainder_cents_stable_id_tiebreak",
};

export type AdmissionStatus = "formally_admitted" | "source_only_not_formally_admitted";

export type SyntheticParticipant = {
  positionId: string;
  offeringId: string;
  name: string;
  classLabel: string;
  commitmentCents: number;
  openingCapitalCents: number | null;
  admissionStatus: AdmissionStatus;
  /** Source-only participants need an independently reviewed approval for synthetic use. */
  syntheticUseApproved: boolean;
  sourceRef: string;
  unpaidCallCents: number;
  creditsCents: number;
  restrictions: string[];
};

export type Contribution = { positionId: string; receivedOn: string; amountCents: number; sourceRef: string };
export type FeeLine = { positionId: string; netFeeCents: number; rateBps: number; termStatus: "approved" | "proposed" | "class"; sourceRef: string };

export type SyntheticNavRef = {
  id: string;
  offeringId: string;
  navCents: number;
  syntheticClassification: string | null;
  approvalScope: string | null;
  status: string;
};

export type SyntheticAllocationInput = {
  offeringId: string;
  fundIsTestDemo: boolean;
  period: { start: string; end: string };
  policy: SyntheticPolicyRules | null;
  nav: SyntheticNavRef;
  participants: SyntheticParticipant[];
  contributions: Contribution[];
  feeLines: FeeLine[];
  fund: { openingCapitalCents: number; interestCents: number; unrealizedGainCents: number; operatingExpenseCents: number; managementFeeCents: number };
  carryRequested?: boolean;
  target?: "preview" | "production_capital_accounts" | "publication";
};

export type Residual = { component: string; positionId: string; cents: 1; remainderNumerator: string };

export type SyntheticLine = {
  positionId: string;
  name: string;
  classLabel: string;
  openingCapitalCents: number;
  contributionsCents: number;
  contributionDates: string[];
  weightDollarDays: string;
  interestCents: number;
  unrealizedGainCents: number;
  operatingExpenseCents: number;
  managementFeeCents: number;
  netPnlCents: number;
  endingCapitalCents: number;
  unpaidCallCents: number;
  creditsCents: number;
  restrictions: string[];
  flags: string[];
};

export type SyntheticAllocationResult =
  | { ok: false; blockers: string[] }
  | {
      ok: true;
      label: string;
      lines: SyntheticLine[];
      residuals: Residual[];
      totals: Record<string, number>;
      differenceCents: number;
      journalEntriesCreated: 0;
    };

const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const daysInclusive = (a: string, b: string) => Math.max(0, Math.floor((t(b) - t(a)) / DAY) + 1);

/**
 * Exact largest-remainder split using BigInt. Equal remainders are resolved by
 * ascending position id so reruns are deterministic; every extra cent is logged.
 */
export function splitExact(component: string, total: number, weights: { id: string; w: bigint }[]) {
  const sum = weights.reduce((s, x) => s + x.w, 0n);
  const out = new Map<string, number>();
  const residuals: Residual[] = [];
  if (sum === 0n) throw new Error(`No allocation weight for ${component}.`);
  const sign = total < 0 ? -1n : 1n;
  const mag = BigInt(Math.abs(total));
  const parts = weights.map((x) => ({ id: x.id, base: (mag * x.w) / sum, rem: (mag * x.w) % sum }));
  let left = mag - parts.reduce((s, p) => s + p.base, 0n);
  const order = [...parts].sort((a, b) => (a.rem === b.rem ? (a.id < b.id ? -1 : 1) : a.rem > b.rem ? -1 : 1));
  for (const p of order) {
    if (left === 0n) break;
    p.base += 1n;
    left -= 1n;
    residuals.push({ component, positionId: p.id, cents: 1, remainderNumerator: p.rem.toString() });
  }
  for (const p of parts) out.set(p.id, Number(sign * p.base));
  return { out, residuals };
}

export function syntheticAllocationBlockers(i: SyntheticAllocationInput): string[] {
  const b: string[] = [];
  if (!i.fundIsTestDemo) b.push("Synthetic allocations are allowed only on isolated TEST/DEMO funds.");
  if (i.target === "production_capital_accounts") b.push("A synthetic NAV cannot flow into production investor capital accounts.");
  if (i.target === "publication") b.push("Synthetic allocations cannot be published or sent to investors.");
  if (!i.policy) b.push("No approved synthetic allocation policy.");
  else if (i.policy.status !== "approved") b.push("The synthetic allocation policy is not approved.");
  if (i.carryRequested || (i.policy && i.policy.carry !== "none")) b.push("Carried interest requires approved, sourced waterfall terms; none exist.");
  if (i.nav.offeringId !== i.offeringId) b.push("The NAV belongs to a different fund.");
  if (!i.nav.syntheticClassification || i.nav.approvalScope !== "internal_synthetic_only" || i.nav.status !== "approved")
    b.push("The allocation must reference an approved internal_synthetic_only NAV version.");
  const ids = new Set<string>();
  for (const p of i.participants) {
    if (p.offeringId !== i.offeringId) b.push(`${p.name}: participant belongs to a different fund.`);
    if (ids.has(p.positionId)) b.push(`${p.name}: duplicate participant.`);
    ids.add(p.positionId);
    if (p.openingCapitalCents === null) b.push(`${p.name}: missing opening investor capital.`);
    if (p.admissionStatus === "source_only_not_formally_admitted" && !p.syntheticUseApproved)
      b.push(`${p.name}: source-only participant not independently approved for synthetic use.`);
  }
  const opening = i.participants.reduce((s, p) => s + (p.openingCapitalCents ?? 0), 0);
  if (opening !== i.fund.openingCapitalCents) b.push(`Opening investor capital ${opening} does not equal fund opening capital ${i.fund.openingCapitalCents}.`);
  for (const c of i.contributions) {
    if (!ids.has(c.positionId)) b.push(`Contribution ${c.sourceRef} is for a non-participant or another fund.`);
    if (t(c.receivedOn) < t(i.period.start) || t(c.receivedOn) > t(i.period.end)) b.push(`Contribution ${c.sourceRef} received ${c.receivedOn} is outside the period.`);
  }
  const feeSeen = new Set<string>();
  for (const f of i.feeLines) {
    if (feeSeen.has(f.positionId)) b.push(`Duplicate management-fee line for ${f.positionId}.`);
    feeSeen.add(f.positionId);
    if (!ids.has(f.positionId)) b.push(`Fee line ${f.sourceRef} is for a non-participant.`);
    if (f.termStatus === "proposed") b.push(`Fee line ${f.sourceRef} uses a proposed (unapproved) term.`);
  }
  const fees = i.feeLines.reduce((s, f) => s + f.netFeeCents, 0);
  if (fees !== i.fund.managementFeeCents) b.push(`Traced fee lines ${fees} do not equal posted management fee ${i.fund.managementFeeCents}.`);
  return b;
}

export function computeSyntheticAllocation(i: SyntheticAllocationInput): SyntheticAllocationResult {
  const blockers = syntheticAllocationBlockers(i);
  if (blockers.length) return { ok: false, blockers };
  const days = daysInclusive(i.period.start, i.period.end);
  const contribs = (id: string) => i.contributions.filter((c) => c.positionId === id);
  const weights = i.participants.map((p) => ({
    id: p.positionId,
    w: BigInt(p.openingCapitalCents!) * BigInt(days) +
      contribs(p.positionId).reduce((s, c) => s + BigInt(c.amountCents) * BigInt(daysInclusive(c.receivedOn, i.period.end)), 0n),
  }));
  const interest = splitExact("interest_income", i.fund.interestCents, weights);
  const gain = splitExact("unrealized_gain_synthetic", i.fund.unrealizedGainCents, weights);
  const exp = splitExact("operating_expenses", -Math.abs(i.fund.operatingExpenseCents), weights);
  const fee = new Map(i.feeLines.map((f) => [f.positionId, -Math.abs(f.netFeeCents)]));
  const lines: SyntheticLine[] = i.participants.map((p, k) => {
    const cs = contribs(p.positionId);
    const c = cs.reduce((s, x) => s + x.amountCents, 0);
    const parts = [interest.out.get(p.positionId)!, gain.out.get(p.positionId)!, exp.out.get(p.positionId)!, fee.get(p.positionId) ?? 0];
    const net = parts.reduce((s, x) => s + x, 0);
    const flags = ["DEMO / SYNTHETIC", "UNREALIZED GAIN IS A SYNTHETIC ASSUMPTION", "HISTORICAL CLASS-FEE TREATMENT UNVERIFIED (39.8% register)"];
    if (p.admissionStatus === "source_only_not_formally_admitted") flags.push("SOURCE-ONLY / NOT FORMALLY ADMITTED");
    return {
      positionId: p.positionId, name: p.name, classLabel: p.classLabel,
      openingCapitalCents: p.openingCapitalCents!, contributionsCents: c, contributionDates: cs.map((x) => x.receivedOn),
      weightDollarDays: weights[k].w.toString(),
      interestCents: parts[0], unrealizedGainCents: parts[1], operatingExpenseCents: parts[2], managementFeeCents: parts[3],
      netPnlCents: net, endingCapitalCents: p.openingCapitalCents! + c + net,
      unpaidCallCents: p.unpaidCallCents, creditsCents: p.creditsCents, restrictions: p.restrictions, flags,
    };
  });
  const sum = (f: (l: SyntheticLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  const totals = {
    openingCapitalCents: sum((l) => l.openingCapitalCents), contributionsCents: sum((l) => l.contributionsCents),
    interestCents: sum((l) => l.interestCents), unrealizedGainCents: sum((l) => l.unrealizedGainCents),
    operatingExpenseCents: sum((l) => l.operatingExpenseCents), managementFeeCents: sum((l) => l.managementFeeCents),
    netPnlCents: sum((l) => l.netPnlCents), endingCapitalCents: sum((l) => l.endingCapitalCents),
    unpaidCallCents: sum((l) => l.unpaidCallCents),
  };
  const differenceCents = totals.endingCapitalCents - i.nav.navCents;
  if (differenceCents !== 0) return { ok: false, blockers: [`Investor ending capital differs from synthetic NAV by ${differenceCents} cents; no balancing adjustment is made.`] };
  return { ok: true, label: SYNTHETIC_ALLOCATION_LABEL, lines, residuals: [...interest.residuals, ...gain.residuals, ...exp.residuals], totals, differenceCents, journalEntriesCreated: 0 };
}

// ------------------------------------------------------------ period linking

export type JournalForLink = { id: string; entryDate: string; status: string; periodId: string | null; amountCents: number };

/**
 * Plan (never apply) linking posted journals to a period. Journals are never
 * re-dated or re-valued; anything out of range or already linked elsewhere is
 * reported, not moved. Applying the plan requires a separately approved action.
 */
export function planPeriodLink(journals: JournalForLink[], period: { id: string; start: string; end: string }) {
  const link: string[] = [], outOfPeriod: string[] = [], linkedElsewhere: string[] = [], alreadyLinked: string[] = [], notPosted: string[] = [], voided: string[] = [];
  for (const j of journals) {
    if (j.status === "voided" || j.status === "reversed") voided.push(j.id);
    else if (j.periodId === period.id) alreadyLinked.push(j.id);
    else if (j.periodId) linkedElsewhere.push(j.id);
    else if (t(j.entryDate) < t(period.start) || t(j.entryDate) > t(period.end)) outOfPeriod.push(j.id);
    else if (j.status !== "posted") notPosted.push(j.id);
    else link.push(j.id);
  }
  return { link, voided, outOfPeriod, linkedElsewhere, alreadyLinked, notPosted, rewritesDatesOrAmounts: false as const };
}
