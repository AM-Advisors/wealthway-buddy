import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/fund-tabs.server");
const cents = z.number().int().min(-1e13).max(1e13).optional();
const SERVICE_KEY = "tax_k1";

async function investorsOf(d: any, fundId: string) {
  const { data: obs } = await d.from("investor_onboardings").select("id, person_id, investor_user_id, investment_profile_id, commitment_amount_cents, funded_amount_cents").eq("offering_id", fundId).is("removed_at", null);
  const rows = (obs ?? []) as any[];
  const ids = [...new Set(rows.map((o) => o.person_id).filter(Boolean))];
  const { data: ps } = ids.length ? await d.from("persons").select("id, legal_first_name, legal_last_name, preferred_name").in("id", ids) : { data: [] };
  const names = new Map(((ps ?? []) as any[]).map((p) => [String(p.id), p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") || "Investor"]));
  const useFunded = rows.some((o) => Number(o.funded_amount_cents ?? 0) > 0);
  return rows.map((o) => ({ onboardingId: String(o.id), name: names.get(String(o.person_id)) ?? "Investor", investorUserId: o.investor_user_id ?? null, investmentProfileId: o.investment_profile_id ?? null, basisCents: Number((useFunded ? o.funded_amount_cents : o.commitment_amount_cents) ?? 0) }));
}

export const fundK1ReportsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fundId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); const a = await s.assertFund(context.userId, data.fundId); const d = await s.db();
    const { data: rows } = await d.from("fund_report_drafts").select("id, period_start, period_end, inputs, computed, status, submitted_at, decided_at, decision_note").eq("offering_id", data.fundId).eq("kind", "k1").order("period_end", { ascending: false }).limit(20);
    return { staff: a.staff, drafts: (rows ?? []) as any[] };
  });

/** Client year totals in -> per-investor K-1 draft out. Paid with the Tax/K-1 price; Harmonious approves before tax records are written. */
export const submitK1FiguresFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    fundId: z.string().uuid(), taxYear: z.number().int().min(2000).max(2100),
    totals: z.object({ ordinary_income: cents, interest: cents, dividends: cents, st_gain: cents, lt_gain: cents, sec1231: cents, deductions: cents, distributions: cents }),
    notes: z.string().max(2000).optional(),
    paymentId: z.string().uuid().nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); const a = await s.assertFund(context.userId, data.fundId); const d = await s.db();
    const start = `${data.taxYear}-01-01`, end = `${data.taxYear}-12-31`;
    const { data: open } = await d.from("fund_report_drafts").select("id").eq("offering_id", data.fundId).eq("kind", "k1").eq("period_end", end).in("status", ["submitted", "approved"]).limit(1);
    if ((open ?? []).length) throw new Error(`A K-1 report for ${data.taxYear} is already in review or approved.`);
    let paymentId: string | null = null;
    if (!a.staff) {
      const { resolveTarget } = await import("@/lib/fund-payments.functions");
      const t = await resolveTarget(context, { kind: "service_request", answers: { offering_id: data.fundId }, serviceKeys: [SERVICE_KEY], offeringId: null });
      const pay = await import("@/lib/fund-payments.server");
      const q = await pay.buildQuote(d, { clientId: t.clientId, kind: "service_request", addOnKeys: t.addOnKeys, offeringId: null });
      const v = await pay.verifyPayment(d, { paymentId: data.paymentId, clientId: t.clientId, kind: "service_request", expected: q.items, usedFor: null, actorId: context.userId });
      paymentId = v?.id ?? null;
    }
    const { allocateK1 } = await import("@/lib/k1-report-model");
    const computed = allocateK1(data.totals, await investorsOf(d, data.fundId));
    const { data: row, error } = await d.from("fund_report_drafts").insert({
      offering_id: data.fundId, kind: "k1", period_start: start, period_end: end,
      inputs: { ...data.totals, taxYear: data.taxYear, notes: data.notes }, computed, payment_id: paymentId, submitted_by: context.userId,
    }).select("id").single();
    if (error) throw new Error("Couldn't save the K-1 report.");
    if (paymentId) { const pay = await import("@/lib/fund-payments.server"); await pay.markPaymentUsed(d, paymentId, `fund_report:${row.id}`, context.userId); }
    return { ok: true };
  });

/** Harmonious approval writes draft K-1s into the fund's tax year (status draft; tax team still reviews and delivers). Nothing is filed. */
export const decideK1ReportFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().max(2000).optional() }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); if (!(await s.isStaff(context.userId))) throw new Error("Only Harmonious can approve K-1 reports.");
    const d = await s.db();
    const { data: r } = await d.from("fund_report_drafts").select("*").eq("id", data.id).eq("kind", "k1").maybeSingle();
    if (!r || (r as any).status !== "submitted") throw new Error("This K-1 report isn't waiting for review.");
    if ((r as any).submitted_by === context.userId) throw new Error("A different person must review figures you entered.");
    if (!data.approve && !data.note?.trim()) throw new Error("Add a note explaining what to fix.");
    const rep = r as any; const now = new Date().toISOString();
    let recorded = 0, skipped = 0;
    if (data.approve) {
      const taxYear = Number(rep.inputs?.taxYear);
      let { data: ty } = await d.from("tax_years").select("id").eq("offering_id", rep.offering_id).eq("tax_year", taxYear).maybeSingle();
      if (!ty) {
        const ins = await d.from("tax_years").insert({ scope: "entity", offering_id: rep.offering_id, tax_year: taxYear, period_start: rep.period_start, period_end: rep.period_end, status: "not_started", opened_by: context.userId }).select("id").single();
        if (ins.error) throw new Error("Couldn't open the fund's tax year.");
        ty = ins.data;
      }
      const { data: existing } = await d.from("k1_forms").select("investor_user_id, investment_profile_id, status").eq("tax_year_id", (ty as any).id);
      const live = ((existing ?? []) as any[]).filter((k) => !["superseded", "amended"].includes(k.status));
      const { recordTaxEvent } = await import("@/lib/tax-authz.server");
      for (const l of (rep.computed?.lines ?? []) as any[]) {
        if (!l.investorUserId || live.some((k) => k.investor_user_id === l.investorUserId && k.investment_profile_id === l.investmentProfileId)) { skipped++; continue; }
        const { data: k, error } = await d.from("k1_forms").insert({
          tax_year_id: (ty as any).id, offering_id: rep.offering_id, tax_year: taxYear, investor_user_id: l.investorUserId, investment_profile_id: l.investmentProfileId,
          boxes: l.boxes, outside_basis_available: false, status: "draft", version: 1, prepared_by: rep.submitted_by, prepared_at: rep.submitted_at,
          source_manifest: { source: "fund_k1_report", reportId: rep.id, onboardingId: l.onboardingId, sharePct: l.sharePct, approvedBy: context.userId, approvedAt: now },
        }).select("id").single();
        if (error) throw new Error("Couldn't record a K-1 in the tax records.");
        recorded++;
        await recordTaxEvent({ subjectTable: "k1_forms", subjectId: k.id, taxYear, offeringId: rep.offering_id, event: "k1_drafted_from_fund_report", toStatus: "draft", detail: { reportId: rep.id }, actorUserId: context.userId });
      }
    }
    const note = [data.note?.trim(), data.approve ? `${recorded} K-1 draft(s) added to tax records${skipped ? `, ${skipped} skipped (already exists or investor not signed in)` : ""}.` : null].filter(Boolean).join(" ");
    const { error } = await d.from("fund_report_drafts").update({ status: data.approve ? "approved" : "returned", decided_by: context.userId, decided_at: now, decision_note: note || null }).eq("id", data.id).eq("status", "submitted");
    if (error) throw new Error("Couldn't save the decision.");
    return { ok: true, recorded, skipped };
  });
