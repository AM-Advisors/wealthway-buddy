/**
 * Manager home fund cards, built from the canonical investment records
 * (investor_onboardings) plus any older application that no current
 * investment has replaced. Pure: nothing here reads or writes the database.
 * Amounts follow investment-amounts.ts, so the cards match the fund workspace.
 */
import { applicationHoldsValue, joinFundRecords } from "@/lib/investment-record-mapping";
import { investmentAmountCents, reconciledFundedCents } from "@/lib/investment-amounts";
import { effectiveFundingStatus, isReconciledFunding } from "@/lib/funding-status";

export type PanelStage = "identity" | "accreditation" | "documents" | "funding" | "complete";

export type PanelOnboarding = {
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

export type PanelApplication = {
  id: string;
  offering_id: string;
  user_id?: string | null;
  kyc_status?: string | null;
  aml_status?: string | null;
  accreditation_status?: string | null;
  documents_status?: string | null;
  funding_status?: string | null;
  commitment_cents?: number | null;
};

export type PanelFundCounts = {
  total: number;
  identity: number;
  accreditation: number;
  documents: number;
  funding: number;
  complete: number;
  committedCents: number;
  receivedCents: number;
};

/** Ended investments never count on the manager home. */
export const ENDED_STAGES = new Set(["declined", "cancelled"]);

/** Which step an investment is on, from its recorded stage and funding. */
export function onboardingPanelStage(o: { stage?: string | null }, fundingStatus: string | null | undefined): PanelStage {
  if (isReconciledFunding(fundingStatus)) return "complete";
  switch (o.stage) {
    case "closed":
    case "accepted":
      return "complete";
    case "started":
    case "profile_selected":
    case "verification":
      return "identity";
    case "eligibility":
      return "accreditation";
    case "tax":
    case "subscription":
    case "signature":
      return "documents";
    default:
      return "funding";
  }
}

function applicationPanelStage(app: PanelApplication): PanelStage {
  if (isReconciledFunding(app.funding_status)) return "complete";
  if (app.kyc_status !== "approved" || app.aml_status !== "approved") return "identity";
  if (app.accreditation_status !== "approved") return "accreditation";
  if (app.documents_status !== "approved") return "documents";
  return "funding";
}

/**
 * Counts for one fund. Each live investment counts once (its linked older
 * application is folded in); unlinked older applications still count unless a
 * current investment for the same login replaced them and they hold nothing.
 * `settledByApplication` is reconciled money recorded on older applications;
 * `appsWithRecords` are applications holding wires or payments.
 */
export function managerFundCounts(
  fundId: string,
  onboardings: readonly PanelOnboarding[],
  applications: readonly PanelApplication[],
  settledByApplication: ReadonlyMap<string, number>,
  appsWithRecords: ReadonlySet<string> = new Set(),
): PanelFundCounts {
  const counts: PanelFundCounts = { total: 0, identity: 0, accreditation: 0, documents: 0, funding: 0, complete: 0, committedCents: 0, receivedCents: 0 };
  const ownApps = applications.filter((a) => a.offering_id === fundId);
  const ownOnbs = onboardings.filter((o) => o.offering_id === fundId && !ENDED_STAGES.has(String(o.stage ?? "")));
  const joined = joinFundRecords(ownApps, ownOnbs, (app) => appsWithRecords.has(app.id) || applicationHoldsValue(app));
  const investments = [
    ...joined.linked.map((l) => ({ onb: l.investment, app: l.application as PanelApplication | null })),
    ...joined.investmentsOnly.map((onb) => ({ onb, app: null as PanelApplication | null })),
  ];
  for (const { onb, app } of investments) {
    const funding = effectiveFundingStatus(onb.funding_status, app?.funding_status);
    counts.total += 1;
    counts[onboardingPanelStage(onb, funding)] += 1;
    counts.committedCents += investmentAmountCents(onb) ?? Number(app?.commitment_cents ?? 0);
    const onRecord = reconciledFundedCents(onb, funding);
    const onApplication = app ? settledByApplication.get(app.id) ?? 0 : 0;
    counts.receivedCents += Math.max(onRecord, onApplication);
  }
  for (const app of joined.applicationsOnly) {
    counts.total += 1;
    counts[applicationPanelStage(app)] += 1;
    counts.committedCents += Number(app.commitment_cents ?? 0);
    counts.receivedCents += settledByApplication.get(app.id) ?? 0;
  }
  return counts;
}

/**
 * Display name for an older application from its linked current investment:
 * the investing party's legal name, then the person's name. Null when there
 * is no linked investment, so callers keep their existing fallback.
 */
export function canonicalApplicationNames(
  onboardings: readonly { application_id?: string | null; profileName?: string | null; personName?: string | null }[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const o of onboardings) {
    if (!o.application_id || out.has(o.application_id)) continue;
    const name = (o.profileName ?? "").trim() || (o.personName ?? "").trim();
    if (name) out.set(o.application_id, name);
  }
  return out;
}

export type ReviewOnboarding = PanelOnboarding & { approved_to_fund_at?: string | null; is_test_investor?: boolean | null };
export type ReviewApplication = PanelApplication & { status?: string | null; manager_review_status?: string | null };

/** A signed investment waiting on the fund manager's approval, read from the row alone. */
export function awaitingManagerApproval(o: ReviewOnboarding): boolean {
  return o.stage === "harmonious_review" && !o.approved_to_fund_at && !o.removed_at && !o.merged_into_onboarding_id;
}

/**
 * One "Funds you manage" line for the home page, from the same canonical join
 * as the manager panel: current investment records plus older applications no
 * investment replaced. Test investors (and the older application linked to
 * one) never count. Reviews are signed investments awaiting the manager, plus
 * older unlinked applications still marked for review.
 */
export function reviewerFundLine(
  fundId: string,
  onboardings: readonly ReviewOnboarding[],
  applications: readonly ReviewApplication[],
  appsWithRecords: ReadonlySet<string> = new Set(),
): { investors: number; committedCents: number; needsReview: number } {
  const testAppIds = new Set(onboardings.filter((o) => o.is_test_investor === true && o.application_id).map((o) => o.application_id as string));
  const counted = onboardings.filter((o) => o.is_test_investor !== true);
  const apps = applications.filter((a) => !testAppIds.has(a.id));
  const counts = managerFundCounts(fundId, counted, apps, new Map(), appsWithRecords);
  const joined = joinFundRecords(
    apps.filter((a) => a.offering_id === fundId),
    counted.filter((o) => o.offering_id === fundId && !ENDED_STAGES.has(String(o.stage ?? ""))),
    (app) => appsWithRecords.has(app.id) || applicationHoldsValue(app),
  );
  const investments = [...joined.linked.map((l) => l.investment), ...joined.investmentsOnly];
  const needsReview =
    investments.filter(awaitingManagerApproval).length +
    joined.applicationsOnly.filter((a) => a.status === "submitted" || a.manager_review_status === "pending").length;
  return { investors: counts.total, committedCents: counts.committedCents, needsReview };
}
