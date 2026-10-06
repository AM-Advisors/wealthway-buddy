/** Setup % per fund from blocking setup tasks + required launch conditions — the same inputs and math as Fund Setup and Readiness. */
import { fundSetupSummary } from "@/lib/fund-launch-summary";

export async function fundLaunchPercents(offeringIds: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!offeringIds.length) return out;
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { data: setups } = await db.from("fund_setups").select("id, offering_id, launch_state").in("offering_id", offeringIds);
  const list = (setups ?? []) as any[];
  const ids = list.map((s) => s.id);
  const [{ data: tasks }, { data: conds }] = ids.length
    ? await Promise.all([
        db.from("fund_setup_tasks").select("setup_id, status, blocking").in("setup_id", ids).limit(20000),
        db.from("fund_launch_conditions").select("setup_id, required, satisfied").in("setup_id", ids).limit(20000),
      ])
    : [{ data: [] }, { data: [] }];
  for (const id of offeringIds) out.set(id, null);
  for (const s of list) {
    const summary = fundSetupSummary({
      hasSetup: true,
      launchState: s.launch_state,
      tasks: ((tasks ?? []) as any[]).filter((t) => t.setup_id === s.id && t.blocking),
      conditions: ((conds ?? []) as any[]).filter((c) => c.setup_id === s.id && c.required).map((c) => ({ satisfied: Boolean(c.satisfied) })),
    });
    out.set(s.offering_id, summary.percent);
  }
  return out;
}
