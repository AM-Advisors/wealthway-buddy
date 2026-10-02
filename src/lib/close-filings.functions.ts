import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Close approval and filing packets. Harmonious staff only. Nothing here
 * submits a filing or pays a fee: staff file on EDGAR / the state system
 * themselves and record the confirmation. Maker-checker: the submitter
 * can't approve, and the preparer can't record a filing.
 */

const STAFF_ROLES = ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"];
const FORM_D_HARMONIOUS_FEE_CENTS = 16000;

async function staffDb(uid: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data } = await db.from("user_roles").select("role").eq("user_id", uid);
  if (!((data ?? []) as any[]).some((r) => STAFF_ROLES.includes(r.role))) throw new Error("Harmonious staff only.");
  return db;
}

export const approveFundCloseRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), note: z.string().max(1000).optional().default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context.userId);
    const { data: cur } = await db.from("fund_close_requests").select("status, requested_by").eq("id", data.id).maybeSingle();
    if (!cur) throw new Error("Close request not found.");
    if (cur.status !== "in_review") throw new Error("Start the review before approving.");
    if (cur.requested_by === context.userId) throw new Error("The person who submitted this close can't approve it.");
    const now = new Date().toISOString();
    const note = data.note.trim() || null;
    const { data: upd } = await db.from("fund_close_requests")
      .update({ status: "approved", approved_by: context.userId, approved_at: now, staff_note: note ?? undefined, updated_at: now })
      .eq("id", data.id).eq("status", "in_review").select("id");
    if (!upd?.length) throw new Error("This close request changed. Refresh and try again.");
    await db.from("fund_close_request_events").insert({ close_request_id: data.id, actor_id: context.userId, from_status: "in_review", to_status: "approved", note });
    return { ok: true };
  });

export const generateCloseFilings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context.userId);
    const { data: req } = await db.from("fund_close_requests").select("id, status, offering_id, onboarding_ids, target_date, details").eq("id", data.id).maybeSingle();
    if (!req) throw new Error("Close request not found.");
    if (req.status !== "approved") throw new Error("Approve the close before generating filings.");
    const { data: off } = await db.from("offerings").select("name, legal_entity_name, reg_type, entity_type, min_investment_cents").eq("id", req.offering_id).maybeSingle();
    const ids: string[] = req.onboarding_ids?.length ? req.onboarding_ids : ["00000000-0000-0000-0000-000000000000"];
    const { data: onbs } = await db.from("investor_onboardings")
      .select("id, accepted_amount_cents, commitment_amount_cents, persons(region), investment_profiles(legal_name, profile_type)")
      .in("id", ids).eq("offering_id", req.offering_id);
    const investors = ((onbs ?? []) as any[]).map((o) => ({
      state: String(o.persons?.region ?? "").trim().toUpperCase() || "UNKNOWN",
      amount: Number(o.accepted_amount_cents ?? o.commitment_amount_cents ?? 0),
      name: o.investment_profiles?.legal_name ?? null,
      type: o.investment_profiles?.profile_type ?? null,
    }));
    const total = investors.reduce((a, i) => a + i.amount, 0);
    const { data: priorD } = await db.from("fund_close_filings").select("id").eq("offering_id", req.offering_id).eq("filing_type", "form_d").eq("status", "filed").limit(1);
    const amendment = !!priorD?.length;
    const issuer = { name: off?.name ?? null, legalName: off?.legal_entity_name ?? null, entityType: off?.entity_type ?? null, exemption: off?.reg_type ?? null, minimumInvestmentCents: off?.min_investment_cents ?? null };
    const missing: string[] = [];
    if (!issuer.legalName) missing.push("Legal name");
    if (!issuer.exemption) missing.push("Exemption (506(b) or 506(c))");
    if (investors.some((i) => i.state === "UNKNOWN")) missing.push("State for one or more investors");
    const states = [...new Set(investors.filter((i) => i.state !== "UNKNOWN").map((i) => i.state))];
    const rows: any[] = [{
      close_request_id: req.id, offering_id: req.offering_id, filing_type: "form_d", jurisdiction: "SEC",
      is_amendment: amendment, investor_count: investors.length, amount_cents: total,
      fee_cents: FORM_D_HARMONIOUS_FEE_CENTS, fee_needs_review: false, prepared_by: context.userId,
      packet: { issuer, closeDate: req.target_date, totalSoldCents: total, investorCount: investors.length, states, missing, closeDetails: req.details ?? {}, feeLabel: "Harmonious Form D fee (Form D due 15 days after first sale)" },
    }];
    for (const state of states) {
      const list = investors.filter((i) => i.state === state);
      rows.push({
        close_request_id: req.id, offering_id: req.offering_id, filing_type: "blue_sky", jurisdiction: state,
        is_amendment: amendment, investor_count: list.length, amount_cents: list.reduce((a, i) => a + i.amount, 0),
        fee_cents: null, fee_needs_review: true, prepared_by: context.userId,
        packet: { issuer, state, investors: list.map((i) => ({ name: i.name, type: i.type, amountCents: i.amount })), feeNote: "State fee needs review against the current NASAA fee table." },
      });
    }
    const { error } = await db.from("fund_close_filings").upsert(rows, { onConflict: "close_request_id,filing_type,jurisdiction", ignoreDuplicates: true });
    if (error) throw new Error("Couldn't prepare the filings. Please try again.");
    await db.from("fund_close_request_events").insert({ close_request_id: req.id, actor_id: context.userId, from_status: "approved", to_status: "approved", note: `Prepared ${rows.length} filing packet(s) for manual filing.` });
    return { prepared: rows.length, missing };
  });

export const listCloseFilings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context.userId);
    const { data: rows } = await db.from("fund_close_filings").select("*").eq("close_request_id", data.id).order("filing_type", { ascending: false }).order("jurisdiction");
    return (rows ?? []) as any[];
  });

export const recordCloseFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    outcome: z.enum(["filed", "not_required"]),
    confirmationNumber: z.string().trim().max(100).optional().default(""),
    filedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    feeCents: z.number().int().min(0).max(100_000_000).optional(),
    note: z.string().trim().max(1000).optional().default(""),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context.userId);
    const { data: f } = await db.from("fund_close_filings").select("id, status, prepared_by, close_request_id, filing_type, jurisdiction, fee_needs_review").eq("id", data.id).maybeSingle();
    if (!f) throw new Error("Filing not found.");
    if (f.status !== "prepared") throw new Error("This filing is already recorded.");
    if (f.prepared_by === context.userId) throw new Error("Someone other than the preparer must record this filing.");
    if (data.outcome === "filed" && (!data.confirmationNumber || !data.filedOn)) throw new Error("Enter the confirmation number and filing date.");
    if (data.outcome === "not_required" && data.note.length < 3) throw new Error("Explain why this filing isn't required.");
    if (data.outcome === "filed" && f.fee_needs_review && data.feeCents === undefined) throw new Error("Enter the state fee that was actually paid.");
    const patch: any = { status: data.outcome, filed_by: context.userId, filed_at: new Date().toISOString(), note: data.note || null };
    if (data.outcome === "filed") { patch.confirmation_number = data.confirmationNumber; patch.filed_on = data.filedOn; }
    if (data.feeCents !== undefined) { patch.fee_cents = data.feeCents; patch.fee_needs_review = false; }
    const { data: upd } = await db.from("fund_close_filings").update(patch).eq("id", data.id).eq("status", "prepared").select("id");
    if (!upd?.length) throw new Error("This filing changed. Refresh and try again.");
    const label = f.filing_type === "form_d" ? "Form D" : `${f.jurisdiction} state filing`;
    await db.from("fund_close_request_events").insert({ close_request_id: f.close_request_id, actor_id: context.userId, from_status: "approved", to_status: "approved", note: `${label} recorded as ${data.outcome === "filed" ? "filed" : "not required"}.` });
    return { ok: true };
  });

export const getFilingForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context.userId);
    const { data: filing } = await db.from("fund_close_filings").select("*").eq("id", data.id).maybeSingle();
    if (!filing) throw new Error("Filing not found.");
    const [{ data: offering }, { data: team }, { data: req }] = await Promise.all([
      db.from("offerings").select("*").eq("id", filing.offering_id).maybeSingle(),
      db.from("fund_team_members").select("full_name, team_role").eq("offering_id", filing.offering_id).in("team_role", ["gp", "manager"]).is("removed_at", null),
      db.from("fund_close_requests").select("target_date, created_at").eq("id", filing.close_request_id).maybeSingle(),
    ]);
    const related = ((team ?? []) as any[]).map((t) => ({ name: t.full_name, role: t.team_role === "gp" ? "Promoter (General Partner / Manager)" : "Executive Officer" }));
    if (!related.length && offering?.gp_entity_name) related.push({ name: offering.gp_entity_name, role: "Promoter (General Partner / Manager)" });
    const { buildFilingForm } = await import("@/lib/filing-forms");
    return buildFilingForm({ filing, offering, related, firstSaleDate: req?.target_date ?? null });
  });
