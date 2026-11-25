import { resolvePerspective } from "./view-as.server";
import { hiddenTabs } from "./client-tab-access";
import { menuKeysFromServices } from "./saas-order-model";
import { resolveServiceMenu } from "./service-menu";
import type { ClientPerspectiveMenu } from "./client-perspective-menu";

/** Only a live, server-validated perspective can select whose menu is read. No writes or access grants. */
export async function clientPerspectiveMenu(staffUserId: string, sessionId: string | null, environment: "sandbox" | "live"): Promise<ClientPerspectiveMenu | null> {
  const p = await resolvePerspective(staffUserId, sessionId);
  if (!p) return null;
  if (p.perspective === "investor") {
    const [{ myEntitlements }, { myHiddenTabs }, { myServiceMenu }] = await Promise.all([
      import("./saas-orders.server"), import("./client-tab-access.server"), import("./service-menu.server"),
    ]);
    const [entitlements, hidden, services] = await Promise.all([
      myEntitlements(p.subjectUserId), myHiddenTabs(p.subjectUserId), myServiceMenu(p.subjectUserId),
    ]);
    return { perspective: p.perspective, offeringId: p.offeringId, entitlements, hiddenTabs: hidden, services, hasCapTable: false };
  }
  // Manager previews, including those without a manager login, use this fund's exact client.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = supabaseAdmin as any;
  const checked = (r: any) => { if (r.error) throw new Error("The client menu could not be loaded."); return r.data; };
  const fund = checked(await d.from("offerings").select("client_id").eq("id", p.offeringId).maybeSingle());
  const clientId = fund?.client_id;
  const [client, ents, switches, caps, selections, coverage] = await Promise.all([
    clientId ? d.from("clients").select("menu_gating").eq("id", clientId).maybeSingle() : { data: null },
    clientId ? d.from("service_entitlements").select("service_key, offering_id").eq("client_id", clientId).eq("status", "included") : { data: [] },
    clientId ? d.from("client_tab_access").select("tab_key, enabled").eq("client_id", clientId) : { data: [] },
    clientId ? d.from("cap_table_subscriptions").select("status,current_period_end").eq("client_id", clientId).eq("environment", environment) : { data: [] },
    d.from("wealth_service_selections").select("offering_id,services,created_at").eq("offering_id", p.offeringId),
    (await import("./report-card-coverage.server")).subjectCoverage(d, { type: "fund", id: p.offeringId ?? "" }),
  ]);
  const keys = (checked(ents) ?? []).filter((r: any) => !r.offering_id || r.offering_id === p.offeringId).map((r: any) => String(r.service_key)) as string[];
  const purchased = menuKeysFromServices(keys);
  // Same purchased-tab defaults as client-tab-access.server, including optional services.
  if (keys.some((k) => k.startsWith("wealth") || k.startsWith("portfolio") || k.startsWith("report_card"))) purchased.push("wealth");
  if (keys.includes("report_cards")) purchased.push("report_cards");
  // Matches the canonical manager menu: their fund remains discoverable, not newly authorized.
  if (!purchased.includes("fund_platform")) purchased.push("fund_platform");
  const entitlements = checked(client)?.menu_gating === "entitlements" ? purchased : null;
  const overrides = Object.fromEntries((checked(switches) ?? []).map((r: any) => [r.tab_key, Boolean(r.enabled)]));
  const services = resolveServiceMenu({
    staff: false, selections: checked(selections) ?? [], hasWealthRecords: false, hasInvestorCards: false,
    clientServiceKeys: keys, reportCardsCoverage: Boolean(coverage.via),
    overrides: { wealth: overrides['wealth'] === true, report_cards: overrides['report_cards'] === true },
  });
  const hasCapTable = keys.some((k) => k === "cap_table" || k.startsWith("cap_table_")) || (checked(caps) ?? []).some((s: any) => s.status === "active" || s.status === "past_due" || (s.status === "cancelled" && s.current_period_end && new Date(s.current_period_end).getTime() > Date.now()));
  return { perspective: p.perspective, offeringId: p.offeringId, entitlements, hiddenTabs: hiddenTabs(overrides, entitlements), services, hasCapTable };
}