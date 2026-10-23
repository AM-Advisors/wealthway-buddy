/**
 * Structured management-fee terms: precedence, conflicts and lineage.
 * Investor-specific (side letter) > investor class > fund default.
 * Only approved terms effective in the period apply. Two differing active
 * terms at the same level are never guessed between: they block the run.
 * Pure - no I/O. Free-text notes are never calculation inputs.
 */
import { managementFee, type FeeTerm, type Period } from "@/lib/allocation-model";

export type TermLevel = "investor" | "class" | "fund";

export type StructuredFeeTerm = FeeTerm & {
  id: string;
  classId: string | null;
  positionId: string | null;
  version: number;
  approvalStatus: "pending" | "approved" | "rejected" | string;
  sourceDocument?: string | null;
  sideLetterId?: string | null;
};

export const TERM_CONFLICT_MESSAGE = "ECONOMIC TERM CONFLICT — REVIEW REQUIRED";

export function termLevel(t: { positionId: string | null; classId: string | null }): TermLevel {
  return t.positionId ? "investor" : t.classId ? "class" : "fund";
}

const day = (d: string) => Date.parse(d.slice(0, 10));

export function isEffective(t: StructuredFeeTerm, period: Period) {
  if (t.approvalStatus !== "approved") return false;
  if (day(t.startsOn) > day(period.end)) return false;
  if (t.endsOn && day(t.endsOn) < day(period.start)) return false;
  return true;
}

const economics = (t: StructuredFeeTerm) =>
  JSON.stringify([t.basis, t.rateBps, t.flatAmountCents, t.frequency, t.waiverBps ?? 0, t.offsetPct ?? 0, t.stepDowns ?? []]);

export type LevelPick =
  | { status: "none" }
  | { status: "ok"; term: StructuredFeeTerm }
  | { status: "conflict"; termIds: string[] };

function pickAtLevel(candidates: StructuredFeeTerm[]): LevelPick {
  if (candidates.length === 0) return { status: "none" };
  const distinct = new Set(candidates.map(economics));
  if (distinct.size > 1) return { status: "conflict", termIds: candidates.map((c) => c.id).sort() };
  // Identical economics: deterministic pick (highest version) - no guess involved.
  const term = [...candidates].sort((a, b) => b.version - a.version)[0]!;
  return { status: "ok", term };
}

export type FeeTermResolution =
  | { status: "none"; levels: Record<TermLevel, LevelPick> }
  | { status: "conflict"; level: TermLevel; termIds: string[]; levels: Record<TermLevel, LevelPick> }
  | { status: "ok"; level: TermLevel; term: StructuredFeeTerm; levels: Record<TermLevel, LevelPick> };

export function resolveFeeTerm(
  terms: StructuredFeeTerm[],
  position: { positionId: string; classId: string | null },
  period: Period,
): FeeTermResolution {
  const live = terms.filter((t) => isEffective(t, period));
  const levels: Record<TermLevel, LevelPick> = {
    investor: pickAtLevel(live.filter((t) => t.positionId === position.positionId)),
    class: pickAtLevel(
      live.filter((t) => !t.positionId && t.classId && t.classId === position.classId),
    ),
    fund: pickAtLevel(live.filter((t) => !t.positionId && !t.classId)),
  };
  for (const level of ["investor", "class", "fund"] as const) {
    const p = levels[level];
    if (p.status === "conflict") return { status: "conflict", level, termIds: p.termIds, levels };
    if (p.status === "ok") return { status: "ok", level, term: p.term, levels };
  }
  return { status: "none", levels };
}

export type FeeLineage = {
  positionId: string;
  period: Period;
  fundDefaultBps: number | null;
  classBps: number | null;
  investorOverrideBps: number | null;
  appliedLevel: TermLevel | null;
  effectiveRateBps: number;
  basis: string | null;
  basisAmountCents: number;
  sourceTermId: string | null;
  sourceDocument: string | null;
  grossFeeCents: number;
  waiverCents: number;
  offsetCents: number;
  netFeeCents: number;
  conflict: { level: TermLevel; termIds: string[] } | null;
};

const bpsOf = (p: LevelPick) => (p.status === "ok" ? p.term.rateBps : null);

export type FeePosition = {
  positionId: string;
  classId: string | null;
  commitmentCents: number;
  contributedToDateCents: number;
  beginningCapitalCents: number;
};

export function basisAmountFor(term: FeeTerm, p: FeePosition) {
  switch (term.basis) {
    case "committed_capital":
      return p.commitmentCents;
    case "invested_capital":
    case "cost_basis":
      return p.contributedToDateCents;
    case "net_asset_value":
      return p.beginningCapitalCents;
    default:
      return 0;
  }
}

/** Per-investor fee with full lineage. Conflicts produce a zero fee and a blocking flag. */
export function investorFee(terms: StructuredFeeTerm[], p: FeePosition, period: Period): FeeLineage {
  const r = resolveFeeTerm(terms, p, period);
  const base: FeeLineage = {
    positionId: p.positionId,
    period,
    fundDefaultBps: bpsOf(r.levels.fund),
    classBps: bpsOf(r.levels.class),
    investorOverrideBps: bpsOf(r.levels.investor),
    appliedLevel: null,
    effectiveRateBps: 0,
    basis: null,
    basisAmountCents: 0,
    sourceTermId: null,
    sourceDocument: null,
    grossFeeCents: 0,
    waiverCents: 0,
    offsetCents: 0,
    netFeeCents: 0,
    conflict: null,
  };
  if (r.status === "conflict") return { ...base, appliedLevel: r.level, conflict: { level: r.level, termIds: r.termIds } };
  if (r.status === "none") return base;
  const amount = basisAmountFor(r.term, p);
  const fee = managementFee(r.term, amount, period);
  return {
    ...base,
    appliedLevel: r.level,
    effectiveRateBps: fee.rateBps,
    basis: fee.basis,
    basisAmountCents: amount,
    sourceTermId: r.term.id,
    sourceDocument: r.term.sourceDocument ?? null,
    grossFeeCents: fee.grossFeeCents,
    waiverCents: fee.waiverCents,
    offsetCents: fee.offsetCents,
    netFeeCents: fee.netFeeCents,
  };
}

export type FeeRun = {
  lines: FeeLineage[];
  conflicts: FeeLineage[];
  blocked: boolean;
  totalNetCents: number;
  totalWaiverCents: number;
  totalOffsetCents: number;
};

export function computeFeeRun(terms: StructuredFeeTerm[], positions: FeePosition[], period: Period): FeeRun {
  const lines = positions.map((p) => investorFee(terms, p, period));
  const conflicts = lines.filter((l) => l.conflict);
  return {
    lines,
    conflicts,
    blocked: conflicts.length > 0,
    totalNetCents: lines.reduce((s, l) => s + l.netFeeCents, 0),
    totalWaiverCents: lines.reduce((s, l) => s + l.waiverCents, 0),
    totalOffsetCents: lines.reduce((s, l) => s + l.offsetCents, 0),
  };
}

/** Investor-level fees vs the fund-level accrual. Any difference must be explained or it blocks. */
export function reconcileFees(run: FeeRun, ledgerFeeCents: number) {
  const differenceCents = ledgerFeeCents - run.totalNetCents;
  return {
    investorTotalCents: run.totalNetCents,
    ledgerFeeCents,
    differenceCents,
    ties: differenceCents === 0,
  };
}

/** What an investor may see: their own result only, never another investor's or the term lineage. */
export function investorFacingFee(line: FeeLineage) {
  return { period: line.period, effectiveRateBps: line.effectiveRateBps, feeCents: line.netFeeCents };
}
