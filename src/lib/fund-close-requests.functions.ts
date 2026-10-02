import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isClientMemberOfFund } from "@/lib/fund-cap-table.functions";

const STAFF_ROLES = ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"];

async function isStaff(db: any, uid: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", uid);
  return ((data ?? []) as any[]).some((r) => STAFF_ROLES.includes(r.role));
}

async function canViewFund(db: any, uid: string, fundId: string) {
  if (await isStaff(db, uid)) return true;
  const { data: mgr } = await db.from("fund_managers").select("id").eq("user_id", uid).eq("offering_id", fundId).maybeSingle();
  if (mgr) return true;
  return isClientMemberOfFund(db, uid, fundId);
}

const fundInput = (d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d);

/** Read-only, informational tabs: Banking, Taxes, Assets. Nothing here needs approval. */
export const getFundTabsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fundInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!(await canViewFund(db, context.userId, data.fundId))) throw new Error("You don't have access to this Fund.");
    const [{ data: banks }, { data: taxDocs }, { data: assets }, { data: vals }] = await Promise.all([
      db.from("bank_accounts").select("id, institution_name, account_name, account_mask, status, last_synced_at").eq("offering_id", data.fundId),
      db.from("fund_tax_documents").select("id, doc_type, tax_year, file_name, review_status, created_at").eq("offering_id", data.fundId).is("investor_user_id", null).order("tax_year", { ascending: false }),
      db.from("portfolio_assets").select("id, issuer_name, asset_name, asset_class, instrument, acquisition_date, cost_basis_cents, status").eq("offering_id", data.fundId).order("acquisition_date", { ascending: false }),
      db.from("asset_valuations").select("asset_name, value_cents, valuation_date, status").eq("offering_id", data.fundId).eq("status", "approved").order("valuation_date", { ascending: false }),
    ]);
    const latest: Record<string, { value_cents: number; valuation_date: string }> = {};
    for (const v of (vals ?? []) as any[]) if (!latest[v.asset_name]) latest[v.asset_name] = v;
    return {
      banks: ((banks ?? []) as any[]).map((b) => ({
        id: b.id, institution: b.institution_name, name: b.account_name,
        mask: b.account_mask ? `••••${String(b.account_mask).slice(-4)}` : null, status: b.status, lastSynced: b.last_synced_at,
      })),
      taxDocs: (taxDocs ?? []) as any[],
      assets: ((assets ?? []) as any[]).map((a) => ({
        ...a, latestValueCents: latest[a.asset_name]?.value_cents ?? null, latestValueDate: latest[a.asset_name]?.valuation_date ?? null,
      })),
    };
  });

/** Investors who could be in a close, with readiness from open readiness tasks. */
export const getCloseCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fundInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!(await canViewFund(db, context.userId, data.fundId))) throw new Error("You don't have access to this Fund.");
    const [{ data: obs }, { data: tasks }] = await Promise.all([
      db.from("investor_onboardings")
        .select("id, stage, commitment_amount_cents, accepted_amount_cents, requested_amount_cents, removed_at, persons(legal_first_name, legal_last_name, preferred_name), investment_profiles(legal_name)")
        .eq("offering_id", data.fundId).is("removed_at", null),
      db.from("investment_readiness_tasks").select("onboarding_id, title").eq("offering_id", data.fundId).is("resolved_at", null),
    ]);
    const open: Record<string, string[]> = {};
    for (const t of (tasks ?? []) as any[]) (open[t.onboarding_id] ??= []).push(t.title);
    return ((obs ?? []) as any[]).map((o) => {
      const p = o.persons;
      const name = p ? p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") : "";
      return {
        id: o.id as string,
        name: name || "Unnamed investor",
        profileName: o.investment_profiles?.legal_name ?? null,
        amountCents: o.commitment_amount_cents ?? o.accepted_amount_cents ?? o.requested_amount_cents ?? null,
        openItems: open[o.id] ?? [],
      };
    });
  });

export const listFundCloseRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fundInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!(await canViewFund(db, context.userId, data.fundId))) throw new Error("You don't have access to this Fund.");
    const { data: rows } = await db.from("fund_close_requests")
      .select("id, target_date, notes, onboarding_ids, status, staff_note, created_at, updated_at")
      .eq("offering_id", data.fundId).order("created_at", { ascending: false });
    return (rows ?? []) as any[];
  });

export const createFundCloseRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    fundId: z.string().uuid(),
    onboardingIds: z.array(z.string().uuid()).min(1, "Pick at least one investor.").max(500),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    notes: z.string().max(2000).optional().default(""),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const uid = context.userId;
    if (!(await canViewFund(db, uid, data.fundId))) throw new Error("You don't have access to this Fund.");
    const { data: obs } = await db.from("investor_onboardings").select("id").eq("offering_id", data.fundId).is("removed_at", null).in("id", data.onboardingIds);
    if ((obs ?? []).length !== new Set(data.onboardingIds).size) throw new Error("Some selected investors aren't in this fund.");
    const { data: off } = await db.from("offerings").select("client_id").eq("id", data.fundId).maybeSingle();
    const { data: row, error } = await db.from("fund_close_requests").insert({
      offering_id: data.fundId, client_id: off?.client_id ?? null, requested_by: uid,
      target_date: data.targetDate, notes: data.notes.trim() || null, onboarding_ids: [...new Set(data.onboardingIds)],
    }).select("id").single();
    if (error) throw new Error("Couldn't submit the close request.");
    await db.from("fund_close_request_events").insert({ close_request_id: row.id, actor_id: uid, from_status: null, to_status: "submitted" });
    return { id: row.id as string };
  });

/** Operations queue (staff only). */
export const listAllCloseRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!(await isStaff(db, context.userId))) throw new Error("Harmonious staff only.");
    const { data: rows } = await db.from("fund_close_requests")
      .select("id, offering_id, target_date, notes, onboarding_ids, status, staff_note, created_at, offerings(name)")
      .order("created_at", { ascending: false }).limit(500);
    return (rows ?? []) as any[];
  });

export const updateFundCloseRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(["in_review", "completed", "returned"]),
    note: z.string().max(1000).optional().default(""),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!(await isStaff(db, context.userId))) throw new Error("Harmonious staff only.");
    if (data.status === "returned" && data.note.trim().length < 3) throw new Error("Add a note explaining why it's returned.");
    const { data: cur } = await db.from("fund_close_requests").select("status").eq("id", data.id).maybeSingle();
    if (!cur) throw new Error("Close request not found.");
    if (cur.status === "completed") throw new Error("Completed close requests can't be changed.");
    const note = data.note.trim() || null;
    await db.from("fund_close_requests").update({ status: data.status, staff_note: note ?? undefined, updated_at: new Date().toISOString() }).eq("id", data.id);
    await db.from("fund_close_request_events").insert({ close_request_id: data.id, actor_id: context.userId, from_status: cur.status, to_status: data.status, note });
    return { ok: true };
  });
