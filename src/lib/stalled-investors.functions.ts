import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/require-auth";

export const stalledInvestorsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertStaff } = await import("@/lib/investor-onboarding.server");
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { groupStalled, isStalled } = await import("@/lib/stalled-investors-model");
    const { data, error } = await supabaseAdmin.from("investor_onboardings")
      .select("id, offering_id, stage, last_activity_at, removed_at, merged_into_onboarding_id, is_test_investor");
    if (error) throw new Error("Could not load investments.");
    const rows = (data ?? []) as any[];
    const now = new Date();
    const stalledByFund = new Map<string, number>();
    for (const r of rows) if (isStalled(r, now)) stalledByFund.set(r.offering_id, (stalledByFund.get(r.offering_id) ?? 0) + 1);
    const ids = [...stalledByFund.keys()];
    const { data: offs } = ids.length ? await supabaseAdmin.from("offerings").select("id, name").in("id", ids) : { data: [] };
    const names = new Map(((offs ?? []) as any[]).map((o) => [o.id, o.name as string]));
    return {
      stages: groupStalled(rows, now),
      funds: ids.map((id) => ({ id, name: names.get(id) ?? "Fund", stalled: stalledByFund.get(id)! }))
        .sort((a, b) => b.stalled - a.stalled),
    };
  });
