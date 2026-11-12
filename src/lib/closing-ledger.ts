/**
 * Pure: the commitment-ledger entries a closing writes. Event types must be
 * ones the ledger accepts (see COMMITMENT_EVENT_TYPES); an existing original
 * commitment or contribution on the position is never duplicated.
 */
import { commitmentAsOf, type CommitmentEvent, type CommitmentEventType, COMMITMENT_EVENT_TYPES } from "@/lib/allocation-model";

export type ClosingLedgerInput = {
  onboardingId: string;
  positionId: string;
  offeringId: string;
  commitmentCents: number;
  fundedCents: number;
  closingDate: string;
  recordedBy: string | null;
  existing: Array<{ event_type: string; dedupe_key?: string | null }>;
};

export function closingLedgerEntries(input: ClosingLedgerInput) {
  const has = (types: string[], key: string) =>
    input.existing.some((e) => e.dedupe_key === key || types.includes(e.event_type));
  const base = {
    position_id: input.positionId,
    offering_id: input.offeringId,
    effective_date: input.closingDate,
    source: "investor_onboarding",
    source_ref: input.onboardingId,
    recorded_by: input.recordedBy,
  };
  const out: Array<typeof base & { event_type: CommitmentEventType; amount_cents: number; dedupe_key: string }> = [];
  const commitmentKey = `onboarding:${input.onboardingId}:commitment`;
  const contributionKey = `onboarding:${input.onboardingId}:contribution`;
  if (input.commitmentCents > 0 && !has(["original_commitment"], commitmentKey)) {
    out.push({ ...base, event_type: "original_commitment", amount_cents: input.commitmentCents, dedupe_key: commitmentKey });
  }
  if (input.fundedCents > 0 && !has(["contribution", "contribution_settled"], contributionKey)) {
    out.push({ ...base, event_type: "contribution", amount_cents: input.fundedCents, dedupe_key: contributionKey });
  }
  return out;
}

const KNOWN = new Set<string>(COMMITMENT_EVENT_TYPES);

/** Commitment-ledger figures for one position, used before its first published statement. */
export function ledgerFigures(rows: Array<{ event_type: string; amount_cents: number | string | null; effective_date: string }>, asOf?: string) {
  const events: CommitmentEvent[] = rows
    .filter((r) => KNOWN.has(r.event_type))
    .map((r) => ({ eventType: r.event_type as CommitmentEventType, amountCents: Math.abs(Number(r.amount_cents ?? 0)), effectiveDate: String(r.effective_date) }));
  const s = commitmentAsOf(events, asOf);
  return {
    commitmentCents: s.currentCommitmentCents,
    contributedCents: s.contributedCents,
    unfundedCommitmentCents: s.unfundedCommitmentCents,
    distributionsCents: s.distributionsCents,
  };
}
