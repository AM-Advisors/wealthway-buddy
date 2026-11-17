/**
 * Loads the records fundingDashboardFigures needs for a set of funds and
 * returns one figure set per fund. Read-only. Callers authorize first and pass
 * the client whose access already matches that authorization.
 */
import { fundingDashboardFigures, type DashboardFundFigures } from "@/lib/funding-dashboard-model";

export async function loadFundingFigures(
  db: any,
  funds: readonly { id: string; wire_fee_cents?: number | null }[],
): Promise<Map<string, DashboardFundFigures>> {
  const out = new Map<string, DashboardFundFigures>();
  const ids = funds.map((f) => f.id);
  if (!ids.length) return out;
  const [appsRes, onbsRes] = await Promise.all([
    db
      .from("investor_applications")
      .select("id, offering_id, user_id, status, funding_status, commitment_cents, wire_fee_cents")
      .in("offering_id", ids)
      .limit(5000),
    // Current investment records: the same rows the fund workspace and manager home count.
    db
      .from("investor_onboardings")
      .select(
        "id, offering_id, investor_user_id, application_id, stage, funding_status, accepted_amount_cents, commitment_amount_cents, requested_amount_cents, funded_amount_cents, removed_at, merged_into_onboarding_id",
      )
      .in("offering_id", ids)
      .limit(10000),
  ]);
  if (appsRes.error) throw new Error(appsRes.error.message);
  if (onbsRes.error) throw new Error("Investment records could not be loaded. Please try again.");
  const apps = (appsRes.data ?? []) as any[];
  const onbs = (onbsRes.data ?? []) as any[];
  const appIds = apps.map((a) => a.id as string);

  let subs: any[] = [];
  let pays: any[] = [];
  if (appIds.length) {
    const [subRes, payRes] = await Promise.all([
      db.from("subscriptions").select("application_id, commitment_cents").in("application_id", appIds).limit(5000),
      db.from("payments").select("application_id, amount_cents, status").in("application_id", appIds).limit(10000),
    ]);
    subs = (subRes.data ?? []) as any[];
    pays = (payRes.data ?? []) as any[];
  }
  const subscriptionCommitments = new Map<string, number>();
  for (const s of subs) {
    if (s.commitment_cents != null) subscriptionCommitments.set(s.application_id as string, Number(s.commitment_cents));
  }
  for (const f of funds) {
    out.set(f.id, fundingDashboardFigures(f.id, onbs, apps, pays, subscriptionCommitments, Number(f.wire_fee_cents ?? 0)));
  }
  return out;
}
