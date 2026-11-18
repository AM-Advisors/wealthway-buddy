/** Server-only: per-client tab switches. Staff change them; clients only read their own. */
import { CLIENT_TABS, hiddenTabs, tabEnabled, type ClientTabKey } from "@/lib/client-tab-access";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function purchasedKeys(d: any, clientId: string): Promise<string[] | null> {
  const { data: c } = await d.from("clients").select("menu_gating").eq("id", clientId).maybeSingle();
  if (c?.menu_gating !== "entitlements") return null;
  const { data: ents } = await d.from("service_entitlements").select("service_key").eq("client_id", clientId).eq("status", "included");
  const { menuKeysFromServices } = await import("@/lib/saas-order-model");
  const keys = ((ents ?? []) as any[]).map((e) => String(e.service_key));
  const out = menuKeysFromServices(keys);
  if (keys.some((k) => k.startsWith("wealth") || k.startsWith("portfolio") || k.startsWith("report_card"))) out.push("wealth");
  if (keys.includes("report_cards")) out.push("report_cards");
  return out;
}

async function overrides(d: any, clientId: string): Promise<Record<string, boolean>> {
  const { data } = await d.from("client_tab_access").select("tab_key, enabled").eq("client_id", clientId);
  return Object.fromEntries(((data ?? []) as any[]).map((r) => [r.tab_key, Boolean(r.enabled)]));
}

/** Tabs hidden for the signed-in person's client (none when they aren't a client member). */
export async function myHiddenTabs(uid: string): Promise<ClientTabKey[]> {
  const d = await db();
  const { data: link } = await d.from("client_users").select("client_id").eq("user_id", uid).is("revoked_at", null).limit(1).maybeSingle();
  if (!link) return [];
  return hiddenTabs(await overrides(d, link.client_id), await purchasedKeys(d, link.client_id));
}

/** Throws when the signed-in person's client has this tab switched off. */
export async function assertTabOpen(uid: string, key: ClientTabKey) {
  if ((await myHiddenTabs(uid)).includes(key)) throw new Error("This area isn't part of your Harmonious services.");
}

async function assertStaff(uid: string) {
  const { isStaff } = await import("@/lib/fund-tabs.server");
  if (!(await isStaff(uid))) throw new Error("Only Harmonious staff can change client access.");
}

export async function staffTabAccess(uid: string, clientId: string) {
  await assertStaff(uid);
  const d = await db();
  const [ov, purchased, { data: events }] = await Promise.all([
    overrides(d, clientId), purchasedKeys(d, clientId),
    d.from("client_tab_access_events").select("tab_key, enabled, actor_id, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
  ]);
  const actorIds = [...new Set(((events ?? []) as any[]).map((e) => e.actor_id).filter(Boolean))];
  const { data: people } = actorIds.length ? await d.from("profiles").select("user_id, legal_name, email").in("user_id", actorIds) : { data: [] };
  const nameOf = (id: string) => { const p = ((people ?? []) as any[]).find((x) => x.user_id === id); return p?.legal_name || p?.email || "Staff"; };
  return {
    tabs: CLIENT_TABS.map((t) => ({ key: t.key, label: t.label, enabled: tabEnabled(t.key, ov, purchased), overridden: t.key in ov, defaultEnabled: tabEnabled(t.key, {}, purchased) })),
    events: ((events ?? []) as any[]).map((e) => ({ ...e, actor: e.actor_id ? nameOf(e.actor_id) : "Staff", label: CLIENT_TABS.find((t) => t.key === e.tab_key)?.label ?? e.tab_key })),
  };
}

export async function setTabAccess(uid: string, clientId: string, key: ClientTabKey, enabled: boolean) {
  await assertStaff(uid);
  if (!CLIENT_TABS.some((t) => t.key === key)) throw new Error("Unknown area.");
  const d = await db();
  const now = new Date().toISOString();
  const { error } = await d.from("client_tab_access").upsert({ client_id: clientId, tab_key: key, enabled, updated_by: uid, updated_at: now });
  if (error) throw new Error("The change could not be saved. Please try again.");
  await d.from("client_tab_access_events").insert({ client_id: clientId, tab_key: key, enabled, actor_id: uid });
  return { ok: true };
}
