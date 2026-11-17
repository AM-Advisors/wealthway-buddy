/**
 * Funding dashboard figures for one fund, built from the canonical investment
 * records (investor_onboardings) plus any older application no current
 * investment has replaced. Pure: nothing here reads or writes the database.
 * Amounts follow investment-amounts.ts and the one Funded rule in
 * funding-status.ts, so the dashboard matches the fund workspace and the
 * manager home. Each investment counts once; a linked older application is
 * folded into it and its settled payments are never added twice.
 */
import { applicationHoldsValue, joinFundRecords } from "@/lib/investment-record-mapping";
import { investmentAmountCents, reconciledFundedCents } from "@/lib/investment-amounts";
import { effectiveFundingStatus, isPendingReconciliation, isReconciledFunding } from "@/lib/funding-status";

export type DashboardOnboarding = {
  id: string;
  offering_id: string;
  investor_user_id?: string | null;
  application_id?: string | null;
  stage?: string | null;
  funding_status?: string | null;
  accepted_amount_cents?: number | null;
  commitment_amount_cents?: number | null;
  requested_amount_cents?: number | null;
  funded_amount_cents?: number | null;
  removed_at?: string | null;
  merged_into_onboarding_id?: string | null;
};

export type DashboardApplication = {
  id: string;
  offering_id: string;
  user_id?: string | null;
  status?: string | null;
  funding_status?: string | null;
  commitment_cents?: number | null;
  wire_fee_cents?: number | null;
};

export type DashboardPayment = { application_id: string; amount_cents?: number | null; status?: string | null };

export type DashboardFundFigures = {
  investors: number;
  inProgress: number;
  settled: number;
  declined: number;
  committedCents: number;
  receivedCents: number;
  inFlightCents: number;
  wireFeesTotalCents: number;
};

/** Ended investments: shown as declined, never counted in money or progress. */
const ENDED_STAGES = new Set(["declined", "cancelled", "rejected", "withdrawn"]);
/** Ended older applications: never counted (same exclusions as the cap table). */
const ENDED_APPLICATION_STATUSES = new Set(["withdrawn", "declined", "rejected", "cancelled"]);
const IN_TRANSIT_PAYMENTS = new Set(["processing", "awaiting_wire"]);

function paymentSums(payments: readonly DashboardPayment[]) {
  const settled = new Map<string, number>();
  const inTransit = new Map<string, number>();
  for (const p of payments) {
    const target = p.status === "settled" ? settled : IN_TRANSIT_PAYMENTS.has(String(p.status ?? "")) ? inTransit : null;
    if (!target) continue;
    target.set(p.application_id, (target.get(p.application_id) ?? 0) + Number(p.amount_cents ?? 0));
  }
  return { settled, inTransit };
}

export function fundingDashboardFigures(
  fundId: string,
  onboardings: readonly DashboardOnboarding[],
  applications: readonly DashboardApplication[],
  payments: readonly DashboardPayment[],
  subscriptionCommitments: ReadonlyMap<string, number>,
  fundWireFeeCents: number,
): DashboardFundFigures {
  const out: DashboardFundFigures = {
    investors: 0, inProgress: 0, settled: 0, declined: 0,
    committedCents: 0, receivedCents: 0, inFlightCents: 0, wireFeesTotalCents: 0,
  };
  const ownApps = applications.filter((a) => a.offering_id === fundId && !ENDED_APPLICATION_STATUSES.has(String(a.status ?? "")));
  const ownOnbs = onboardings.filter((o) => o.offering_id === fundId);
  const { settled, inTransit } = paymentSums(payments);
  const appsWithRecords = new Set([...settled.keys(), ...inTransit.keys()]);
  const joined = joinFundRecords(ownApps, ownOnbs, (app) => appsWithRecords.has(app.id) || applicationHoldsValue(app));

  const count = (funding: string | null, committed: number, received: number, inFlight: number, wireFee: number) => {
    out.investors += 1;
    out.committedCents += committed;
    out.receivedCents += received;
    out.inFlightCents += inFlight;
    if (isReconciledFunding(funding)) {
      out.settled += 1;
      out.wireFeesTotalCents += wireFee;
    } else if (funding !== "closed") out.inProgress += 1;
  };

  const investments = [
    ...joined.linked.map((l) => ({ onb: l.investment, app: l.application as DashboardApplication | null })),
    ...joined.investmentsOnly.map((onb) => ({ onb, app: null as DashboardApplication | null })),
  ];
  for (const { onb, app } of investments) {
    if (ENDED_STAGES.has(String(onb.stage ?? ""))) {
      out.declined += 1;
      continue;
    }
    const funding = effectiveFundingStatus(onb.funding_status, app?.funding_status);
    const committed =
      investmentAmountCents(onb) ??
      (app ? subscriptionCommitments.get(app.id) ?? Number(app.commitment_cents ?? 0) : 0);
    const received = Math.max(reconciledFundedCents(onb, funding), app ? settled.get(app.id) ?? 0 : 0);
    const reportedOnRecord = isPendingReconciliation(funding) ? Number(onb.funded_amount_cents ?? 0) : 0;
    const inFlight = Math.max(reportedOnRecord, app ? inTransit.get(app.id) ?? 0 : 0);
    const wireFee = app?.wire_fee_cents != null ? Number(app.wire_fee_cents) : fundWireFeeCents;
    count(funding, committed, received, inFlight, wireFee);
  }
  for (const app of joined.applicationsOnly) {
    const committed = subscriptionCommitments.get(app.id) ?? Number(app.commitment_cents ?? 0);
    const wireFee = app.wire_fee_cents != null ? Number(app.wire_fee_cents) : fundWireFeeCents;
    count(app.funding_status ?? null, committed, settled.get(app.id) ?? 0, inTransit.get(app.id) ?? 0, wireFee);
  }
  return out;
}
