/** Moves a fund from Self Serve to a paid level once Harmonious has confirmed payment, and introduces the account manager. Records only; no money moves. */
import { normalizeServiceLevel, SERVICE_LEVELS } from "@/lib/service-level";
import { UPGRADE_ROLES } from "@/lib/service-level-upgrade-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export async function upgradeServiceLevel(userId: string, d: { fundId: string; level: string; reason: string }) {
  const db = await admin();
  const { data: rr } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (!((rr ?? []) as any[]).some((r) => UPGRADE_ROLES.includes(String(r.role)))) throw new Error("Only Finance, the CEO, CRO or a Super Admin can confirm a paid service level.");
  const level = normalizeServiceLevel(d.level);
  if (level === "self_serve") throw new Error("Choose a paid service level.");
  const { data: o } = await db.from("offerings").select("id, name, client_id, service_level").eq("id", d.fundId).maybeSingle();
  if (!o) throw new Error("Fund not found.");
  const from = normalizeServiceLevel(o.service_level);
  if (from === level) throw new Error("The fund is already on that level.");
  await db.from("offerings").update({ service_level: level }).eq("id", o.id);
  await db.from("fund_service_level_events").insert({ offering_id: o.id, requested_level: level, status: "active", effective_on: new Date().toISOString().slice(0, 10), actor_id: userId });
  await db.from("billing_record_events").insert({ entity_kind: "service_level", entity_id: o.id, client_id: o.client_id, actor_id: userId, event_kind: "upgraded", detail: { from, to: level, reason: d.reason } });
  let emailed = 0;
  if (from === "self_serve") emailed = await introduceAccountManager(db, o, level);
  return { emailed };
}

async function introduceAccountManager(db: any, o: any, level: string) {
  const { data: am } = o.client_id ? await db.from("client_team_assignments").select("user_id").eq("client_id", o.client_id).eq("team_role", "account_manager").limit(1).maybeSingle() : { data: null };
  const { data: amp } = am?.user_id ? await db.from("profiles").select("legal_name, email").eq("user_id", am.user_id).maybeSingle() : { data: null };
  const { data: fms } = await db.from("fund_managers").select("user_id").eq("offering_id", o.id);
  const ids = [...new Set(((fms ?? []) as any[]).map((f) => f.user_id).filter(Boolean))];
  if (!ids.length) return 0;
  const { data: profs } = await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids);
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const origin = process.env["SITE_URL"] || "https://app.harmonious.co";
  let n = 0;
  for (const p of (profs ?? []) as any[]) {
    if (!p.email) continue;
    try {
      await sendTemplateEmail("upgrade-account-manager", p.email, {
        idempotencyKey: `upgrade-am-${o.id}-${level}-${p.user_id}`,
        templateData: { contactName: p.legal_name || undefined, fundName: o.name, levelName: SERVICE_LEVELS.find((l) => l.key === level)?.name, managerName: amp?.legal_name || undefined, managerEmail: amp?.email || undefined, setupUrl: `${origin}/client/funds/${o.id}` },
      });
      n += 1;
    } catch (e) { console.warn("upgrade email failed", e); }
  }
  return n;
}
