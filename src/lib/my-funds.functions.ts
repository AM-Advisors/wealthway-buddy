/**
 * My Funds, investor-safe Fund view and Platform Agreements.
 * Every Fund is authorized from the caller's own relationship rows
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

/**
 * Investor portal for one fund: own subscription(s), documents released to own
 * investment profiles, own uploads, and approved tax forms. Read-only; scoped to
 * the caller's own rows. Tax numbers and bank details are never returned.
 */
export const getInvestorFundPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [facts, { data: onbs }] = await Promise.all([
      relationshipFundIds(context),
      db.from("investor_onboardings").select("id, stage, requested_amount_cents, commitment_amount_cents, funded_amount_cents, investment_profile_id, created_at, updated_at").eq("investor_user_id", uid).eq("offering_id", data.offeringId).is("removed_at", null),
    ]);
    const subs = (onbs ?? []) as any[];
    if (!facts.investorFundIds.includes(data.offeringId) && subs.length === 0) throw new Error("You don't have access to this fund.");
    const { data: profs } = await db.from("investment_profiles").select("id, display_label, legal_name").eq("owner_user_id", uid);
    const profiles = (profs ?? []) as any[];
    const profileIds = [...new Set([...profiles.map((p) => p.id), ...subs.map((s) => s.investment_profile_id).filter(Boolean)])];
    const profileName = new Map(profiles.map((p) => [p.id, (p.display_label ?? p.legal_name ?? null) as string | null]));

    const [{ data: fund }, { data: ents }, { data: uploads }, { data: tax }] = await Promise.all([
      db.from("offerings").select("id, name, legal_entity_name, fund_type, entity_type, public_summary, summary, min_investment_cents, target_raise_cents").eq("id", data.offeringId).maybeSingle(),
      profileIds.length ? db.from("document_entitlements").select("document_id").eq("principal_type", "investment_profile").eq("action", "grant").in("principal_id", profileIds) : Promise.resolve({ data: [] }),
      db.from("investor_documents").select("id, file_name, doc_kind, uploaded_at, review_status").eq("user_id", uid).eq("offering_id", data.offeringId).order("uploaded_at", { ascending: false }),
      db.from("fund_tax_documents").select("id, file_name, doc_type, tax_year, created_at").eq("investor_user_id", uid).eq("offering_id", data.offeringId).eq("review_status", "approved"),
    ]);
    if (!fund) throw new Error("Fund not found.");
    const docIds = ((ents ?? []) as any[]).map((e) => e.document_id);
    const { data: cat } = docIds.length
      ? await db.from("document_catalog").select("id, file_name, document_type, tax_year, published_at").in("id", docIds).eq("offering_id", data.offeringId).eq("status", "published").order("published_at", { ascending: false })
      : { data: [] };
    const catalog = (cat ?? []) as any[];

    return {
      fund: { name: fund.name as string, legalName: (fund.legal_entity_name ?? null) as string | null, fundType: (fund.fund_type ?? null) as string | null, entityType: (fund.entity_type ?? null) as string | null, summary: (fund.public_summary ?? fund.summary ?? null) as string | null, minInvestmentCents: (fund.min_investment_cents ?? null) as number | null },
      subscriptions: subs.map((s) => ({ id: s.id as string, stage: (s.stage ?? null) as string | null, commitmentCents: (s.commitment_amount_cents ?? s.requested_amount_cents ?? null) as number | null, fundedCents: (s.funded_amount_cents ?? null) as number | null, profile: (profileName.get(s.investment_profile_id) ?? null) as string | null, startedAt: s.created_at as string, updatedAt: (s.updated_at ?? null) as string | null })),
      documents: [
        ...catalog.filter((c) => c.document_type !== "k1").map((c) => ({ id: c.id as string, name: c.file_name as string, kind: String(c.document_type ?? "document"), date: (c.published_at ?? null) as string | null, source: "fund" as const, status: null as string | null })),
        ...((uploads ?? []) as any[]).map((u) => ({ id: u.id as string, name: u.file_name as string, kind: String(u.doc_kind ?? "upload"), date: (u.uploaded_at ?? null) as string | null, source: "you" as const, status: (u.review_status ?? null) as string | null })),
      ],
      tax: [
        ...catalog.filter((c) => c.document_type === "k1").map((c) => ({ id: c.id as string, name: c.file_name as string, form: "Schedule K-1", year: (c.tax_year ?? null) as number | null, date: (c.published_at ?? null) as string | null })),
        ...((tax ?? []) as any[]).map((t) => ({ id: t.id as string, name: t.file_name as string, form: String(t.doc_type ?? "Tax form"), year: (t.tax_year ?? null) as number | null, date: (t.created_at ?? null) as string | null })),
      ],
    };
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
