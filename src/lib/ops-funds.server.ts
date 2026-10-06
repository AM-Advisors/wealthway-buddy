/** Operations → Funds dashboard. Staff only; read-only; built from canonical records. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff, computeReadinessFor } from "@/lib/investor-onboarding.server";
import { fundMetrics, totals, type FundOnboardingFact } from "@/lib/ops-funds-model";
import { setupCompletion } from "@/lib/fund-setup-canonical";

const db = () => supabaseAdmin as any;

export async function opsFundsDashboard(userId: string, supabase: any) {
  await assertStaff(userId);
  const [{ data: offs }, { data: onbs }, { data: tasks }, { data: setups }, { data: managers }, { data: links }] = await Promise.all([
    db().from("offerings").select("id, name, client_id, is_open").order("name").limit(1000),
    db().from("investor_onboardings").select("*").not("stage", "in", "(declined,cancelled)").limit(5000),
    db().from("investment_readiness_tasks").select("offering_id, owner").eq("status", "open").limit(5000),
    db().from("fund_setups").select("offering_id, target_close, final_close").limit(1000),
    db().from("fund_managers").select("offering_id, user_id").limit(5000),
    db().from("fund_onboarding_links").select("offering_id, status").eq("status", "active"),
  ]);
  const offerings = (offs ?? []) as any[];
  const clientIds = [...new Set(offerings.map((o) => o.client_id).filter(Boolean))];
  const [{ data: clients }, { data: assigns }] = await Promise.all([
    clientIds.length ? db().from("clients").select("id, name").in("id", clientIds) : { data: [] },
    clientIds.length ? db().from("client_assignments").select("client_id, staff_user_id, assignment_role").in("client_id", clientIds) : { data: [] },
  ]);
  const people = [...new Set([...((managers ?? []) as any[]).map((m) => m.user_id), ...((assigns ?? []) as any[]).map((a) => a.staff_user_id)])];
  const { data: profs } = people.length ? await db().from("profiles").select("user_id, legal_name").in("user_id", people) : { data: [] };
  const name = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name ?? "Unnamed"]));
  const clientName = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));
  const owner = new Map<string, { id: string; name: string }>();
  for (const a of (assigns ?? []) as any[]) if (!owner.has(a.client_id)) owner.set(a.client_id, { id: a.staff_user_id, name: name.get(a.staff_user_id) ?? "Unnamed" });
  const setup = new Map(((setups ?? []) as any[]).map((s) => [s.offering_id, s]));
  const activeLink = new Set(((links ?? []) as any[]).map((l) => l.offering_id));

  const facts: FundOnboardingFact[] = [];
  for (const row of (onbs ?? []) as any[]) {
    const { result } = await computeReadinessFor(row);
    facts.push({
      offeringId: row.offering_id, stage: row.stage, closeReady: result.closeReady, terminal: result.terminal,
      blocked: result.items.some((i) => i.status === "blocked"), nextOwner: result.nextAction?.owner ?? null, fundingStatus: row.funding_status ?? null,
    });
  }
  const openTasks = ((tasks ?? []) as any[]).map((t) => ({ offeringId: t.offering_id, owner: t.owner }));
  const { agreementStatusForClients } = await import("@/lib/commercial-agreements.server");
  const agreements = await agreementStatusForClients(clientIds as string[]).catch(() => new Map());
  // Same setup % as Fund Setup and Readiness (blocking tasks + required launch conditions).
  const { fundLaunchPercents } = await import("@/lib/fund-launch-percent.server");
  const completion = await fundLaunchPercents(offerings.map((o) => o.id as string));
  void supabase;
  const rows = offerings.map((o) => {
    const mgrs = ((managers ?? []) as any[]).filter((m) => m.offering_id === o.id).map((m) => ({ id: m.user_id as string, name: (name.get(m.user_id) ?? "Unnamed") as string }));
    const s = setup.get(o.id);
    return {
      id: o.id as string,
      name: o.name as string,
      isOpen: !!o.is_open,
      clientId: (o.client_id ?? null) as string | null,
      clientName: (clientName.get(o.client_id) ?? null) as string | null,
      owner: o.client_id ? owner.get(o.client_id) ?? null : null,
      managers: mgrs,
      targetClose: (s?.target_close ?? s?.final_close ?? null) as string | null,
      hasActiveLink: activeLink.has(o.id),
      setupCompletion: completion.get(o.id) ?? null,
      metrics: fundMetrics(o.id, facts, openTasks),
      // Harmonious commercial agreement: a follow-up signal only, never a fund blocker.
      agreement: (o.client_id && agreements.get(o.client_id)?.overall) || "needs_review",
    };
  });
  return { rows, totals: totals(rows) };
}
