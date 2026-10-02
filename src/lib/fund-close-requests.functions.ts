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
      .select("id, target_date, notes, onboarding_ids, status, staff_note, created_at, updated_at, details")
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
    details: z.object({
      assetMode: z.enum(["existing", "new"]),
      existingAsset: z.string().max(200).default(""),
      asset: z.object({ name: z.string().max(200), issuer: z.string().max(200), type: z.string().max(100), amountCents: z.number().int().min(0).max(1e13).nullable(), notes: z.string().max(2000) }),
      purchaseAgreement: z.object({ fileName: z.string().max(200), contentType: z.string().max(120), base64: z.string().max(28_000_000) }).nullable(),
      managementFeePct: z.number().min(0).max(100).nullable(),
      managementFeeCents: z.number().int().min(0).max(1e13).nullable(),
      feeConfirmed: z.boolean(),
      wire: z.object({ method: z.enum(["wire", "ach"]), beneficiary: z.string().max(200), bankName: z.string().max(200), routingLast4: z.string().max(4), accountLast4: z.string().max(4), reference: z.string().max(200), amountCents: z.number().int().min(0).max(1e13).nullable() }),
      investorStates: z.array(z.string().max(40)).max(60),
      legalFeesCents: z.number().int().min(0).max(1e13).nullable(),
      legalFeesDetail: z.string().max(1000),
      brokerDealerFeesCents: z.number().int().min(0).max(1e13).nullable(),
      brokerDealerDetail: z.string().max(1000),
    }).optional(),
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
    if (data.details) {
      const det = data.details;
      let paPath: string | null = null;
      if (det.purchaseAgreement) {
        const bytes = Buffer.from(det.purchaseAgreement.base64, "base64");
        if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("The purchase agreement must be 20 MB or smaller.");
        paPath = `close-requests/${data.fundId}/${row.id}/${det.purchaseAgreement.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
        const { error: upErr } = await db.storage.from("manager-uploads").upload(paPath, bytes, { contentType: det.purchaseAgreement.contentType || "application/pdf", upsert: false });
        if (upErr) paPath = null;
      }
      if (det.assetMode === "new" && det.asset.name.trim()) {
        await db.from("fund_proposed_assets").insert({
          offering_id: data.fundId, close_request_id: row.id, asset_name: det.asset.name.trim(), issuer_name: det.asset.issuer || null,
          asset_type: det.asset.type || null, amount_cents: det.asset.amountCents, purchase_agreement_path: paPath,
          purchase_agreement_name: det.purchaseAgreement?.fileName ?? null, details: { notes: det.asset.notes }, created_by: uid,
        });
      }
      // Only the last four digits of bank numbers are kept here; full instructions are verified by Harmonious.
      const { purchaseAgreement: _pa, ...rest } = det;
      await db.from("fund_close_requests").update({
        details: { ...rest, purchaseAgreementPath: paPath, purchaseAgreementName: det.purchaseAgreement?.fileName ?? null, formDFeeCents: 16000, feesAreEstimate: true },
      }).eq("id", row.id);
    }
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
      .select("id, offering_id, target_date, notes, onboarding_ids, status, staff_note, created_at, details, offerings(name)")
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
