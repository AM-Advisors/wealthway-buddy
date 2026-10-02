import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/fund-tabs.server");
const fund = z.object({ fundId: z.string().uuid() });
const uuid = z.string().uuid();

export const investorGridFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.investorGrid(data.fundId); });

export const investorDetailFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.extend({ onboardingId: uuid }).parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.investorDetail(data.fundId, data.onboardingId); });

export const fundTeamFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.parse)
  .handler(async ({ data, context }) => { const s = await srv(); const a = await s.assertFund(context.userId, data.fundId); return { ...(await s.team(data.fundId)), staff: a.staff, me: context.userId }; });

export const saveTeamMemberFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({
    id: uuid.nullable(),
    fullName: z.string().trim().min(2).max(200), email: z.string().trim().email().max(320).or(z.literal("")),
    phone: z.string().trim().max(40), company: z.string().trim().max(200),
    teamRole: z.enum(["gp", "manager", "member", "counsel", "auditor", "tax_preparer", "accountant"]),
    permissions: z.array(z.enum(["authorized_signatory", "view", "edit", "documents", "banking", "investors"])).max(10),
  }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId);
    const d = await s.db();
    const row = { full_name: data.fullName, email: data.email || null, phone: data.phone || null, company: data.company || null, team_role: data.teamRole, permissions: data.permissions };
    if (data.id) {
      const { data: cur } = await d.from("fund_team_members").select("user_id").eq("id", data.id).maybeSingle();
      const confirm = (cur as any)?.user_id === context.userId ? { roles_confirmed_at: new Date().toISOString() } : {};
      const { error } = await d.from("fund_team_members").update({ ...row, ...confirm }).eq("id", data.id).eq("offering_id", data.fundId).is("removed_at", null);
      if (error) throw new Error("Couldn't save.");
    } else {
      const { error } = await d.from("fund_team_members").insert({ ...row, offering_id: data.fundId, created_by: context.userId });
      if (error) throw new Error("Couldn't save.");
    }
    return { ok: true };
  });

export const removeTeamMemberFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.extend({ id: uuid }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId);
    await (await s.db()).from("fund_team_members").update({ removed_at: new Date().toISOString(), removed_by: context.userId }).eq("id", data.id).eq("offering_id", data.fundId);
    return { ok: true };
  });

const pct = z.number().min(0).max(100).nullable();
export const setFeesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ managementFeePct: pct, managementFeeBasis: z.string().max(200), carryPct: pct, hurdlePct: pct, notes: z.string().max(2000) }).parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.setFees(context.userId, data.fundId, data); });

export const decideFeesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ feeId: uuid, approve: z.boolean() }).parse)
  .handler(async ({ data, context }) => (await srv()).decideFees(context.userId, data.feeId, data.approve));

export const listFundFilesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.listFiles(data.fundId); });

export const uploadFundFileFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ title: z.string().trim().min(1).max(200), category: z.string().max(40), fileName: z.string().min(1).max(200), contentType: z.string().max(120), base64: z.string().max(28_000_000) }).parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.uploadFile(context.userId, data.fundId, data); });

export const deleteFundFileFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.extend({ id: uuid }).parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.deleteFile(context.userId, data.fundId, data.id); });

export const setSignatureBoxesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ id: uuid, boxes: z.array(z.object({ signer: z.string().trim().min(1).max(200), role: z.string().max(60), label: z.string().max(200) })).max(20) }).parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.setSignatureBoxes(data.fundId, data.id, data.boxes); });

export const generateFundDocFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ templateKey: z.string().max(60), values: z.record(z.string(), z.string().max(2000)) }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId);
    const { renderTemplate } = await import("@/lib/fund-doc-templates");
    const r = renderTemplate(data.templateKey, data.values);
    return s.saveGenerated(context.userId, data.fundId, { templateKey: data.templateKey, ...r });
  });

export const fundBooksFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.books(data.fundId); });

export const tagTransactionFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ bankTransactionId: uuid, onboardingId: uuid.nullable(), assetLabel: z.string().max(200).nullable() }).parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.tagTransaction(context.userId, data.fundId, data); });

export const addLedgerEntryFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string().trim().min(2).max(300), category: z.string().max(80), direction: z.enum(["in", "out"]), amountCents: z.number().int().positive().max(1e13), bankTransactionId: uuid.nullable() }).parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.addEntry(context.userId, data.fundId, data); });

export const voidLedgerEntryFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ id: uuid, reason: z.string().trim().min(3).max(500) }).parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.voidEntry(context.userId, data.fundId, data.id, data.reason); });

export const lastRemindersFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.lastReminders(data.fundId); });

export const sendInvestorRemindersFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ onboardingIds: z.array(uuid).min(1).max(100) }).parse)
  .handler(async ({ data, context }) => { const s = await srv(); await s.assertFund(context.userId, data.fundId); return s.sendReminders(context.userId, data.fundId, data.onboardingIds); });

/** Fund EIN: only Harmonious staff and the fund's managers. The database RPC re-checks authority as the caller. */
export const fundEinFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ reveal: z.boolean().default(false) }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); const a = await s.assertFund(context.userId, data.fundId);
    const d = await s.db();
    if (!a.staff) {
      const { data: mgr } = await d.from("fund_managers").select("id").eq("user_id", context.userId).eq("offering_id", data.fundId).maybeSingle();
      const { data: tm } = await d.from("fund_team_members").select("id").eq("user_id", context.userId).eq("offering_id", data.fundId).in("team_role", ["gp", "manager"]).is("removed_at", null).maybeSingle();
      if (!mgr && !tm) return { allowed: false as const };
    }
    const { data: row, error } = await (context.supabase as any).rpc("get_offering_entity_details", { p_offering_id: data.fundId }).maybeSingle();
    if (error) return { allowed: false as const };
    const r = (row ?? {}) as any;
    const ein = String(r.ein ?? "").replace(/\D/g, "");
    if (!ein) return { allowed: true as const, status: "not_recorded" as const };
    if (!a.staff && r.ein_review_status !== "approved") return { allowed: true as const, status: "in_review" as const };
    const fmt = `${ein.slice(0, 2)}-${ein.slice(2)}`;
    return { allowed: true as const, status: "recorded" as const, ein: data.reveal ? fmt : `••-•••${ein.slice(-4)}` };
  });

/** Account tab: approved financial statements, financial reviews and NAV for this fund (read-only). */
export const fundAccountFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId);
    const d = await s.db();
    const [st, rv, nav] = await Promise.all([
      d.from("financial_statement_packages").select("id, period_type, period_start, period_end, status, approved_at").eq("offering_id", data.fundId).order("period_end", { ascending: false }).limit(24),
      d.from("financial_review_memos").select("id, title, period_start, period_end, status, decided_at").eq("offering_id", data.fundId).order("period_end", { ascending: false }).limit(24),
      d.from("nav_versions").select("id, as_of_date, period_label, status, net_asset_value_cents, cash_cents, investments_fair_value_cents, receivables_cents, other_assets_cents, total_liabilities_cents, nav_per_unit_cents").eq("offering_id", data.fundId).is("superseded_by_id", null).in("status", ["approved", "published"]).order("as_of_date", { ascending: true }).limit(24),
    ]);
    return { statements: (st.data ?? []) as any[], reviews: (rv.data ?? []) as any[], nav: (nav.data ?? []) as any[] };
  });
