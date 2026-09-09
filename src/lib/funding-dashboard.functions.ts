import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      .select("id, name, slug, reg_type, is_open, min_investment_cents, target_raise_cents, created_at")
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
        },
      };
    }

    const [{ data: apps }, { data: subs }, { data: payments }] = await Promise.all([
      supabase
        .from("investor_applications")
        .select("id, offering_id, status, funding_status, commitment_cents")
        .in("offering_id", offeringIds),
      supabase
        .from("subscriptions")
        .select("application_id, commitment_cents, status")
        .in(
          "application_id",
          (apps ?? []).map((a: any) => a.id),
        ),
      supabase
        .from("payments")
        .select("application_id, amount_cents, status")
        .in(
          "application_id",
          (apps ?? []).map((a: any) => a.id),
        ),
    ]);

    const appRows = (apps ?? []) as any[];
    const subRows = (subs ?? []) as any[];
    const payRows = (payments ?? []) as any[];

    const subByApp = new Map(subRows.map((s) => [s.application_id as string, s]));
    const paysByApp = new Map<string, any[]>();
    for (const p of payRows) {
      const k = p.application_id as string;
      if (!paysByApp.has(k)) paysByApp.set(k, []);
      paysByApp.get(k)!.push(p);
    }

    const funds = offeringRows.map((o) => {
      const fundApps = appRows.filter((a) => a.offering_id === o.id);
      const appIds = fundApps.map((a) => a.id);

      const committedCents = fundApps.reduce(
        (sum, a) => sum + Number(subByApp.get(a.id)?.commitment_cents ?? a.commitment_cents ?? 0),
        0,
      );
      const receivedCents = appIds.reduce(
        (sum, id) =>
          sum +
          (paysByApp.get(id) ?? [])
            .filter((p) => p.status === "settled")
            .reduce((s, p) => s + Number(p.amount_cents ?? 0), 0),
        0,
      );
      const inFlightCents = appIds.reduce(
        (sum, id) =>
          sum +
          (paysByApp.get(id) ?? [])
            .filter((p) => p.status === "processing" || p.status === "awaiting_wire")
            .reduce((s, p) => s + Number(p.amount_cents ?? 0), 0),
        0,
      );

      const inProgress = fundApps.filter(
        (a) => !["settled", "funded", "closed", "declined"].includes(String(a.funding_status ?? "")),
      ).length;
      const settled = fundApps.filter((a) =>
        ["settled", "funded"].includes(String(a.funding_status ?? "")),
      ).length;
      const declined = fundApps.filter(
        (a) => String(a.status ?? "") === "declined" || String(a.funding_status ?? "") === "declined",
      ).length;

      const targetCents = Number(o.target_raise_cents ?? 0) || null;
      const percentOfTarget =
        targetCents && targetCents > 0
          ? Math.min(100, Math.round((receivedCents / targetCents) * 100))
          : null;
      const remainingToTargetCents = targetCents ? Math.max(0, targetCents - receivedCents) : null;

      return {
        id: o.id as string,
        name: o.name as string,
        slug: o.slug as string,
        regType: o.reg_type as string,
        isOpen: Boolean(o.is_open),
        targetCents,
        applications: fundApps.length,
        inProgress,
        settled,
        declined,
        committedCents,
        receivedCents,
        inFlightCents,
        outstandingCents: Math.max(0, committedCents - receivedCents),
        percentOfTarget,
        remainingToTargetCents,
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
    };

    return { funds, totals };
  });
