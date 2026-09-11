// The signed-in investor's own capital picture: what they committed, what the
// fund has received, the units recorded for them and what has been distributed.
// These figures come from the fund's own records. They are an administrative
// record, not a valuation, audit, tax return or investment advice.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EXCLUDED_STATUSES = new Set(["withdrawn", "declined", "rejected", "cancelled"]);

export type InvestorCapitalFund = {
  applicationId: string;
  offeringId: string;
  fundName: string;
  legalEntityName: string | null;
  regType: string | null;
  status: string;
  closingDate: string | null;
  commitmentCents: number;
  contributedCents: number;
  outstandingCents: number;
  shares: number | null;
  shareClass: string | null;
  ownershipPct: number | null;
  sharePriceCents: number | null;
  fundDistributionsCents: number;
  myDistributionsCents: number | null;
  distributions: { date: string | null; amountCents: number; myShareCents: number | null }[];
  valuation: { asOf: string; navCents: number; myShareCents: number | null } | null;
  statementCount: number;
  latestStatementDate: string | null;
};

/** Every fund the signed-in investor holds, with their capital account figures. */
export const getMyCapitalSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvestorCapitalFund[]> => {
    const { supabase, userId } = context;

    const { data: apps } = await supabase
      .from("investor_applications")
      .select("id, offering_id, status, commitment_cents, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    const active = ((apps ?? []) as any[]).filter((a) => !EXCLUDED_STATUSES.has(String(a.status)));
    if (!active.length) return [];

    const applicationIds = active.map((a) => String(a.id));
    const offeringIds = Array.from(new Set(active.map((a) => String(a.offering_id))));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { data: offerings },
      { data: myPositions },
      { data: allPositions },
      { data: payments },
      { data: closings },
      { data: distributions },
      { data: valuations },
      { data: statements },
    ] = await Promise.all([
      supabaseAdmin
        .from("offerings")
        .select("id, name, legal_entity_name, reg_type, share_price_cents")
        .in("id", offeringIds),
      supabaseAdmin
        .from("investor_cap_positions")
        .select("application_id, shares, share_class, ownership_pct_override")
        .in("application_id", applicationIds),
      supabaseAdmin
        .from("investor_cap_positions")
        .select("offering_id, shares")
        .in("offering_id", offeringIds),
      supabaseAdmin
        .from("payments")
        .select("application_id, amount_cents, status")
        .in("application_id", applicationIds),
      supabaseAdmin
        .from("application_closings")
        .select("application_id, closing_date, funded_amount_cents")
        .in("application_id", applicationIds),
      supabaseAdmin
        .from("fund_distributions")
        .select("offering_id, amount_cents, distribution_date, paid_on, created_at")
        .in("offering_id", offeringIds),
      supabaseAdmin
        .from("fund_valuations")
        .select("offering_id, as_of_date, nav_cents")
        .in("offering_id", offeringIds)
        .order("as_of_date", { ascending: false }),
      supabaseAdmin
        .from("capital_account_statements")
        .select("application_id, statement_date, created_at")
        .in("application_id", applicationIds)
        .order("created_at", { ascending: false }),
    ]);

    const offeringById = new Map(((offerings ?? []) as any[]).map((o) => [String(o.id), o]));
    const positionByApp = new Map(
      ((myPositions ?? []) as any[]).map((p) => [String(p.application_id), p]),
    );
    const closingByApp = new Map(
      ((closings ?? []) as any[]).map((c) => [String(c.application_id), c]),
    );

    const totalSharesByFund = new Map<string, number>();
    for (const position of (allPositions ?? []) as any[]) {
      const key = String(position.offering_id);
      totalSharesByFund.set(
        key,
        (totalSharesByFund.get(key) ?? 0) + Number(position.shares ?? 0),
      );
    }

    const settledByApp = new Map<string, number>();
    for (const payment of (payments ?? []) as any[]) {
      if (String(payment.status) !== "settled") continue;
      const key = String(payment.application_id);
      settledByApp.set(key, (settledByApp.get(key) ?? 0) + Number(payment.amount_cents ?? 0));
    }

    const distributionsByFund = new Map<string, any[]>();
    for (const row of (distributions ?? []) as any[]) {
      const key = String(row.offering_id);
      distributionsByFund.set(key, [...(distributionsByFund.get(key) ?? []), row]);
    }

    const valuationByFund = new Map<string, any>();
    for (const row of (valuations ?? []) as any[]) {
      const key = String(row.offering_id);
      if (!valuationByFund.has(key)) valuationByFund.set(key, row);
    }

    const statementsByApp = new Map<string, any[]>();
    for (const row of (statements ?? []) as any[]) {
      const key = String(row.application_id);
      statementsByApp.set(key, [...(statementsByApp.get(key) ?? []), row]);
    }

    return active.map((app) => {
      const offeringId = String(app.offering_id);
      const applicationId = String(app.id);
      const offering = offeringById.get(offeringId) ?? {};
      const position = positionByApp.get(applicationId);
      const closing = closingByApp.get(applicationId);

      const commitmentCents = Number(app.commitment_cents ?? 0);
      const contributedCents =
        settledByApp.get(applicationId) ?? Number(closing?.funded_amount_cents ?? 0);

      const shares =
        position?.shares === null || position?.shares === undefined
          ? null
          : Number(position.shares);
      let ownershipPct: number | null =
        position?.ownership_pct_override === null || position?.ownership_pct_override === undefined
          ? null
          : Number(position.ownership_pct_override);
      if (ownershipPct === null && shares !== null) {
        const total = totalSharesByFund.get(offeringId) ?? 0;
        if (total > 0) ownershipPct = (shares / total) * 100;
      }

      const fundDistributions = distributionsByFund.get(offeringId) ?? [];
      const fundDistributionsCents = fundDistributions.reduce(
        (sum, d) => sum + Number(d.amount_cents ?? 0),
        0,
      );
      const share = (cents: number) =>
        ownershipPct === null ? null : Math.round((cents * ownershipPct) / 100);

      const valuationRow = valuationByFund.get(offeringId);
      const statementRows = statementsByApp.get(applicationId) ?? [];

      return {
        applicationId,
        offeringId,
        fundName: String(offering.name ?? "Fund"),
        legalEntityName: (offering.legal_entity_name ?? null) as string | null,
        regType: (offering.reg_type ?? null) as string | null,
        status: String(app.status ?? "pending"),
        closingDate: (closing?.closing_date ?? null) as string | null,
        commitmentCents,
        contributedCents,
        outstandingCents: Math.max(0, commitmentCents - contributedCents),
        shares,
        shareClass: (position?.share_class ?? null) as string | null,
        ownershipPct,
        sharePriceCents:
          offering.share_price_cents === null || offering.share_price_cents === undefined
            ? null
            : Number(offering.share_price_cents),
        fundDistributionsCents,
        myDistributionsCents: share(fundDistributionsCents),
        distributions: fundDistributions
          .map((d) => ({
            date: (d.distribution_date ?? d.paid_on ?? d.created_at ?? null) as string | null,
            amountCents: Number(d.amount_cents ?? 0),
            myShareCents: share(Number(d.amount_cents ?? 0)),
          }))
          .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))),
        valuation: valuationRow
          ? {
              asOf: String(valuationRow.as_of_date),
              navCents: Number(valuationRow.nav_cents ?? 0),
              myShareCents: share(Number(valuationRow.nav_cents ?? 0)),
            }
          : null,
        statementCount: statementRows.length,
        latestStatementDate: (statementRows[0]?.statement_date ??
          statementRows[0]?.created_at ??
          null) as string | null,
      };
    });
  });
