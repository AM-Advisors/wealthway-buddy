/** Server-only: which optional services the signed-in person has, for menu display only. */
import { resolveServiceMenu, type ServiceMenu } from "@/lib/service-menu";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const exists = (r: { count: number | null; error: unknown }) => !r.error && (r.count ?? 0) > 0;

export async function myServiceMenu(uid: string): Promise<ServiceMenu> {
  const { isStaff } = await import("@/lib/fund-tabs.server");
  if (await isStaff(uid)) return { wealth: true, reportCards: true };
  const d = await db();
  const head = { count: "exact", head: true } as const;
  const [sel, obs, recs, reports, conns, cards, cu] = await Promise.all([
    d.from("wealth_service_selections").select("offering_id, services, created_at").eq("owner_user_id", uid),
    d.from("personal_wealth_observations").select("id", head).eq("owner_user_id", uid),
    d.from("wealth_portfolio_records").select("id", head).eq("owner_user_id", uid),
    d.from("wealth_report_versions").select("id", head).eq("owner_user_id", uid),
    d.from("personal_account_connections").select("id", head).eq("owner_user_id", uid),
    d.from("report_card_versions").select("id", head).eq("kind", "investor").eq("author_id", uid),
    d.from("client_users").select("client_id").eq("user_id", uid).is("revoked_at", null),
  ]);
  const clientIds = [...new Set(((cu.data ?? []) as any[]).map((r) => r.client_id).filter(Boolean))] as string[];
  const [ents, ov] = clientIds.length
    ? await Promise.all([
        d.from("service_entitlements").select("service_key").in("client_id", clientIds).eq("status", "included"),
        d.from("client_tab_access").select("tab_key, enabled").in("client_id", clientIds).in("tab_key", ["wealth", "report_cards"]),
      ])
    : [{ data: [] }, { data: [] }];
  let coverage = false;
  try {
    const { myReportCardCoverage } = await import("@/lib/report-card-coverage.server");
    const c = await myReportCardCoverage(d, uid);
    coverage = c.funds.some((f) => f.via) || c.clients.some((x) => x.via);
  } catch { coverage = false; }
  const overrides: { wealth?: boolean; report_cards?: boolean } = {};
  for (const r of (ov.data ?? []) as any[]) if (r.enabled) overrides[r.tab_key as "wealth" | "report_cards"] = true;
  return resolveServiceMenu({
    staff: false,
    selections: (sel.data ?? []) as any[],
    hasWealthRecords: exists(obs) || exists(recs) || exists(reports) || exists(conns),
    hasInvestorCards: exists(cards),
    clientServiceKeys: ((ents.data ?? []) as any[]).map((e) => String(e.service_key)),
    reportCardsCoverage: coverage,
    overrides,
  });
}
