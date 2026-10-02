import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const SERVICE_KEY = { nav: "nav_reporting", financial_review: "financial_review" } as const;
const srv = () => import("@/lib/fund-tabs.server");
const cents = z.number().int().min(-1e13).max(1e13).optional();

export const fundReportsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fundId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); const a = await s.assertFund(context.userId, data.fundId); const d = await s.db();
    const [{ data: set }, { data: drafts }] = await Promise.all([
      d.from("fund_report_settings").select("frequency").eq("offering_id", data.fundId).maybeSingle(),
      d.from("fund_report_drafts").select("id, kind, period_start, period_end, inputs, computed, status, submitted_at, decided_at, decision_note").eq("offering_id", data.fundId).order("period_end", { ascending: false }).limit(48),
    ]);
    return { staff: a.staff, frequency: ((set as any)?.frequency ?? "quarterly") as "monthly" | "quarterly", drafts: (drafts ?? []) as any[] };
  });

export const setReportFrequencyFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fundId: z.string().uuid(), frequency: z.enum(["monthly", "quarterly"]) }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId); const d = await s.db();
    const { error } = await d.from("fund_report_settings").upsert({ offering_id: data.fundId, frequency: data.frequency, updated_by: context.userId, updated_at: new Date().toISOString() });
    if (error) throw new Error("Couldn't save the frequency.");
    return { ok: true };
  });

/** Client figures in -> platform-built draft out. Paid items need a confirmed payment; Harmonious approves before it is final. */
export const submitReportFiguresFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    fundId: z.string().uuid(), kind: z.enum(["nav", "financial_review"]),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    inputs: z.object({
      cash: cents, investments_fv: cents, investments_cost: cents, receivables: cents, other_assets: cents, liabilities: cents,
      contributions: cents, distributions: cents, income: cents, management_fee: cents, fund_expenses: cents,
      units: z.number().positive().max(1e12).nullable().optional(), notes: z.string().max(2000).optional(),
    }),
    paymentId: z.string().uuid().nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    if (data.periodEnd < data.periodStart) throw new Error("The period end must be after the start.");
    const s = await srv(); const a = await s.assertFund(context.userId, data.fundId); const d = await s.db();
    let paymentId: string | null = null;
    if (!a.staff) {
      const { resolveTarget } = await import("@/lib/fund-payments.functions");
      const t = await resolveTarget(context, { kind: "service_request", answers: { offering_id: data.fundId }, serviceKeys: [SERVICE_KEY[data.kind]], offeringId: null });
      const pay = await import("@/lib/fund-payments.server");
      const q = await pay.buildQuote(d, { clientId: t.clientId, kind: "service_request", addOnKeys: t.addOnKeys, offeringId: null });
      const v = await pay.verifyPayment(d, { paymentId: data.paymentId, clientId: t.clientId, kind: "service_request", expected: q.items, usedFor: null, actorId: context.userId });
      paymentId = v?.id ?? null;
    }
    const { computeNav, computeReview, monthsBetween } = await import("@/lib/fund-report-model");
    const { data: prior } = await d.from("fund_report_drafts").select("computed").eq("offering_id", data.fundId).eq("status", "approved").lt("period_end", data.periodStart).order("period_end", { ascending: false }).limit(1).maybeSingle();
    const priorNav = (prior as any)?.computed?.navCents ?? null;
    let computed: Record<string, unknown>;
    if (data.kind === "nav") computed = computeNav(data.inputs, priorNav);
    else {
      const { data: fee } = await d.from("fund_fee_terms").select("management_fee_pct").eq("offering_id", data.fundId).eq("status", "active").maybeSingle();
      const { data: ob } = await d.from("investor_onboardings").select("commitment_cents").eq("offering_id", data.fundId).is("removed_at", null);
      const committed = ((ob ?? []) as any[]).reduce((t, o) => t + Number(o.commitment_cents ?? 0), 0);
      computed = computeReview(data.inputs, priorNav, (fee as any)?.management_fee_pct ?? null, committed || null, monthsBetween(data.periodStart, data.periodEnd));
    }
    const { data: row, error } = await d.from("fund_report_drafts").insert({
      offering_id: data.fundId, kind: data.kind, period_start: data.periodStart, period_end: data.periodEnd,
      inputs: data.inputs, computed, payment_id: paymentId, submitted_by: context.userId,
    }).select("id").single();
    if (error) throw new Error("Couldn't save the figures.");
    if (paymentId) { const pay = await import("@/lib/fund-payments.server"); await pay.markPaymentUsed(d, paymentId, `fund_report:${row.id}`, context.userId); }
    return { id: row.id as string };
  });

/** Harmonious staff approve or return a draft. The submitter can never approve their own. */
export const decideReportFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().max(2000).optional() }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); if (!(await s.isStaff(context.userId))) throw new Error("Only Harmonious can approve reports.");
    const d = await s.db();
    const { data: r } = await d.from("fund_report_drafts").select("id, status, submitted_by").eq("id", data.id).maybeSingle();
    if (!r || (r as any).status !== "submitted") throw new Error("This report isn't waiting for review.");
    if ((r as any).submitted_by === context.userId) throw new Error("A different person must review figures you entered.");
    if (!data.approve && !data.note?.trim()) throw new Error("Add a note explaining what to fix.");
    const { error } = await d.from("fund_report_drafts").update({ status: data.approve ? "approved" : "returned", decided_by: context.userId, decided_at: new Date().toISOString(), decision_note: data.note?.trim() || null }).eq("id", data.id).eq("status", "submitted");
    if (error) throw new Error("Couldn't save the decision.");
    return { ok: true };
  });
