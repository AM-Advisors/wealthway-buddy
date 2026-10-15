/** Wix fund/investment staging (read-only copy of Wix "Projects" + "investments"). Staff only. Never creates funds or investors. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/require-auth";

const norm = (s: string) => s.toLowerCase().replace(/\b(llc|lp|l\.p\.|inc|fund|a series of.*)\b/g, "").replace(/[^a-z0-9]/g, "");

export const getWixFundStaging = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("@/lib/investor-onboarding.server")).assertStaff(context.userId);
    const a = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    const [{ data: funds }, { data: invs }, { data: offs }] = await Promise.all([
      a.from("wix_fund_staging").select("wix_id, name, details").limit(1000),
      a.from("wix_investment_staging").select("wix_id, wix_fund_id, full_name, entity_name, email, committed_cents, received_cents, details").limit(5000),
      a.from("offerings").select("id, name, legal_entity_name, consolidated_into").is("consolidated_into", null).limit(3000),
    ]);
    const byNorm = new Map<string, { id: string; name: string }>();
    for (const o of offs ?? []) for (const n of [o.name, o.legal_entity_name]) if (n && norm(n)) byNorm.set(norm(n), { id: o.id, name: o.name });
    const invByFund = new Map<string, any[]>();
    for (const i of invs ?? []) { const k = i.wix_fund_id ?? "none"; invByFund.set(k, [...(invByFund.get(k) ?? []), i]); }
    const rows = (funds ?? []).map((f: any) => {
      const list = invByFund.get(f.wix_id) ?? [];
      const nick = f.details?.fundNickname as string | undefined;
      const match = byNorm.get(norm(f.name)) ?? (nick ? byNorm.get(norm(nick)) : undefined) ?? null;
      return {
        wixId: f.wix_id, name: f.name || nick || "(untitled)", details: f.details as Record<string, unknown>, match,
        investments: list.map((i) => ({ id: i.wix_id, name: i.entity_name || i.full_name, person: i.full_name, email: i.email, committed: i.committed_cents, received: i.received_cents, details: i.details })),
        committed: list.reduce((s, i) => s + Number(i.committed_cents), 0), received: list.reduce((s, i) => s + Number(i.received_cents), 0),
      };
    }).sort((x: any, y: any) => y.investments.length - x.investments.length);
    const unlinked = (invByFund.get("none")?.length ?? 0) + (invs ?? []).filter((i: any) => i.wix_fund_id && !(funds ?? []).some((f: any) => f.wix_id === i.wix_fund_id)).length;
    return { rows, totalInvestments: (invs ?? []).length, unlinked };
  });
