/**
 * My Funds, investor-safe Fund view and Platform Agreements.
 * Every Fund is authorised from the caller's own relationship rows
 * (exact fund_managers rows, own positions/applications) - never email,
 * a broad role or Client membership.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { buildMyFunds, investorFundView, platformAgreementHistory, workspaceCategories } from "@/lib/client-portal-model";

async function relationshipFundIds(context: any) {
  const s = context.supabase;
  const [{ data: fm }, { data: pos }, { data: apps }] = await Promise.all([
    s.from("fund_managers").select("offering_id").eq("user_id", context.userId),
    s.from("investor_positions").select("offering_id").eq("investor_user_id", context.userId),
    s.from("investor_applications").select("offering_id").eq("user_id", context.userId),
  ]);
  const ids = (rows: any) => [...new Set(((rows ?? []) as any[]).map((r) => String(r.offering_id)).filter(Boolean))];
  return { managedFundIds: ids(fm), investorFundIds: [...new Set([...ids(pos), ...ids(apps)])] };
}

export const getMyFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid().optional().nullable() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const facts = await relationshipFundIds(context);
    const all = [...new Set([...facts.managedFundIds, ...facts.investorFundIds])];
    if (!all.length) return { funds: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: allFunds } = await db.from("offerings").select("id, name, fund_type, entity_type, is_open, client_id").in("id", all);
    // The chosen client account filters managed funds only; it is honoured only
    // when the caller really manages a fund there (or is a member of it).
    let funds = allFunds as any[] | null;
    if (data.clientId) {
      const { data: member } = await context.supabase.from("client_users").select("client_id").eq("user_id", context.userId).eq("client_id", data.clientId).maybeSingle();
      const managesThere = ((allFunds ?? []) as any[]).some((f) => f.client_id === data.clientId && facts.managedFundIds.includes(f.id));
      if (member || managesThere) {
        funds = ((allFunds ?? []) as any[]).filter((f) => !facts.managedFundIds.includes(f.id) || f.client_id === data.clientId);
        facts.managedFundIds = facts.managedFundIds.filter((id) => (funds ?? []).some((f) => f.id === id));
      }
    }
    const clientIds = [...new Set(((funds ?? []) as any[]).filter((f) => facts.managedFundIds.includes(f.id)).map((f) => f.client_id).filter(Boolean))];
    const { data: clients } = clientIds.length ? await db.from("clients").select("id, name").in("id", clientIds) : { data: [] };
    const cname = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));
    const outstanding: Record<string, number> = {};
    if (facts.managedFundIds.length) {
      const { data: pending } = await db
        .from("investor_applications")
        .select("offering_id")
        .in("offering_id", facts.managedFundIds)
        .eq("status", "submitted");
      for (const r of (pending ?? []) as any[]) outstanding[r.offering_id] = (outstanding[r.offering_id] ?? 0) + 1;
    }
    const rows = ((funds ?? []) as any[]).map((f) => ({ ...f, client_name: cname.get(f.client_id) ?? null }));
    return { funds: buildMyFunds(facts, rows, outstanding) };
  });

/** Investor presentation of a Fund they invest in. Fund Managers use Fund 360 instead. */
export const getInvestorFundView = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const facts = await relationshipFundIds(context);
    if (!facts.investorFundIds.includes(data.offeringId)) throw new Error("You don't have access to this fund.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: fund }, { data: positions }, { data: apps }] = await Promise.all([
      db.from("offerings").select("id, name, fund_type, entity_type, public_summary, summary").eq("id", data.offeringId).maybeSingle(),
      context.supabase.from("investor_positions").select("id, display_name, status, admitted_on, investment_profile_id").eq("investor_user_id", context.userId).eq("offering_id", data.offeringId),
      context.supabase.from("investor_applications").select("id, status, commitment_cents, submitted_at").eq("user_id", context.userId).eq("offering_id", data.offeringId),
    ]);
    if (!fund) throw new Error("Fund not found.");
    return JSON.parse(JSON.stringify(investorFundView({ fund, myPositions: [...((positions ?? []) as any[]), ...((apps ?? []) as any[]).map((a) => ({ ...a, kind: "application" }))], myDocuments: [] }))) as { fund: { name?: string; typeLabel?: string; public_summary?: string | null; summary?: string | null; [k: string]: any }; myInvestments: any[]; documents: any[]; notices: any[] };
  });

/** Workspace categories from relationships (My Company / My Funds / My Investments). */
export const getWorkspaceCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { gatherFacts } = await import("@/lib/session-facts.server");
    const f: any = await gatherFacts(context);
    const r = f.relationships ?? f;
    return {
      categories: workspaceCategories({
        companyIds: r.companyIds ?? [],
        clientIds: r.clientIds ?? [],
        managedFundIds: r.managedFundIds ?? [],
        investmentCount: r.investmentCount ?? 0,
        investmentProfileIds: r.investmentProfileIds ?? [],
      }),
    };
  });

/** Platform Agreements: every acceptance kept, newest per kind is current. */
export const getPlatformAgreements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("policy_acceptances")
      .select("id, kind, version, accepted_at, signer_name")
      .eq("user_id", context.userId)
      .order("accepted_at", { ascending: false });
    return platformAgreementHistory((data ?? []) as any[]);
  });
