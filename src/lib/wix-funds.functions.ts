/** Wix fund/investment staging (read-only copy of Wix "Projects" + "investments"). Staff only. Never creates funds or investors.
 * Staff associations (which Harmonious fund a Wix fund is, which Wix fund an investment belongs to) are append-only rows in wix_staging_associations. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { effectiveWixFundId, latestAssociations, resolveFundMatch, type WixAssociation } from "@/lib/wix-association-model";

const norm = (s: string) => s.toLowerCase().replace(/\b(llc|lp|l\.p\.|inc|fund|a series of.*)\b/g, "").replace(/[^a-z0-9]/g, "");

const mapInv = (i: any) => ({ id: i.wix_id, name: i.entity_name || i.full_name, person: i.full_name, email: i.email, committed: i.committed_cents, received: i.received_cents, details: i.details, importedFundId: i.wix_fund_id as string | null });

export const getWixFundStaging = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("@/lib/investor-onboarding.server")).assertStaff(context.userId);
    const a = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    const [{ data: funds }, { data: invs }, { data: offs }, { data: assocs }] = await Promise.all([
      a.from("wix_fund_staging").select("wix_id, name, details").limit(1000),
      a.from("wix_investment_staging").select("wix_id, wix_fund_id, full_name, entity_name, email, committed_cents, received_cents, details").limit(5000),
      a.from("offerings").select("id, name, legal_entity_name, consolidated_into").is("consolidated_into", null).limit(3000),
      a.from("wix_staging_associations").select("kind, wix_id, offering_id, wix_fund_id, created_at").limit(10000),
    ]);
    const all = (assocs ?? []) as WixAssociation[];
    const fundAssoc = latestAssociations(all, "fund");
    const invAssoc = latestAssociations(all, "investment");
    const offName = new Map<string, string>((offs ?? []).map((o: any) => [o.id, o.name]));
    const byNorm = new Map<string, { id: string; name: string }>();
    for (const o of offs ?? []) for (const n of [o.name, o.legal_entity_name]) if (n && norm(n)) byNorm.set(norm(n), { id: o.id, name: o.name });
    const fundIds = new Set((funds ?? []).map((f: any) => f.wix_id));
    const invByFund = new Map<string, any[]>();
    for (const i of invs ?? []) {
      const eff = effectiveWixFundId(i.wix_fund_id, invAssoc.get(i.wix_id));
      const k = eff && fundIds.has(eff) ? eff : "none";
      invByFund.set(k, [...(invByFund.get(k) ?? []), i]);
    }
    const rows = (funds ?? []).map((f: any) => {
      const list = invByFund.get(f.wix_id) ?? [];
      const nick = f.details?.fundNickname as string | undefined;
      const suggestion = byNorm.get(norm(f.name ?? "")) ?? (nick ? byNorm.get(norm(nick)) : undefined) ?? null;
      const { match, confirmedNone } = resolveFundMatch(suggestion, fundAssoc.get(f.wix_id), (id) => offName.get(id));
      return {
        wixId: f.wix_id, name: f.name || nick || "(untitled)", details: f.details as Record<string, unknown>, match, confirmedNone,
        investments: list.map(mapInv),
        committed: list.reduce((s, i) => s + Number(i.committed_cents), 0), received: list.reduce((s, i) => s + Number(i.received_cents), 0),
      };
    }).sort((x: any, y: any) => y.investments.length - x.investments.length);
    const unassigned = (invByFund.get("none") ?? []).map(mapInv);
    const harmoniousFunds = (offs ?? []).map((o: any) => ({ id: o.id, name: o.name, legal: o.legal_entity_name })).sort((x: any, y: any) => String(x.name).localeCompare(String(y.name)));
    return { rows, totalInvestments: (invs ?? []).length, unlinked: unassigned.length, unassigned, harmoniousFunds };
  });

/** Records which Harmonious fund a Wix fund is (or that it isn't in Harmonious yet). Append-only; latest wins. */
export const linkWixFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ wixFundId: z.string().min(1), offeringId: z.string().uuid().nullable(), note: z.string().max(500).optional() }))
  .handler(async ({ context, data }) => {
    await (await import("@/lib/investor-onboarding.server")).assertStaff(context.userId);
    const a = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    const { data: f } = await a.from("wix_fund_staging").select("wix_id").eq("wix_id", data.wixFundId).maybeSingle();
    if (!f) throw new Error("Wix fund not found");
    if (data.offeringId) {
      const { data: o } = await a.from("offerings").select("id").eq("id", data.offeringId).is("consolidated_into", null).maybeSingle();
      if (!o) throw new Error("Harmonious fund not found");
    }
    const { error } = await a.from("wix_staging_associations").insert({ kind: "fund", wix_id: data.wixFundId, offering_id: data.offeringId, note: data.note ?? null, actor_id: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Assigns Wix investments to a Wix fund (or clears the assignment). Append-only; never creates investors. */
export const assignWixInvestments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ investmentIds: z.array(z.string().min(1)).min(1).max(500), wixFundId: z.string().min(1).nullable(), note: z.string().max(500).optional() }))
  .handler(async ({ context, data }) => {
    await (await import("@/lib/investor-onboarding.server")).assertStaff(context.userId);
    const a = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    if (data.wixFundId) {
      const { data: f } = await a.from("wix_fund_staging").select("wix_id").eq("wix_id", data.wixFundId).maybeSingle();
      if (!f) throw new Error("Wix fund not found");
    }
    const { data: found } = await a.from("wix_investment_staging").select("wix_id").in("wix_id", data.investmentIds);
    if ((found ?? []).length !== data.investmentIds.length) throw new Error("Some investments weren't found");
    const { error } = await a.from("wix_staging_associations").insert(data.investmentIds.map((id) => ({ kind: "investment", wix_id: id, wix_fund_id: data.wixFundId, note: data.note ?? null, actor_id: context.userId })));
    if (error) throw new Error(error.message);
    return { ok: true, count: data.investmentIds.length };
  });
