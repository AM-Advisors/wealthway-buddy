import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/require-auth";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required.");
}

/** Cross-fund funding snapshot: raised, committed, in-progress counts, target progress. */
export const getFundingDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: offerings, error: oErr } = await supabase
      .from("offerings")
      .select("id, name, slug, reg_type, is_open, min_investment_cents, target_raise_cents, wire_fee_cents, closing_cost_cents, created_at")
      .order("created_at", { ascending: true });
    if (oErr) throw new Error(oErr.message);

    const offeringRows = (offerings ?? []) as any[];
    const offeringIds = offeringRows.map((o) => o.id as string);

    if (offeringIds.length === 0) {
      return {
        funds: [],
        totals: {
          funds: 0,
          committedCents: 0,
          receivedCents: 0,
          inFlightCents: 0,
          targetCents: 0,
          inProgress: 0,
          settled: 0,
          wireFeesTotalCents: 0,
          closingCostCents: 0,
          totalCostsCents: 0,
          netReceivedCents: 0,
        },
      };
    }

    const { loadFundingFigures } = await import("@/lib/funding-figures.server");
    const figures = await loadFundingFigures(supabase, offeringRows);

    const funds = offeringRows.map((o) => {
      const wireFeeCents = Number((o as any).wire_fee_cents ?? 0);
      const closingCostCents = Number((o as any).closing_cost_cents ?? 0);
      const f = figures.get(o.id as string)!;
      const targetCents = Number(o.target_raise_cents ?? 0) || null;
      const totalCostsCents = f.wireFeesTotalCents + closingCostCents;
      const netReceivedCents = Math.max(0, f.receivedCents - totalCostsCents);
      const percentOfTarget =
        targetCents && targetCents > 0
          ? Math.min(100, Math.round((f.receivedCents / targetCents) * 100))
          : null;
      const remainingToTargetCents = targetCents ? Math.max(0, targetCents - f.receivedCents) : null;

      return {
        id: o.id as string,
        name: o.name as string,
        slug: o.slug as string,
        regType: o.reg_type as string,
        isOpen: Boolean(o.is_open),
        targetCents,
        applications: f.investors,
        inProgress: f.inProgress,
        settled: f.settled,
        declined: f.declined,
        committedCents: f.committedCents,
        receivedCents: f.receivedCents,
        inFlightCents: f.inFlightCents,
        outstandingCents: Math.max(0, f.committedCents - f.receivedCents),
        percentOfTarget,
        remainingToTargetCents,
        wireFeeCents,
        closingCostCents,
        wireFeesTotalCents: f.wireFeesTotalCents,
        totalCostsCents,
        netReceivedCents,
      };
    });

    const totals = {
      funds: funds.length,
      committedCents: funds.reduce((s, f) => s + f.committedCents, 0),
      receivedCents: funds.reduce((s, f) => s + f.receivedCents, 0),
      inFlightCents: funds.reduce((s, f) => s + f.inFlightCents, 0),
      targetCents: funds.reduce((s, f) => s + (f.targetCents ?? 0), 0),
      inProgress: funds.reduce((s, f) => s + f.inProgress, 0),
      settled: funds.reduce((s, f) => s + f.settled, 0),
      wireFeesTotalCents: funds.reduce((s, f) => s + f.wireFeesTotalCents, 0),
      closingCostCents: funds.reduce((s, f) => s + f.closingCostCents, 0),
      totalCostsCents: funds.reduce((s, f) => s + f.totalCostsCents, 0),
      netReceivedCents: funds.reduce((s, f) => s + f.netReceivedCents, 0),
    };

    return { funds, totals };
  });
