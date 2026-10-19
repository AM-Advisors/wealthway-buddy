/** Operations → Funds dashboard. Staff only; read-only; built from canonical records. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff, computeReadinessFor } from "@/lib/investor-onboarding.server";
import { fundMetrics, totals, type FundOnboardingFact } from "@/lib/ops-funds-model";

const db = () => supabaseAdmin as any;

// Short-lived cache: the dashboard recomputes readiness for every investor, which is expensive;
// the data is identical for all staff, so share one result for a minute. Read-only either way.
let DASH_CACHE: { at: number; v: { rows: any[]; totals: any } } | null = null;
const DASH_TTL = 60_000;

export async function opsFundsDashboard(userId: string, supabase: any) {
  await assertStaff(userId);
  const { data: myRoles } = await db().from("user_roles").select("role").eq("user_id", userId);
  const canDelete = ((myRoles ?? []) as any[]).some((r) => r.role === "super_admin");
  if (DASH_CACHE && Date.now() - DASH_CACHE.at < DASH_TTL) {
    return { rows: DASH_CACHE.v.rows, canDelete, totals: DASH_CACHE.v.totals };
  }
  const built = await buildOpsFundsDashboard(userId, supabase);
  DASH_CACHE = { at: Date.now(), v: { rows: built.rows, totals: built.totals } };
  return { rows: built.rows, canDelete, totals: built.totals };
}

const SUMMARY_TTL = 60 * 60 * 1000;
const REFRESH_LIMIT = 4;

async function buildOpsFundsDashboard(userId: string, supabase: any) {
  const [{ data: offs }, { data: onbs }, { data: tasks }, { data: setups }, { data: managers }, { data: links }] = await Promise.all([
    db().from("offerings").select("id, name, client_id, is_open, is_demo").order("name").limit(1000),
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

  // Per-investor readiness comes from saved summaries. Computing it live for every
  // investor made thousands of database calls and the page timed out. Only missing or
  // stale summaries (older than SUMMARY_TTL, oldest first) are refreshed, up to
  // REFRESH_LIMIT per load, so the page always stays within the server's limits.
  const onbRows = (onbs ?? []) as any[];
  const ids = onbRows.map((r) => r.id);
  const saved = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db().from("onboarding_readiness_summaries").select("*").in("onboarding_id", ids.slice(i, i + 300));
    for (const r of (data ?? []) as any[]) saved.set(r.onboarding_id, r);
  }
  const cutoff = Date.now() - SUMMARY_TTL;
  const stale = onbRows
    .filter((r) => { const s = saved.get(r.id); return !s || new Date(s.computed_at).getTime() < cutoff || (r.updated_at && new Date(r.updated_at) > new Date(s.computed_at)); })
    .sort((a, b) => (saved.has(a.id) ? 1 : 0) - (saved.has(b.id) ? 1 : 0))
    .slice(0, REFRESH_LIMIT);
  const factsDone = (async () => {
    const { saveReadinessSummary } = await import("@/lib/investor-onboarding.server");
    for (let i = 0; i < stale.length; i += 5) {
      await Promise.all(stale.slice(i, i + 5).map(async (row) => {
        try {
          const { result } = await computeReadinessFor(row);
          await saveReadinessSummary(row, result);
          saved.set(row.id, { close_ready: result.closeReady, terminal: result.terminal, blocked: result.items.some((x) => x.status === "blocked"), next_owner: result.nextAction?.owner ?? null });
        } catch { /* keep the previous summary */ }
      }));
    }
  })();
  const facts: FundOnboardingFact[] = [];
  const openTasks = ((tasks ?? []) as any[]).map((t) => ({ offeringId: t.offering_id, owner: t.owner }));
  const { agreementStatusForClients } = await import("@/lib/commercial-agreements.server");
  // Same setup % as Fund Setup and Readiness (blocking tasks + required launch conditions).
  const { fundLaunchPercents } = await import("@/lib/fund-launch-percent.server");
  const [agreements, completion] = await Promise.all([
    agreementStatusForClients(clientIds as string[]).catch(() => new Map()),
    fundLaunchPercents(offerings.map((o) => o.id as string)),
    factsDone,
  ]);
  void supabase;
  for (const row of onbRows) {
    const sm = saved.get(row.id);
    facts.push({ offeringId: row.offering_id, stage: row.stage, closeReady: !!sm?.close_ready, terminal: sm?.terminal ?? null, blocked: !!sm?.blocked, nextOwner: sm?.next_owner ?? null, fundingStatus: row.funding_status ?? null });
  }
  const rows = offerings.map((o) => {
    const mgrs = ((managers ?? []) as any[]).filter((m) => m.offering_id === o.id).map((m) => ({ id: m.user_id as string, name: (name.get(m.user_id) ?? "Unnamed") as string }));
    const s = setup.get(o.id);
    return {
      id: o.id as string,
      name: o.name as string,
      isOpen: !!o.is_open,
      isDemo: !!o.is_demo,
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
  // Demo funds are display-only: listed behind a toggle, never counted.
  return { rows, totals: totals(rows.filter((r) => !r.isDemo)) };
}
