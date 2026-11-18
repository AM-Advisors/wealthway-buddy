/**
 * Form D / Blue Sky tracker across every fund, and fund-level filing packets
 * that don't need a close request. Harmonious staff only. Nothing here files
 * with the SEC or a state or pays a fee: staff file by hand and record the
 * confirmation, and someone other than the preparer records it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

const STAFF_ROLES = ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"];
const FORM_D_HARMONIOUS_FEE_CENTS = 16000;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function staffDb(uid: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data } = await db.from("user_roles").select("role").eq("user_id", uid);
  if (!((data ?? []) as any[]).some((r) => STAFF_ROLES.includes(r.role))) throw new Error("Harmonious staff only.");
  return db;
}

export const listRegulatoryTracker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await staffDb(context.userId);
    const { soldInvestors, filingRecords, toRecords } = await import("@/lib/regulatory-tracker.server");
    const { fundFilingStatus } = await import("@/lib/regulatory-filings-model");
    const { investmentAmountCents } = await import("@/lib/investment-amounts");
    const { data: offs } = await db.from("offerings")
      .select("id, name, client_id, reg_type, form_d_responsibility, blue_sky_responsibility, first_sale_on, is_demo, consolidated_into, lifecycle_status")
      .is("consolidated_into", null);
    const funds = ((offs ?? []) as any[]).filter((o) => !o.is_demo);
    const ids = funds.map((o) => o.id);
    const [sold, recs] = await Promise.all([soldInvestors(db, ids), filingRecords(db, ids)]);
    const { data: clients } = await db.from("clients").select("id, name").in("id", [...new Set(funds.map((f) => f.client_id).filter(Boolean))]);
    const cname = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));
    const today = new Date().toISOString().slice(0, 10);
    const rows = funds.map((o) => {
      const inv = sold.filter((s) => s.offering_id === o.id);
      const close = recs.close.filter((f) => f.offering_id === o.id);
      const recorded = recs.recorded.filter((f) => f.offering_id === o.id);
      if (!inv.length && !close.length && !recorded.length && !o.first_sale_on) return null;
      const closedDates = inv.map((s) => s.closed_at).filter(Boolean).map((d: string) => d.slice(0, 10)).sort();
      const status = fundFilingStatus({
        regType: o.reg_type, formD: o.form_d_responsibility ?? null, blueSky: o.blue_sky_responsibility ?? null, firstSaleOn: o.first_sale_on ?? null,
        investors: inv.map((s) => ({ region: s.persons?.region ?? null, amountCents: investmentAmountCents(s) ?? 0 })),
        filings: toRecords(close, recorded), today,
      });
      return {
        fundId: o.id, fundName: o.name, clientName: cname.get(o.client_id) ?? null, regType: o.reg_type,
        formDResponsibility: o.form_d_responsibility ?? null, blueSkyResponsibility: o.blue_sky_responsibility ?? null,
        firstSaleOn: o.first_sale_on ?? null, suggestedFirstSaleOn: closedDates[0] ?? null, status,
      };
    }).filter(Boolean) as any[];
    const order = { overdue: 0, due_soon: 1, open: 2, done: 3, not_needed: 4 } as Record<string, number>;
    rows.sort((a, b) => order[a.status.urgency]! - order[b.status.urgency]! || String(a.fundName).localeCompare(String(b.fundName)));
    return rows;
  });

export const setFirstSaleDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ fundId: z.string().uuid(), date: day, note: z.string().trim().max(500).optional().default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context.userId);
    const { data: cur } = await db.from("offerings").select("first_sale_on").eq("id", data.fundId).maybeSingle();
    if (!cur) throw new Error("Fund not found.");
    if (data.date > new Date().toISOString().slice(0, 10)) throw new Error("The first sale date can't be in the future.");
    const now = new Date().toISOString();
    const { error } = await db.from("offerings").update({ first_sale_on: data.date, first_sale_recorded_by: context.userId, first_sale_recorded_at: now }).eq("id", data.fundId);
    if (error) throw new Error("Couldn't save the date.");
    await db.from("fund_regulatory_events").insert({ offering_id: data.fundId, actor_id: context.userId, kind: "first_sale_recorded", detail: { from: cur.first_sale_on ?? null, to: data.date, note: data.note || null } });
    return { ok: true };
  });

export const setFilingResponsibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ fundId: z.string().uuid(), who: z.enum(["harmonious", "client_counsel", "not_applicable"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context.userId);
    const { error } = await db.from("offerings").update({ form_d_responsibility: data.who, blue_sky_responsibility: data.who }).eq("id", data.fundId);
    if (error) throw new Error("Couldn't save who files.");
    await db.from("fund_regulatory_events").insert({ offering_id: data.fundId, actor_id: context.userId, kind: "responsibility_set", detail: { responsibility: data.who } });
    return { ok: true };
  });

/** Prepares Form D (if not already filed or open) and a notice for every sold state without one. */
export const prepareFundFilings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ fundId: z.string().uuid(), amendment: z.boolean().optional().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context.userId);
    const { soldInvestors, filingRecords } = await import("@/lib/regulatory-tracker.server");
    const { normalizeUsState } = await import("@/lib/regulatory-filings-model");
    const { investmentAmountCents } = await import("@/lib/investment-amounts");
    const { data: off } = await db.from("offerings").select("name, legal_entity_name, reg_type, entity_type, min_investment_cents, first_sale_on").eq("id", data.fundId).maybeSingle();
    if (!off) throw new Error("Fund not found.");
    if (off.reg_type !== "506b" && off.reg_type !== "506c") throw new Error("Form D applies to Rule 506(b) or 506(c) offerings only.");
    if (!off.first_sale_on) throw new Error("Record the date of first sale first.");
    const sold = await soldInvestors(db, [data.fundId]);
    const investors = sold.map((o) => ({ state: normalizeUsState(o.persons?.region), amount: investmentAmountCents(o) ?? 0, name: o.investment_profiles?.legal_name ?? null, type: o.investment_profiles?.profile_type ?? null }));
    const total = investors.reduce((a, i) => a + i.amount, 0);
    const { close, recorded } = await filingRecords(db, [data.fundId]);
    const dFiled = close.some((f) => f.filing_type === "form_d" && f.status === "filed") || recorded.some((f) => f.filing_type === "form_d");
    const open = (t: string, j: string) => close.some((f) => f.filing_type === t && f.jurisdiction === j && f.status === "prepared");
    const done = (j: string) => close.some((f) => f.filing_type === "blue_sky" && f.jurisdiction === j && f.status !== "prepared") || recorded.some((f) => f.filing_type === "blue_sky" && normalizeUsState(f.state) === j);
    const issuer = { name: off.name ?? null, legalName: off.legal_entity_name ?? null, entityType: off.entity_type ?? null, exemption: off.reg_type ?? null, minimumInvestmentCents: off.min_investment_cents ?? null };
    const missing: string[] = [];
    if (!issuer.legalName) missing.push("Legal name");
    const noState = investors.filter((i) => !i.state).length;
    if (noState) missing.push(`State for ${noState} investor${noState === 1 ? "" : "s"}`);
    const states = [...new Set(investors.map((i) => i.state).filter(Boolean) as string[])].sort();
    const rows: any[] = [];
    if ((!dFiled || data.amendment) && !open("form_d", "SEC")) rows.push({
      close_request_id: null, offering_id: data.fundId, filing_type: "form_d", jurisdiction: "SEC", is_amendment: dFiled,
      investor_count: investors.length, amount_cents: total, fee_cents: FORM_D_HARMONIOUS_FEE_CENTS, fee_needs_review: false, prepared_by: context.userId,
      packet: { issuer, closeDate: off.first_sale_on, totalSoldCents: total, investorCount: investors.length, states, missing, closeDetails: {}, feeLabel: "Harmonious Form D fee (Form D due 15 days after first sale)" },
    });
    for (const st of states) {
      if (open("blue_sky", st) || done(st)) continue;
      const list = investors.filter((i) => i.state === st);
      rows.push({
        close_request_id: null, offering_id: data.fundId, filing_type: "blue_sky", jurisdiction: st, is_amendment: false,
        investor_count: list.length, amount_cents: list.reduce((a, i) => a + i.amount, 0), fee_cents: null, fee_needs_review: true, prepared_by: context.userId,
        packet: { issuer, state: st, investors: list.map((i) => ({ name: i.name, type: i.type, amountCents: i.amount })), feeNote: "State fee needs review against the current NASAA fee table." },
      });
    }
    if (rows.length) {
      const { error } = await db.from("fund_close_filings").insert(rows);
      if (error) throw new Error("Couldn't prepare the filings. Refresh and try again.");
      await db.from("fund_regulatory_events").insert({ offering_id: data.fundId, actor_id: context.userId, kind: "filings_prepared", detail: { count: rows.length, jurisdictions: rows.map((r) => r.jurisdiction) } });
    }
    return { prepared: rows.length, missing };
  });

export const listFundFilings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context.userId);
    const { data: rows } = await db.from("fund_close_filings").select("*").eq("offering_id", data.fundId).order("filing_type", { ascending: false }).order("jurisdiction").order("prepared_at", { ascending: false });
    return (rows ?? []) as any[];
  });
