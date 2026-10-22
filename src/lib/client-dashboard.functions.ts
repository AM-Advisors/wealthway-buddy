import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

const STAFF_ROLES = ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"];
const CLASS_GROUPS: Record<string, string> = { common: "Common", preferred: "Preferred", safe: "SAFE", note: "SAFE", warrant: "Warrants", option: "Option Pool", rsu: "Option Pool" };

/** Read-only cap table dashboard for a client: totals, ownership mix, activity, stakeholder KYC. */
export const getClientCapDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const uid = context.userId;
    const { data: roles } = await db.from("user_roles").select("role").eq("user_id", uid);
    let allowed = ((roles ?? []) as any[]).some((r) => STAFF_ROLES.includes(r.role));
    if (!allowed) {
      const { data: cu } = await db.from("client_users").select("id").eq("user_id", uid).eq("client_id", data.clientId).maybeSingle();
      allowed = !!cu;
    }
    if (!allowed) {
      const { data: fm } = await db.from("fund_managers").select("id, offerings!inner(client_id)").eq("user_id", uid).eq("offerings.client_id", data.clientId).limit(1).maybeSingle();
      allowed = !!fm;
    }
    if (!allowed) throw new Error("You don't have access to this company.");

    const { data: cos } = await db.from("ct_companies").select("id, name").eq("client_id", data.clientId);
    const companyIds = ((cos ?? []) as any[]).map((c) => c.id);
    const empty = { totals: { pendingKyc: 0, activeCapTables: 0, pendingOnboarding: 0, pendingReview: 0 }, ownership: [], activity: [], compliance: [] };
    if (!companyIds.length) return empty;

    const [{ data: holders }, { data: secs }, { data: events }, { data: subs }] = await Promise.all([
      db.from("ct_stakeholders").select("id, company_id, user_id, name, updated_at").in("company_id", companyIds),
      db.from("ct_securities").select("company_id, stakeholder_id, security_type, quantity, principal, verification_status, status, updated_at").in("company_id", companyIds),
      db.from("ct_events").select("id, actor_id, action, occurred_at").in("company_id", companyIds).order("occurred_at", { ascending: false }).limit(15),
      db.from("cap_table_subscriptions").select("company_id, status").eq("client_id", data.clientId),
    ]);
    const securities = (secs ?? []) as any[];
    const stake = (holders ?? []) as any[];

    const pendingBy = new Map<string, boolean>();
    const lastBy = new Map<string, string>();
    for (const s of securities) {
      if (!s.stakeholder_id) continue;
      if (s.verification_status !== "verified") pendingBy.set(s.stakeholder_id, true);
      else if (!pendingBy.has(s.stakeholder_id)) pendingBy.set(s.stakeholder_id, false);
      if (!lastBy.has(s.stakeholder_id) || s.updated_at > lastBy.get(s.stakeholder_id)!) lastBy.set(s.stakeholder_id, s.updated_at);
    }
    const compliance = stake.map((h) => ({
      id: h.id, name: h.name,
      kyc: pendingBy.get(h.id) === false ? "Approved" : "Pending",
      updatedAt: [h.updated_at, lastBy.get(h.id)].filter(Boolean).sort().pop() ?? null,
    })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

    const ownershipMap = new Map<string, number>();
    for (const s of securities) {
      const label = CLASS_GROUPS[s.security_type];
      if (!label || s.status === "cancelled") continue;
      const amt = Number(s.quantity ?? 0) || Number(s.principal ?? 0);
      ownershipMap.set(label, (ownershipMap.get(label) ?? 0) + amt);
    }
    const ownership = ["Common", "Preferred", "SAFE", "Warrants", "Option Pool"].map((name) => ({ name, value: ownershipMap.get(name) ?? 0 }));

    const actorIds = [...new Set(((events ?? []) as any[]).map((e) => e.actor_id).filter(Boolean))];
    const { data: profs } = actorIds.length ? await db.from("profiles").select("id, legal_name, email").in("id", actorIds) : { data: [] };
    const nameOf = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.legal_name || p.email || "Someone"]));
    const pretty = (a: string) => a.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const activity = ((events ?? []) as any[]).map((e) => ({ id: e.id, title: pretty(e.action), actor: nameOf.get(e.actor_id) ?? "Harmonious", at: e.occurred_at }));

    const activeSubs = ((subs ?? []) as any[]).filter((s) => ["active", "trialing"].includes(s.status)).length;
    const reviewCompanies = new Set(securities.filter((s) => s.verification_status !== "verified").map((s) => s.company_id));
    return {
      totals: {
        pendingKyc: compliance.filter((c) => c.kyc === "Pending").length,
        activeCapTables: Math.max(activeSubs, companyIds.length),
        pendingOnboarding: stake.filter((h) => !h.user_id).length,
        pendingReview: reviewCompanies.size,
      },
      ownership, activity, compliance: compliance.slice(0, 50),
    };
  });
